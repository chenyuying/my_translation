async function getSettings() {
  const { bridgeUrl, token } = await browser.storage.sync.get(["bridgeUrl", "token"]);
  return {
    bridgeUrl: bridgeUrl || "http://127.0.0.1:8765",
    token: token || "",
  };
}

async function callBridge(path, body) {
  const { bridgeUrl, token } = await getSettings();
  const resp = await fetch(bridgeUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Token": token,
    },
    body: JSON.stringify(body),
  });
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

// Firefox：async 監聽器回傳的 Promise 會被當成回應送回呼叫端。
browser.runtime.onMessage.addListener(async (msg) => {
  try {
    if (msg.action === "translate") {
      const data = await callBridge("/translate", {
        url: msg.url,
        title: msg.title,
        segments: msg.segments,
      });
      return { ok: true, data };
    }
    if (msg.action === "save") {
      const data = await callBridge("/save", {
        url: msg.url,
        title: msg.title,
        html: msg.html,
        summary: msg.summary,
      });
      return { ok: true, data };
    }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});
