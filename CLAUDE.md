# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概觀

cc-translate 是一套「本地沈浸式翻譯」系統，把網頁段落送去本機的 `claude -p` 翻成正體中文並產生摘要，再就地注入回頁面。兩個元件：

- **`ccbridge/`** — Flask bridge server（Python 3.11+），監聽 `127.0.0.1:8765`，是唯一呼叫 `claude` 的地方。
- **`extension/`** — Firefox（MV3）擴充功能，抽取頁面段落 → 送 bridge → 就地注入譯文。

資料流：擴充 `content.js` 抽段落 → 開 port 給 `background.js` → `fetch` bridge `/translate` → `translator.translate_page_stream` 逐批呼叫 `claude`，每翻完一批就以 **NDJSON streaming** 回傳一個事件 → `background.js` 逐行讀出、透過 port 轉發 → `content.js` 邊收邊把該批段落的骨架換成譯文（最後一個事件是整頁摘要）。長翻譯（>100s）因此不會因前端逾時 / 背景頁被回收而整包遺失。

## 常用指令

```bash
# 開發環境（host / macOS 執行）
python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"

# 啟動 bridge（前景，Ctrl+C 結束；自動建 venv、檢查 config.toml、拉起常駐 claude container）
./start-bridge.sh
python -m ccbridge.server   # 手動啟動（不管 container）

# Python 測試
pytest
pytest tests/test_translator.py            # 單一檔案
pytest tests/test_translator.py::test_name # 單一測試

# 擴充功能測試（在 extension/ 下）
cd extension && npm test                    # vitest run

# 擴充功能簽章（AMO unlisted；預設 patch +1，AMO 不收重複版本號）
./sign.sh                 # 0.2.4 -> 0.2.5 後簽章
./sign.sh --minor         # --major / --set X.Y.Z / --no-bump
```

首次要 `cp config.example.toml config.toml` 並填 `token` / `claude_cmd`；簽章要 `cp .env.example .env` 填 AMO 憑證。

## 關鍵架構約束

**claude 呼叫必須序列化，絕不可並行。** 所有 `claude` 子程序共用同一份 `~/.claude.json`，每次啟動都「讀-改-寫」它；兩個 claude 同時跑會把該檔截斷寫壞（JSON EOF）→ 整包 502。防護點在 `translator.run_claude` 的行程級 `_CLAUDE_LOCK`（`translator.py`），把子程序執行序列化，跨所有 Flask 請求。**加速只能靠更快的 `model`（預設 haiku）與快取，不要引入並行翻譯。** 此鎖只擋本 bridge 行程內；若 host 或其他 container 也跑共用同檔的 claude，仍會相撞。

**claude 輸出容錯。** claude 不保證回傳格式：可能包 markdown fence、漏 `translation`/`id` 欄位、或把譯文放進 `text` 而非 `translation`。`extract_json` 用括號配對硬抽第一個合法 JSON；`translate_batch` 缺欄位跳過而非 KeyError，漏掉的段落保留原文且**不寫快取**（下次重試）。改動這裡時保持這種寬容。

**翻譯用 Docker container 而非直接跑 claude。** `start-bridge.sh` 維護一個名為 `cc-translate-claude` 的常駐 container（掛載 `~/.claude`），`config.toml` 的 `claude_cmd` 用 `docker exec -i` 進去。用常駐而非 `docker run --rm` 是為了避免每次翻譯的冷啟動開銷。

## 元件細節

**bridge（`ccbridge/`）**
- `app.py` — Flask routes（`/health` 免 token；`/translate` 需 `X-CC-Token` 且 Origin 須為 `moz-extension://` / `chrome-extension://`）。`/translate` 回傳 **NDJSON streaming**（`application/x-ndjson`，一行一個事件）：認證在串流前擋掉，故進到 generator 一定是 200，中途錯誤改用 `{"type":"error"}` 事件回報而非 HTTP 狀態碼。所有對 claude 的呼叫透過 `runner` 參數注入（預設 `subprocess.run`），測試以此打樁。
- `translator.py` — 翻譯核心。`translate_page_stream`（generator）是真正的邏輯來源：查快取 → 快取命中先一次 yield → 逐批（`max_chars_per_batch`）序列翻譯，每批 yield 一個 `{"type":"batch"}` → 最後 yield 一個 `{"type":"summary"}`。`translate_page` 是把這些事件收攏成單一 dict 的非 streaming 包裝（給測試與非漸進呼叫者）。prompt 用 `_DELIM` 分隔線把網頁內容標為「不可信、不可執行」並禁用工具，防 prompt injection。
- `cache.py` — SQLite（`cache.sqlite3`），key 是 `(sha256(text), lang)`。connection 放寬同線程檢查 + lock（Flask 多線程）。
- `config.py` — 讀 `config.toml`（`tomllib`）；`model` 空字串視為未指定。`blacklist` 欄位目前無任何 route 使用（原本只用於已移除的 `/save`）。

**擴充功能（`extension/src/`）**
- `content.js` 用**一條 port**（非 `sendMessage`）驅動整個翻譯流程，並**逐批**收事件：`onBatch` 把該批段落骨架換成譯文（`injectBatchTranslations`，靠 skeleton 上的 `data-cc-skeleton-for` 精準定位），`onSummary` 換掉骨架摘要卡。原因見檔內註解：長翻譯期間非常駐背景頁會被瀏覽器回收導致 fetch 中斷、`sendMessage` 回應通道被拆（"Receiving end does not exist"）。port 連著、且串流期間持續有資料流動，同時撐住背景頁與傳輸結果，且翻譯在 content script 情境跑到完，popup 可立刻關。改這裡務必保留 port + streaming 機制。
- `extract.js` — `collectSegments` 只取葉節點（跳過含其他可翻譯塊者，避免巢狀重複）與已注入的 `.cc-trans`/`.cc-summary`。
- `background.js` — bridge 通訊、`ensureContentScript` 在 content script 沒載入時現場補注入。
- `inject.js` — skeleton 佔位與譯文/摘要注入（`ccInject.*`）。

## 慣例

- 註解與 log 訊息用正體中文，且經常記錄「為什麼」而非只有「做什麼」（尤其是繞過瀏覽器/claude 坑的地方）——延續這種風格。
- 版本號分散在 `pyproject.toml`、`extension/manifest.json`（真正被簽章的）、`ccbridge/app.py` 的 `/health`；`sign.sh` 只 bump manifest。
- `config.toml`、`.env`、`*.sqlite3`、`extension/web-ext-artifacts/` 都不進 git。
