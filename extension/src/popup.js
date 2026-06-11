const statusEl = document.getElementById("status");
function setStatus(t) {
  statusEl.textContent = t;
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// content script 只在「擴充載入後才開啟/重整的分頁」才會自動注入。
// 重載擴充、或分頁在裝擴充前就開著，會導致 sendMessage 連不上。
// 這裡先 ping，連不上就現場補注入，免去手動重整分頁。
async function ensureContentScript(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { action: "ping" });
    return; // 已載入
  } catch (e) {
    // 沒有 listener，補注入。受限頁面（about:、附加元件商店等）會在此丟錯。
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

async function sendToActiveTab(action) {
  const tab = await activeTab();
  await ensureContentScript(tab.id);
  return browser.tabs.sendMessage(tab.id, { action });
}

document.getElementById("translate").addEventListener("click", async () => {
  setStatus("翻譯中…");
  try {
    const resp = await sendToActiveTab("translatePage");
    if (resp && resp.ok) setStatus("完成，已翻譯 " + resp.count + " 段");
    else setStatus("錯誤：" + (resp ? resp.error : "無回應，bridge 未啟動？"));
  } catch (e) {
    setStatus("錯誤：" + e.message + "（此頁面可能不支援，請在一般網頁使用）");
  }
});

document.getElementById("save").addEventListener("click", async () => {
  setStatus("儲存中…");
  try {
    const resp = await sendToActiveTab("savePage");
    if (resp && resp.ok) setStatus("已存：" + resp.data.md_path);
    else setStatus("錯誤：" + (resp ? resp.error : "無回應"));
  } catch (e) {
    setStatus("錯誤：" + e.message);
  }
});

document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});
