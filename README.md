# cc-translate bridge

本地沈浸式翻譯 bridge 服務。配合瀏覽器擴充使用：把網頁段落送來，呼叫本機 `claude -p` 翻成正體中文 + 摘要，並可一鍵存成雙語 HTML + MD 索引筆記到 Obsidian vault。

設計文件：`my_note/docs/superpowers/specs/2026-06-08-cc-translate-design.md`

## 安裝（在 host / macOS 執行，需 Python 3.11+）

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e ".[dev]"

## 設定

    cp config.example.toml config.toml
    # 編輯 config.toml：設定 token、vault_path、claude_cmd

## 執行

    python -m ccbridge.server

服務監聽 127.0.0.1:8765。

## 測試

    pytest
