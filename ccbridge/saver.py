import re
from pathlib import Path

from bs4 import BeautifulSoup

_SLUG_ALLOWED = re.compile(r"[^a-z0-9]+")
_VALID_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def slugify(title: str, date: str) -> str:
    """date 形如 YYYY-MM-DD；產出 <date>-<slug>，slug 只含小寫英數與 -。"""
    base = _SLUG_ALLOWED.sub("-", title.lower()).strip("-")
    if not base:
        base = "untitled"
    return f"{date}-{base}"


def safe_output_paths(vault_path: str, slug: str) -> tuple[Path, Path]:
    """回傳 (md_path, html_path)，並確保兩者 resolve 後仍位於 raw/translated/ 內。"""
    if not _VALID_SLUG.match(slug):
        raise ValueError(f"Unsafe slug: {slug!r}")
    base = (Path(vault_path) / "raw" / "translated").resolve()
    md = (base / f"{slug}.md").resolve()
    html = (base / f"{slug}.html").resolve()
    for p in (md, html):
        if base not in p.parents:
            raise ValueError(f"Path escapes translated dir: {p}")
    return md, html


def sanitize_html(html: str, base_url: str) -> str:
    """移除 script / inline 事件 / javascript: URL；注入 <base href> 讓相對資源連回原站。"""
    soup = BeautifulSoup(html, "html.parser")

    # 1. 移除所有 <script>
    for tag in soup.find_all("script"):
        tag.decompose()

    # 2. 移除 inline 事件處理屬性與 javascript: URL
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                del tag.attrs[attr]
            elif attr.lower() in ("href", "src"):
                val = tag.attrs.get(attr, "")
                if isinstance(val, str) and val.strip().lower().startswith("javascript:"):
                    del tag.attrs[attr]

    # 3. 注入 <base href>（放在 <head> 最前；無 head 則建一個）
    head = soup.head
    if head is None:
        head = soup.new_tag("head")
        if soup.html:
            soup.html.insert(0, head)
        else:
            soup.insert(0, head)
    base_tag = soup.new_tag("base", href=base_url)
    head.insert(0, base_tag)

    return str(soup)


def build_md(title: str, url: str, slug: str, summary: str, date: str) -> str:
    """產出 Obsidian 索引筆記，沿用 vault templates 的 frontmatter 風格。"""
    return (
        "---\n"
        f'title: "{title}"\n'
        f"source: {url}\n"
        f"translated: {date}\n"
        "tags: [translated]\n"
        "---\n\n"
        f"# {title}（雙語）\n\n"
        "> [!info] 原文連結與雙語全文\n"
        f"> - 原文：{url}\n"
        f"> - 雙語全文：[[{slug}.html]]\n\n"
        "## 摘要\n"
        f"{summary}\n"
    )


def write_outputs(vault_path: str, slug: str, md_content: str, html_content: str) -> tuple[Path, Path]:
    md_path, html_path = safe_output_paths(vault_path, slug)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(md_content, encoding="utf-8")
    html_path.write_text(html_content, encoding="utf-8")
    return md_path, html_path
