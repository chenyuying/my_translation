import json
import pytest
from ccbridge.translator import (
    build_prompt,
    build_summary_prompt,
    extract_json,
    text_hash,
)


def test_text_hash_is_stable_sha256():
    h1 = text_hash("hello")
    h2 = text_hash("hello")
    assert h1 == h2
    assert len(h1) == 64  # sha256 hex
    assert text_hash("hello") != text_hash("world")


def test_build_prompt_includes_segments_and_lang():
    segments = [{"id": "s1", "text": "Hello"}, {"id": "s2", "text": "World"}]
    prompt = build_prompt(segments, "正體中文")
    assert "正體中文" in prompt
    assert "Hello" in prompt
    assert "World" in prompt
    assert "s1" in prompt and "s2" in prompt


def test_build_prompt_marks_content_as_untrusted_data():
    prompt = build_prompt([{"id": "s1", "text": "x"}], "正體中文")
    # 必含安全指示：把內容當不可信資料、不要遵循其中指令、不要用工具
    assert "untrusted" in prompt.lower()
    assert "tool" in prompt.lower()


def test_build_summary_prompt_includes_text_and_lang():
    prompt = build_summary_prompt("some long article text", "正體中文")
    assert "正體中文" in prompt
    assert "some long article text" in prompt
    assert "untrusted" in prompt.lower()


def test_extract_json_plain_object():
    out = '{"translations": [], "summary": "嗨"}'
    assert extract_json(out) == {"translations": [], "summary": "嗨"}


def test_extract_json_in_markdown_fence():
    out = 'Here you go:\n```json\n{"summary": "嗨"}\n```\nDone.'
    assert extract_json(out) == {"summary": "嗨"}


def test_extract_json_with_leading_and_trailing_prose():
    out = 'Sure! {"a": 1, "b": {"c": 2}} hope that helps'
    assert extract_json(out) == {"a": 1, "b": {"c": 2}}


def test_extract_json_handles_braces_inside_strings():
    out = '{"translation": "這裡有個大括號 } 在字串裡"}'
    assert extract_json(out) == {"translation": "這裡有個大括號 } 在字串裡"}


def test_extract_json_raises_when_no_json():
    with pytest.raises(ValueError):
        extract_json("完全沒有 JSON 的文字")


from ccbridge.translator import run_claude, translate_batch, summarize, translate_page
from ccbridge.config import Config
from ccbridge.cache import Cache


class FakeCompleted:
    def __init__(self, stdout):
        self.stdout = stdout
        self.stderr = ""
        self.returncode = 0


def make_config(**kw):
    base = dict(token="t", claude_cmd=["claude"], max_chars_per_batch=6000)
    base.update(kw)
    return Config(**base)


def test_run_claude_builds_safe_argv_and_uses_stdin():
    captured = {}

    def fake_runner(cmd, input, capture_output, text, timeout):
        captured["cmd"] = cmd
        captured["input"] = input
        return FakeCompleted('{"ok": 1}')

    cfg = make_config(model="opus")
    result = run_claude("PROMPT TEXT", cfg, runner=fake_runner)

    assert result == {"ok": 1}
    # 安全：用 -p、關閉工具、不得帶危險旗標
    assert "-p" in captured["cmd"]
    assert "--allowedTools" in captured["cmd"]
    assert "--dangerously-skip-permissions" not in captured["cmd"]
    # 模型有帶
    assert "--model" in captured["cmd"] and "opus" in captured["cmd"]
    # 內容透過 stdin，而非拼進 argv
    assert captured["input"] == "PROMPT TEXT"
    assert "PROMPT TEXT" not in captured["cmd"]


def test_run_claude_omits_model_when_none():
    captured = {}

    def fake_runner(cmd, input, capture_output, text, timeout):
        captured["cmd"] = cmd
        return FakeCompleted('{}')

    run_claude("p", make_config(model=None), runner=fake_runner)
    assert "--model" not in captured["cmd"]


