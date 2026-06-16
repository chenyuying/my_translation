#!/usr/bin/env bash
# 啟動 cc-translate bridge server。
# 用法：./start-bridge.sh
#
# 翻譯透過一個「常駐」的 claude container 執行（config.toml 用 docker exec 進去），
# 避免每次翻譯都 `docker run` 重新建立 / 銷毀 container 的冷啟動開銷。
set -euo pipefail

# 切到本 script 所在目錄（repo root），不受呼叫位置影響。
cd "$(dirname "$0")"

VENV_PY=".venv/bin/python"

# 常駐 claude container 設定（可用環境變數覆寫）。
CLAUDE_CONTAINER="${CC_CLAUDE_CONTAINER:-cc-translate-claude}"
CLAUDE_IMAGE="${CC_CLAUDE_IMAGE:-claude-code:latest}"

# 確保一個常駐的 claude container 在跑：
#   - 已在跑     → 直接用
#   - 存在但停了 → docker start
#   - 不存在     → docker run -d 建立（覆寫 entrypoint 成 tail -f 讓它常駐不退出，
#                  並掛載 ~/.claude 認證；翻譯不碰檔案故不掛 vault/repo）
# config.toml 的 claude_cmd 之後以 `docker exec -i <container> claude` 進去跑。
ensure_claude_container() {
    if ! command -v docker >/dev/null 2>&1; then
        echo "找不到 docker 指令；請先安裝並啟動 Docker Desktop。" >&2
        exit 1
    fi
    if [ -n "$(docker ps -q -f "name=^${CLAUDE_CONTAINER}$")" ]; then
        return  # 已在跑
    fi
    if [ -n "$(docker ps -aq -f "name=^${CLAUDE_CONTAINER}$")" ]; then
        echo "啟動既有 claude container（${CLAUDE_CONTAINER}）…"
        docker start "$CLAUDE_CONTAINER" >/dev/null
        return
    fi
    echo "建立常駐 claude container（${CLAUDE_IMAGE}）…"
    docker run -d --name "$CLAUDE_CONTAINER" \
        --entrypoint tail \
        -v "$HOME/.claude.json:/home/claude/.claude.json" \
        -v "$HOME/.claude:/home/claude/.claude" \
        "$CLAUDE_IMAGE" -f /dev/null >/dev/null
    echo "（image 更新後若要套用新版：docker rm -f ${CLAUDE_CONTAINER}，再重跑本腳本）"
}

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

# 3. 確保常駐 claude container 就緒。
ensure_claude_container

# 4. 啟動 bridge（前景執行，Ctrl+C 結束）。
exec "$VENV_PY" -m ccbridge.server
