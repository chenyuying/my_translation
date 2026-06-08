async function load() {
  const { bridgeUrl, token } = await browser.storage.sync.get(["bridgeUrl", "token"]);
  document.getElementById("bridgeUrl").value = bridgeUrl || "http://127.0.0.1:8765";
  document.getElementById("token").value = token || "";
}

document.getElementById("save").addEventListener("click", async () => {
  await browser.storage.sync.set({
    bridgeUrl: document.getElementById("bridgeUrl").value.trim(),
    token: document.getElementById("token").value.trim(),
  });
  const saved = document.getElementById("saved");
  saved.textContent = "已儲存";
  setTimeout(() => (saved.textContent = ""), 1500);
});

load();
