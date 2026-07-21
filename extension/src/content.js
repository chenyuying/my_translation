(function () {
  let lastSummary = "";
  let lastSegmentEls = []; // [{ id, el }]

  async function translatePage() {
    ccInject.clearInjected(document.body);
    const segments = ccExtract.collectSegments(document.body);
    console.log("[cc-translate][content] 收集到段落數:", segments.length);
    lastSegmentEls = segments.map(({ id, el }) => ({ id, el }));
    if (segments.length === 0) {
      console.log("[cc-translate][content] 0 段，不送出（此頁可能沒有可翻譯段落）");
      return { ok: true, count: 0 };
    }
    console.log("[cc-translate][content] 送往 background 翻譯…");
    const resp = await browser.runtime.sendMessage({
      action: "translate",
      url: location.href,
      title: document.title,
      segments: segments.map(({ id, text }) => ({ id, text })),
    });
    console.log("[cc-translate][content] background 回應:", resp);
    if (!resp || !resp.ok) {
      return { ok: false, error: resp ? resp.error : "無回應，bridge 未啟動？" };
    }
    const idToEl = new Map(lastSegmentEls.map((s) => [s.id, s.el]));
    const items = (resp.data.translations || [])
      .filter((t) => idToEl.has(t.id))
      .map((t) => ({ el: idToEl.get(t.id), translation: t.translation }));
    ccInject.injectTranslations(items);
    lastSummary = resp.data.summary || "";
    if (lastSummary) {
      const container = document.querySelector("article, main") || document.body;
      ccInject.injectSummaryCard(container, lastSummary);
    }
    return { ok: true, count: items.length };
  }

  // Firefox：回傳 Promise（translatePage async）即作為回應送回 popup。
  browser.runtime.onMessage.addListener((msg) => {
    console.log("[cc-translate][content] 收到指令:", msg && msg.action);
    if (msg.action === "ping") return Promise.resolve({ ok: true });
    if (msg.action === "translatePage") return translatePage();
  });
})();
