import json
import pytest
from ccbridge.app import create_app
from ccbridge.config import Config
from ccbridge.cache import Cache


def make_config(tmp_path, **kw):
    base = dict(token="secret", vault_path=str(tmp_path), claude_cmd=["claude"])
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


def test_translate_returns_translations_and_summary(tmp_path):
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
    data = resp.get_json()
    assert data["translations"] == [{"id": "s1", "translation": "你好"}]
    assert data["summary"] == "整頁摘要"


def test_save_writes_files_and_returns_paths(tmp_path):
    cfg = make_config(tmp_path)
    cache = Cache(tmp_path / "c.sqlite3")
    app = create_app(cfg, cache, runner=lambda *a, **k: None)
    app.testing = True
    client = app.test_client()

    resp = client.post(
        "/save",
        json={
            "url": "https://example.com/article",
            "title": "My Article",
            "html": "<html><body><p>hi</p><script>x()</script></body></html>",
            "summary": "摘要內容",
        },
        headers={"X-CC-Token": "secret", "Origin": "chrome-extension://abc"},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    # 檔案確實寫出，且 script 已被移除
    from pathlib import Path
    html_text = Path(data["html_path"]).read_text(encoding="utf-8")
    assert "<script" not in html_text.lower()
    md_text = Path(data["md_path"]).read_text(encoding="utf-8")
    assert "摘要內容" in md_text


def test_save_rejects_blacklisted_url(tmp_path):
    cfg = make_config(tmp_path, blacklist=["bank.com"])
    cache = Cache(tmp_path / "c.sqlite3")
    app = create_app(cfg, cache, runner=lambda *a, **k: None)
    app.testing = True
    client = app.test_client()

    resp = client.post(
        "/save",
        json={"url": "https://bank.com/x", "title": "t", "html": "<html></html>", "summary": ""},
        headers={"X-CC-Token": "secret", "Origin": "chrome-extension://abc"},
    )
    assert resp.status_code == 403
