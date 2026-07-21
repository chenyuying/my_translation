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

// Firefox：async 監聽器回傳的 Promise 會被當成回應送回呼叫端。
browser.runtime.onMessage.addListener(async (msg) => {
  console.log("[cc-translate][bg] 收到 content 訊息:", msg && msg.action);
  try {
    if (msg.action === "translate") {
      const data = await callBridge("/translate", {
        url: msg.url,
        title: msg.title,
        segments: msg.segments,
      });
      return { ok: true, data };
    }
  } catch (e) {
    console.error("[cc-translate][bg] callBridge 失敗:", e);
    return { ok: false, error: String((e && e.message) || e) };
  }
});
