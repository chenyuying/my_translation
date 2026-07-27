async function getSettings() {
  const { bridgeUrl, token } = await browser.storage.sync.get(["bridgeUrl", "token"]);
  return {
    bridgeUrl: bridgeUrl || "http://127.0.0.1:8765",
    token: token || "",
  };
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

// bridge 的 /translate 現在以 NDJSON streaming 回傳（每翻完一批一行 JSON）。
// 這裡邊讀 response body、邊把每個事件（batch / summary / error）透過 port 轉發給
// content script，讓它逐批注入。translateStream 一律 resolve（成功/失敗都不 throw），
// 事件已即時送出，回傳值僅供背景端記 log。
async function translateStream(body, onEvent) {
  const { bridgeUrl, token } = await getSettings();
  console.log("[cc-translate][bg] translateStream →", bridgeUrl + "/translate");
  const resp = await fetch(bridgeUrl + "/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CC-Token": token },
    body: JSON.stringify(body),
  });
  console.log("[cc-translate][bg] fetch 回應:", resp.status, resp.ok);
  if (!resp.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await resp.json());
    } catch (e) {
      try {
        detail = await resp.text();
      } catch (_) {}
    }
    onEvent({ type: "error", error: "bridge " + resp.status + ": " + detail });
    return;
  }
  // 逐行讀 NDJSON：跨 chunk 的半行用 buf 暫存，遇到 \n 才解析成一個事件。
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const flushLines = (final) => {
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) emitLine(line);
    }
    if (final) {
      const tail = buf.trim();
      if (tail) emitLine(tail);
    }
  };
  const emitLine = (line) => {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch (e) {
      console.warn("[cc-translate][bg] 無法解析事件行，略過:", line);
      return;
    }
    onEvent(ev);
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    flushLines(false);
  }
  buf += decoder.decode();
  flushLines(true);
}

// content script 用一條 port 送翻譯請求、逐批收翻譯結果（見 content.js），而非 sendMessage。
// 三個關鍵好處：
//   (1) port 連著、且串流期間持續有資料流動，撐住這個「非常駐背景頁」，長翻譯（>100s）
//       的 fetch 不會被瀏覽器途中回收中斷；
//   (2) 每一批（batch）與摘要（summary）即時走 port.postMessage 回傳，前端邊收邊注入，
//       不必等整頁翻完；
//   (3) 不受 sendMessage「回應通道」長時間後被拆掉的限制（"Receiving end does not
//       exist." 的來源）。
browser.runtime.onConnect.addListener((port) => {
  console.log("[cc-translate][bg] port 連上:", port.name);
  port.onDisconnect.addListener(() => {
    console.log("[cc-translate][bg] port 斷開:", port.name);
  });
  if (port.name !== "cc-translate") return; // 非翻譯用途的 port 僅作 keep-alive
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.action !== "translate") return;
    console.log("[cc-translate][bg] port 收到翻譯請求，段落數:", msg.segments && msg.segments.length);
    const post = (ev) => {
      try {
        port.postMessage(ev);
      } catch (e) {
        // port 可能已被 content 端關閉（例如收到 error/done 後主動斷）——忽略。
      }
    };
    try {
      await translateStream(
        { url: msg.url, title: msg.title, segments: msg.segments },
        post
      );
      post({ type: "done" }); // 串流讀完，通知前端收尾
    } catch (e) {
      console.error("[cc-translate][bg] translateStream 失敗:", e);
      post({ type: "error", error: String((e && e.message) || e) });
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