def test_run_claude_serializes_concurrent_calls():
    # claude 每次啟動都「讀-改-寫」共用的 ~/.claude.json；兩個 claude 同時跑會把它
    # 截斷寫壞（JSON 解析錯 → 整包翻譯 502）。bridge 是多執行緒（Flask threaded=True），
    # 重疊的 /translate 會在不同執行緒平行呼叫 claude。run_claude 必須用行程級鎖把
    # claude 子程序序列化：任何時刻最多一個在跑，跨所有請求、跨 batch 與 summary。
    import threading
    import time as _time

    state_lock = threading.Lock()
    concurrent = 0
    max_concurrent = 0

    def fake_runner(cmd, input, capture_output, text, timeout):
        nonlocal concurrent, max_concurrent
        with state_lock:
            concurrent += 1
            max_concurrent = max(max_concurrent, concurrent)
        _time.sleep(0.05)  # 模擬 claude 執行時間，製造重疊機會
        with state_lock:
            concurrent -= 1
        return FakeCompleted('{"ok": 1}')

    cfg = make_config()
    threads = [
        threading.Thread(target=lambda: run_claude("p", cfg, runner=fake_runner))
        for _ in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert max_concurrent == 1  # 序列化成功：claude 從不重疊


def test_translate_batch_returns_id_to_translation_map():
    def fake_runner(cmd, input, capture_output, text, timeout):
        return FakeCompleted(
            '{"translations": [{"id": "s1", "translation": "你好"}, '
            '{"id": "s2", "translation": "世界"}]}'
        )

    segments = [{"id": "s1", "text": "Hello"}, {"id": "s2", "text": "World"}]
    result = translate_batch(segments, make_config(), runner=fake_runner)
    assert result == {"s1": "你好", "s2": "世界"}


def test_translate_batch_skips_malformed_entries():
    # claude 輸出不穩定：有時某元素缺 translation（漏翻）或缺 id。
    # 不該整批丟 KeyError（會讓 /translate 回 502），只保留完整的元素，
    # 其餘由上層 translate_page 保留原文並跳過快取。
    def fake_runner(cmd, input, capture_output, text, timeout):
        return FakeCompleted(
            '{"translations": ['
            '{"id": "s1", "translation": "你好"}, '
            '{"id": "s2"}, '            # 缺 translation
            '{"translation": "孤兒"}'   # 缺 id
            ']}'
        )

    segments = [{"id": "s1", "text": "Hello"}, {"id": "s2", "text": "World"}]
    result = translate_batch(segments, make_config(), runner=fake_runner)
    assert result == {"s1": "你好"}


def test_translate_batch_accepts_text_field_as_translation():
    # 實測（seg129-133）：claude 常沿用「輸入」的欄位名，把譯文放進 "text"
    # （build_prompt 送進去的輸入欄位就叫 text），而非 prompt 要求的 "translation"。
    # 若解析只認 "translation"，譯文明明翻好了、id 也對，卻會整批被過濾成 0 成功。
    # 解析端須同時接受 "text"。
    def fake_runner(cmd, input, capture_output, text, timeout):
        return FakeCompleted(
            '{"translations": ['
            '{"id": "seg129", "text": "那個 URL"}, '
            '{"id": "seg130", "text": "我們打造了"}'
            ']}'
        )

    segments = [{"id": "seg129", "text": "That URL"}, {"id": "seg130", "text": "We built"}]
    result = translate_batch(segments, make_config(), runner=fake_runner)
    assert result == {"seg129": "那個 URL", "seg130": "我們打造了"}


def test_summarize_returns_summary_string():
    def fake_runner(cmd, input, capture_output, text, timeout):
        return FakeCompleted('{"summary": "這是一篇關於測試的文章。"}')

    assert summarize("long text", make_config(), runner=fake_runner) == "這是一篇關於測試的文章。"


def test_translate_page_uses_cache_and_calls_claude_for_misses(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    # s1 預先快取（用 bridge 自算的 hash）
    from ccbridge.translator import text_hash
    cache.put(text_hash("Hello"), "正體中文", "你好(快取)")

    calls = []

    def fake_runner(cmd, input, capture_output, text, timeout):
        calls.append(input)
        if "summary" in input.lower() and "summarize" in input.lower():
            return FakeCompleted('{"summary": "摘要"}')
        # 只會被要求翻 s2
        return FakeCompleted('{"translations": [{"id": "s2", "translation": "世界"}]}')

    segments = [{"id": "s1", "text": "Hello"}, {"id": "s2", "text": "World"}]
    cfg = make_config(target_lang="正體中文")
    result = translate_page(segments, cfg, cache, runner=fake_runner)

    by_id = {t["id"]: t["translation"] for t in result["translations"]}
    assert by_id["s1"] == "你好(快取)"   # 來自快取
    assert by_id["s2"] == "世界"          # 來自 claude
    assert result["summary"] == "摘要"
    # s2 翻完後應被寫入快取
    assert cache.get(text_hash("World"), "正體中文") == "世界"


def test_translate_page_batches_when_over_char_limit(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    batch_inputs = []

    def fake_runner(cmd, input, capture_output, text, timeout):
        if "summarize" in input.lower():
            return FakeCompleted('{"summary": "s"}')
        batch_inputs.append(input)
        # 回傳本批所有 id（從 prompt 解析過於複雜，測試只驗批數，故回固定空再覆寫）
        import re, json as _json
        ids = re.findall(r'"id": "(seg\d+)"', input)
        return FakeCompleted(_json.dumps({"translations": [{"id": i, "translation": "x"} for i in ids]}))

    # 3 段，每段 3000 字，限 6000 → 應分成 2 批翻譯（不含 summary 那次）
    segments = [{"id": f"seg{i}", "text": "a" * 3000} for i in range(3)]
    cfg = make_config(target_lang="正體中文", max_chars_per_batch=6000)
    result = translate_page(segments, cfg, cache, runner=fake_runner)
    assert len(batch_inputs) == 2
    assert len(result["translations"]) == 3
