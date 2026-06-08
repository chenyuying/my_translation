const statusEl = document.getElementById("status");
function setStatus(t) {
  statusEl.textContent = t;
}

async function activeTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab.id;
}

document.getElementById("translate").addEventListener("click", async () => {
  setStatus("翻譯中…");
  try {
    const resp = await browser.tabs.sendMessage(await activeTabId(), { action: "translatePage" });
    if (resp && resp.ok) setStatus("完成，已翻譯 " + resp.count + " 段");
    else setStatus("錯誤：" + (resp ? resp.error : "無回應，bridge 未啟動？"));
  } catch (e) {
    setStatus("錯誤：" + e.message + "（content script 未載入？請重整頁面）");
  }
});

document.getElementById("save").addEventListener("click", async () => {
  setStatus("儲存中…");
  try {
    const resp = await browser.tabs.sendMessage(await activeTabId(), { action: "savePage" });
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
