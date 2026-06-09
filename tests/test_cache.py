from ccbridge.cache import Cache


def test_put_then_get_returns_translation(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    cache.put("hash1", "正體中文", "譯文一")
    assert cache.get("hash1", "正體中文") == "譯文一"


def test_get_missing_returns_none(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    assert cache.get("nope", "正體中文") is None


def test_get_is_lang_scoped(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    cache.put("hash1", "正體中文", "中文")
    assert cache.get("hash1", "English") is None


def test_put_is_idempotent_overwrite(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    cache.put("hash1", "正體中文", "舊")
    cache.put("hash1", "正體中文", "新")
    assert cache.get("hash1", "正體中文") == "新"


def test_get_many_returns_only_hits(tmp_path):
    cache = Cache(tmp_path / "c.sqlite3")
    cache.put("a", "正體中文", "甲")
    cache.put("b", "正體中文", "乙")
    result = cache.get_many(["a", "b", "c"], "正體中文")
    assert result == {"a": "甲", "b": "乙"}


def test_persists_across_instances(tmp_path):
    db = tmp_path / "c.sqlite3"
    Cache(db).put("a", "正體中文", "甲")
    assert Cache(db).get("a", "正體中文") == "甲"
