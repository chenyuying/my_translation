async function getSettings() {
  const { bridgeUrl, token } = await browser.storage.sync.get(["bridgeUrl", "token"]);
  return {
    bridgeUrl: bridgeUrl || "http://127.0.0.1:8765",
    token: token || "",
  };
}

async function callBridge(path, body) {
  const { bridgeUrl, token } = await getSettings();
  console.log("[cc-translate][bg] callBridge →", bridgeUrl + path, "| token:", token ? "有" : "空");
  const resp = await fetch(bridgeUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Token": token,
    },
    body: JSON.stringify(body),
  });
  console.log("[cc-translate][bg] fetch 回應:", resp.status, resp.ok);
  if (!resp.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await resp.json());
    } catch (e) {
      detail = await resp.text();
    }
    throw new Error("bridge " + resp.status + ": " + detail);
  }
  return resp.json();
}

// content script 連不上時現場補注入，免去手動重整分頁（與 popup 同邏輯）。
async function ensureContentScript(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { action: "ping" });
    return; // 已載入
  } catch (e) {
    // 沒有 listener，補注入。受限頁面會在下方 executeScript 丟錯。
  }
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["src/extract.js", "src/inject.js", "src/content.js"],
  });
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ["src/styles.css"],
  });
}

// content script 用一條 port 送翻譯請求、收翻譯結果（見 content.js），而非 sendMessage。
// 兩個關鍵好處：
//   (1) port 連著就撐住這個「非常駐背景頁」，長翻譯（~48s）的 fetch 不會被瀏覽器
//       途中回收中斷；
//   (2) 結果走 port.postMessage 回傳，不受 sendMessage「回應通道」在長時間後被拆掉的
//       限制——那正是「Could not establish connection. Receiving end does not exist.」
//       這個錯的來源。
// 這是「第一次 48s 翻譯沒出現、第二次 9s 快取版有出現」那個 bug 的根因修復。
browser.runtime.onConnect.addListener((port) => {
  console.log("[cc-translate][bg] port 連上:", port.name);
  port.onDisconnect.addListener(() => {
    console.log("[cc-translate][bg] port 斷開:", port.name);
  });
  if (port.name !== "cc-translate") return; // 非翻譯用途的 port 僅作 keep-alive
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.action !== "translate") return;
    console.log("[cc-translate][bg] port 收到翻譯請求，段落數:", msg.segments && msg.segments.length);
    try {
      const data = await callBridge("/translate", {
        url: msg.url,
        title: msg.title,
        segments: msg.segments,
      });
      try {
        port.postMessage({ ok: true, data });
      } catch (e) {
        console.error("[cc-translate][bg] 回傳結果失敗（port 可能已斷）:", e);
      }
    } catch (e) {
      console.error("[cc-translate][bg] callBridge 失敗:", e);
      try {
        port.postMessage({ ok: false, error: String((e && e.message) || e) });
      } catch (_) {}
    }
  });
});

// 快捷鍵 → 轉發成與 popup 相同的訊息給 active tab 的 content script。
browser.commands.onCommand.addListener(async (command) => {
  console.log("[cc-translate][bg] 快捷鍵指令:", command);
  const action =
    command === "translate-page" ? "translatePage" : null;
  if (!action) return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    try {
      await ensureContentScript(tab.id);
      await browser.tabs.sendMessage(tab.id, { action });
    } catch (e) {
      // 受限頁面或注入失敗：快捷鍵無 UI 可回報。原本靜默，這裡印出來方便除錯。
      console.error("[cc-translate][bg] 快捷鍵處理失敗（此頁可能受限或 content script 注入失敗）:", e);
    }
  }
});
