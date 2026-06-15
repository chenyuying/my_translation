#!/usr/bin/env bash
# 用 AMO 簽章 cc-translate 擴充功能（unlisted，自行散布、不公開上架）。
#
# 用法：
#   ./sign.sh                # 自動把 patch 版本 +1，再簽章（最常用）
#   ./sign.sh --patch        # 同上
#   ./sign.sh --minor        # minor +1（0.1.3 -> 0.2.0）
#   ./sign.sh --major        # major +1（0.1.3 -> 1.0.0）
#   ./sign.sh --set 0.4.2    # 指定版本號
#   ./sign.sh --no-bump      # 沿用 manifest.json 現有版本（AMO 不接受重複版本）
#
# 前置：把 AMO API 憑證放進 repo root 的 .env（見 .env.example）：
#   WEB_EXT_API_KEY=user:xxxxx:xxx
#   WEB_EXT_API_SECRET=xxxxxxxx...
set -euo pipefail

# 切到本 script 所在目錄（repo root），不受呼叫位置影響。
cd "$(dirname "$0")"

EXT_DIR="extension"
MANIFEST="$EXT_DIR/manifest.json"

# 1. 讀 .env 取得 AMO 憑證。web-ext 原生認得 WEB_EXT_API_KEY / WEB_EXT_API_SECRET 環境變數。
if [ ! -f ".env" ]; then
    echo "找不到 .env；請先 \`cp .env.example .env\` 並填入 AMO 的 WEB_EXT_API_KEY / WEB_EXT_API_SECRET。" >&2
    echo "憑證申請：https://addons.mozilla.org/developers/addon/api/key/" >&2
    exit 1
fi
set -a            # 自動 export 後續賦值的變數
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${WEB_EXT_API_KEY:-}" ] || [ -z "${WEB_EXT_API_SECRET:-}" ]; then
    echo ".env 缺少 WEB_EXT_API_KEY 或 WEB_EXT_API_SECRET。" >&2
    exit 1
fi

# 2. 決定 web-ext 怎麼跑：優先用 PATH 上的，否則退回 npx。
if command -v web-ext >/dev/null 2>&1; then
    WEB_EXT=(web-ext)
else
    WEB_EXT=(npx --yes web-ext)
fi

# 3. 處理版本號。預設 patch +1；可用旗標覆寫。
BUMP="patch"
SET_VERSION=""
case "${1:-}" in
    --patch|"") BUMP="patch" ;;
    --minor)    BUMP="minor" ;;
    --major)    BUMP="major" ;;
    --no-bump)  BUMP="none" ;;
    --set)
        SET_VERSION="${2:-}"
        [ -n "$SET_VERSION" ] || { echo "--set 需要版本號，例如 --set 0.4.2" >&2; exit 1; }
        BUMP="set"
        ;;
    *) echo "未知參數：$1（用 --patch/--minor/--major/--set X.Y.Z/--no-bump）" >&2; exit 1 ;;
esac

# 用 node 安全地讀寫 manifest.json 的版本號，並印出最終版本。
NEW_VERSION="$(node -e '
    const fs = require("fs");
    const path = process.argv[1], mode = process.argv[2], set = process.argv[3];
    const m = JSON.parse(fs.readFileSync(path, "utf8"));
    let [a, b, c] = (m.version || "0.0.0").split(".").map(n => parseInt(n, 10) || 0);
    if (mode === "set")        [a, b, c] = set.split(".").map(n => parseInt(n, 10) || 0);
    else if (mode === "major") { a++; b = 0; c = 0; }
    else if (mode === "minor") { b++; c = 0; }
    else if (mode === "patch") { c++; }
    const v = [a, b, c].join(".");
    if (mode !== "none") { m.version = v; fs.writeFileSync(path, JSON.stringify(m, null, 2) + "\n"); }
    process.stdout.write(mode === "none" ? m.version : v);
' "$MANIFEST" "$BUMP" "$SET_VERSION")"

echo "==> 簽章版本：$NEW_VERSION（channel=unlisted）"

# 4. 簽章。artifacts 落在 extension/web-ext-artifacts/。
#    --no-input 避免在 CI/非互動環境卡住等待輸入。
cd "$EXT_DIR"
"${WEB_EXT[@]}" sign \
    --channel=unlisted \
    --no-input \
    --api-key="$WEB_EXT_API_KEY" \
    --api-secret="$WEB_EXT_API_SECRET"

# 5. 指出剛產生的 .xpi。
XPI="$(ls -t web-ext-artifacts/*.xpi 2>/dev/null | head -n 1 || true)"
if [ -n "$XPI" ]; then
    echo
    echo "✅ 完成：$EXT_DIR/$XPI"
    echo "   安裝：Firefox 開 about:addons → 齒輪 → Install Add-on From File… → 選上面那個 .xpi"
fi
