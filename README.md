# cc-translate bridge

本地沈浸式翻譯 bridge 服務。配合瀏覽器擴充使用：把網頁段落送來，呼叫本機 `claude -p` 翻成正體中文 + 摘要，並就地注入回頁面。

## 安裝（在 host / macOS 執行，需 Python 3.11+）

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e ".[dev]"

## 設定

    cp config.example.toml config.toml
    # 編輯 config.toml：設定 token、claude_cmd

## 執行

    ./start-bridge.sh

`start-bridge.sh` 會自動建立 / 沿用 `.venv`、檢查 `config.toml`，再前景啟動服務（Ctrl+C 結束）。

也可手動執行：

    python -m ccbridge.server

服務監聽 127.0.0.1:8765。

## 測試

    pytest

## 擴充功能：簽章與安裝（不公開上架）

擴充功能透過 AMO 的 **unlisted（自行散布）** 通道簽章：Mozilla 會幫你簽章但不在商店公開，簽好的 `.xpi` 可在正式版 Firefox 永久安裝。

一次性設定 AMO API 憑證（申請：<https://addons.mozilla.org/developers/addon/api/key/>）：

    cp .env.example .env
    # 填入 WEB_EXT_API_KEY / WEB_EXT_API_SECRET

簽章（預設把 patch 版本 +1，AMO 不接受重複版本號）：

    ./sign.sh                # 0.1.0 -> 0.1.1 後簽章
    ./sign.sh --minor        # 0.1.1 -> 0.2.0
    ./sign.sh --major        # -> 1.0.0
    ./sign.sh --set 0.4.2    # 指定版本
    ./sign.sh --no-bump      # 沿用現有版本

簽好的 `.xpi` 會放在 `extension/web-ext-artifacts/`。安裝：Firefox 開 `about:addons` → 右上齒輪 → **Install Add-on From File…** → 選該 `.xpi`（重啟不會消失）。
