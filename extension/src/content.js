(function () {
  let lastSummary = "";
  let lastSegmentEls = []; // [{ id, el }]

  async function translatePage() {
    ccInject.clearInjected(document.body);
    const segments = ccExtract.collectSegments(document.body);
    lastSegmentEls = segments.map(({ id, el }) => ({ id, el }));
    if (segments.length === 0) {
      return { ok: true, count: 0 };
    }
    const resp = await browser.runtime.sendMessage({
      action: "translate",
      url: location.href,
      title: document.title,
      segments: segments.map(({ id, text }) => ({ id, text })),
    });
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

  async function savePage() {
    const resp = await browser.runtime.sendMessage({
      action: "save",
      url: location.href,
      title: document.title,
      html: document.documentElement.outerHTML,
      summary: lastSummary,
    });
    if (!resp || !resp.ok) {
      return { ok: false, error: resp ? resp.error : "無回應" };
    }
    return resp;
  }

  // Firefox：回傳 Promise（translatePage/savePage 皆 async）即作為回應送回 popup。
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "translatePage") return translatePage();
    if (msg.action === "savePage") return savePage();
  });
})();
