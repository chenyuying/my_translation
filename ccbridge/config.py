import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    token: str
    port: int = 8765
    target_lang: str = "正體中文"
    claude_cmd: list[str] = field(default_factory=lambda: ["claude"])
    model: str | None = None
    max_chars_per_batch: int = 6000
    blacklist: list[str] = field(default_factory=list)


def load_config(path: Path) -> Config:
    data = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    model = data.get("model") or None  # 空字串視為未指定
    return Config(
        token=data["token"],
        port=data.get("port", 8765),
        target_lang=data.get("target_lang", "正體中文"),
        claude_cmd=data.get("claude_cmd", ["claude"]),
        model=model,
        max_chars_per_batch=data.get("max_chars_per_batch", 6000),
        blacklist=data.get("blacklist", []),
    )
