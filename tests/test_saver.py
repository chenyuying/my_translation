import pytest
from ccbridge.saver import slugify, safe_output_paths


def test_slugify_basic():
    assert slugify("Hello World", "2026-06-08") == "2026-06-08-hello-world"


def test_slugify_strips_non_alnum():
    assert slugify("AI 化：Claude Code!!!", "2026-06-08") == "2026-06-08-ai-code"


def test_slugify_collapses_and_trims_dashes():
    assert slugify("  a   b  ", "2026-06-08") == "2026-06-08-a-b"


def test_slugify_empty_title_falls_back():
    # 全中文標題去掉後為空 → 用 untitled
    assert slugify("純中文標題", "2026-06-08") == "2026-06-08-untitled"


def test_safe_output_paths_within_translated_dir(tmp_path):
    md, html = safe_output_paths(str(tmp_path), "2026-06-08-hello")
    base = (tmp_path / "raw" / "translated").resolve()
    assert md == base / "2026-06-08-hello.md"
    assert html == base / "2026-06-08-hello.html"


def test_safe_output_paths_rejects_traversal(tmp_path):
    with pytest.raises(ValueError):
        safe_output_paths(str(tmp_path), "../../etc/passwd")


def test_safe_output_paths_rejects_slash(tmp_path):
    with pytest.raises(ValueError):
        safe_output_paths(str(tmp_path), "foo/bar")


from ccbridge.saver import sanitize_html


def test_sanitize_removes_script_tags():
    html = "<html><head></head><body><p>hi</p><script>alert(1)</script></body></html>"
    out = sanitize_html(html, "https://example.com/article")
    assert "<script" not in out.lower()
    assert "alert(1)" not in out


def test_sanitize_removes_inline_event_handlers():
    html = '<html><body><div onclick="steal()">x</div></body></html>'
    out = sanitize_html(html, "https://example.com")
    assert "onclick" not in out.lower()
    assert "x" in out  # 內容保留


def test_sanitize_removes_javascript_urls():
    html = '<html><body><a href="javascript:evil()">link</a></body></html>'
    out = sanitize_html(html, "https://example.com")
    assert "javascript:" not in out.lower()


def test_sanitize_injects_base_href_for_relative_resources():
    html = "<html><head><title>t</title></head><body></body></html>"
    out = sanitize_html(html, "https://example.com/path/")
    assert '<base' in out.lower()
    assert "https://example.com/path/" in out


def test_sanitize_keeps_existing_css_and_images():
    html = (
        '<html><head><link rel="stylesheet" href="/style.css"></head>'
        '<body><img src="/pic.png"><p>內容</p></body></html>'
    )
    out = sanitize_html(html, "https://example.com")
    assert "style.css" in out
    assert "pic.png" in out
    assert "內容" in out


from ccbridge.saver import build_md, write_outputs


def test_build_md_contains_frontmatter_and_summary():
    md = build_md(
        title="The Title",
        url="https://example.com/a",
        slug="2026-06-08-the-title",
        summary="這是摘要。",
        date="2026-06-08",
    )
    assert 'title: "The Title"' in md
    assert "source: https://example.com/a" in md
    assert "translated: 2026-06-08" in md
    assert "translated" in md  # tags 含 translated
    assert "這是摘要。" in md
    # 連到雙語 HTML 附檔
    assert "[[2026-06-08-the-title.html]]" in md


def test_write_outputs_writes_both_files(tmp_path):
    md_path, html_path = write_outputs(
        vault_path=str(tmp_path),
        slug="2026-06-08-hello",
        md_content="# md",
        html_content="<html></html>",
    )
    assert md_path.read_text(encoding="utf-8") == "# md"
    assert html_path.read_text(encoding="utf-8") == "<html></html>"
    assert md_path.parent == (tmp_path / "raw" / "translated").resolve()


def test_write_outputs_creates_dir_if_missing(tmp_path):
    # raw/translated 尚不存在
    md_path, _ = write_outputs(
        vault_path=str(tmp_path),
        slug="2026-06-08-x",
        md_content="x",
        html_content="x",
    )
    assert md_path.exists()
