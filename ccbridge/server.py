import sys
from pathlib import Path

from .config import load_config
from .cache import Cache
from .app import create_app


def main():
    repo_root = Path(__file__).resolve().parent.parent
    config_path = repo_root / "config.toml"
    if not config_path.exists():
        print("找不到 config.toml；請先 `cp config.example.toml config.toml` 並填好設定。", file=sys.stderr)
        sys.exit(1)
    config = load_config(config_path)
    cache = Cache(repo_root / "cache.sqlite3")
    app = create_app(config, cache)
    print(f"cc-translate bridge 監聽 http://127.0.0.1:{config.port}")
    # threaded=True：streaming 的 /translate 會佔住一個 worker 逾百秒，單執行緒下會
    # 卡住 /health 與其他分頁的翻譯。多執行緒讓各請求獨立串流；claude 子程序仍由
    # run_claude 的 _CLAUDE_LOCK 序列化（不會並行寫壞 ~/.claude.json）。
    app.run(host="127.0.0.1", port=config.port, threaded=True)


if __name__ == "__main__":
    main()
