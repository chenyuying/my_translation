import json
import pytest
from ccbridge.app import create_app
from ccbridge.config import Config
from ccbridge.cache import Cache


def make_config(tmp_path, **kw):
    base = dict(token="secret", claude_cmd=["claude"])
    base.update(kw)
    return Config(**base)


@pytest.fixture
def client(tmp_path):
    cfg = make_config(tmp_path)
    cache = Cache(tmp_path / "c.sqlite3")
    # runner 在各測試以 app.config 注入；此處給預設不被呼叫
    app = create_app(cfg, cache, runner=lambda *a, **k: None)
    app.testing = True
    return app.test_client()


def test_health_needs_no_token(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json()["ok"] is True


def test_translate_rejects_missing_token(client):
    resp = client.post("/translate", json={"url": "u", "title": "t", "segments": []})
    assert resp.status_code == 401


def test_translate_rejects_wrong_token(client):
    resp = client.post(
        "/translate",
        json={"url": "u", "title": "t", "segments": []},
        headers={"X-CC-Token": "wrong"},
    )
    assert resp.status_code == 401


def test_translate_rejects_non_extension_origin(client):
    resp = client.post(
        "/translate",
        json={"url": "u", "title": "t", "segments": []},
        headers={"X-CC-Token": "secret", "Origin": "https://evil.com"},
    )
    assert resp.status_code == 403


class FakeCompleted:
    def __init__(self, stdout):
        self.stdout = stdout
        self.stderr = ""
        self.returncode = 0


def _parse_ndjson(resp):
    """把 streaming 回應的 body 拆成事件 list。"""
    text = resp.get_data(as_text=True)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def test_translate_streams_batches_then_summary(tmp_path):
    cfg = make_config(tmp_path, target_lang="正體中文")
    cache = Cache(tmp_path / "c.sqlite3")

    def fake_runner(cmd, input, capture_output, text, timeout):
        if "summarize" in input.lower():
            return FakeCompleted('{"summary": "整頁摘要"}')
        return FakeCompleted('{"translations": [{"id": "s1", "translation": "你好"}]}')

    app = create_app(cfg, cache, runner=fake_runner)
    app.testing = True
    client = app.test_client()

    resp = client.post(
        "/translate",
        json={"url": "https://e.com", "title": "t", "segments": [{"id": "s1", "text": "Hello"}]},
        headers={"X-CC-Token": "secret", "Origin": "chrome-extension://abc"},
    )
    assert resp.status_code == 200
    assert resp.mimetype == "application/x-ndjson"
    events = _parse_ndjson(resp)
    # 逐批事件 + 一個 summary 事件
    batches = [e for e in events if e["type"] == "batch"]
    summaries = [e for e in events if e["type"] == "summary"]
    assert [t for b in batches for t in b["translations"]] == [
        {"id": "s1", "translation": "你好"}
    ]
    assert summaries == [{"type": "summary", "summary": "整頁摘要"}]
