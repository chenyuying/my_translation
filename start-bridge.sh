#!/usr/bin/env bash
# 啟動 cc-translate bridge server。
# 用法：./start-bridge.sh
set -euo pipefail

# 切到本 script 所在目錄（repo root），不受呼叫位置影響。
cd "$(dirname "$0")"

VENV_PY=".venv/bin/python"

# 1. 檢查 venv，沒有就建並安裝依賴。
if [ ! -x "$VENV_PY" ]; then
    echo "找不到 .venv，建立中…"
    python3 -m venv .venv
    "$VENV_PY" -m pip install --upgrade pip
    "$VENV_PY" -m pip install -e ".[dev]"
fi

# 2. 檢查 config.toml。
if [ ! -f "config.toml" ]; then
    echo "找不到 config.toml；請先 \`cp config.example.toml config.toml\` 並填好 token / vault_path / claude_cmd。" >&2
    exit 1
fi

# 3. 啟動 bridge（前景執行，Ctrl+C 結束）。
exec "$VENV_PY" -m ccbridge.server
