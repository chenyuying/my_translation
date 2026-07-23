(function () {
  let lastSummary = "";
  let lastSegmentEls = []; // [{ id, el }]

  function summaryContainer() {
    return document.querySelector("article, main") || document.body;
  }

  async function translatePage() {
    ccInject.clearInjected(document.body);
    const segments = ccExtract.collectSegments(document.body);
    console.log("[cc-translate][content] 收集到段落數:", segments.length);
    lastSegmentEls = segments.map(({ id, el }) => ({ id, el }));
    if (segments.length === 0) {
      console.log("[cc-translate][content] 0 段，不送出（此頁可能沒有可翻譯段落）");
      return { ok: true, count: 0 };
    }

    // 按下翻譯就「同步」鋪 skeleton：每段下方 + 文章頂端各放佔位骨架，
    // 讓使用者立刻看到畫面在動，不用乾等整包翻完。
    ccInject.injectSkeletons(lastSegmentEls);
    ccInject.injectSkeletonSummary(summaryContainer());

    console.log("[cc-translate][content] 送往 background 翻譯…");
    let resp;
    try {
      resp = await browser.runtime.sendMessage({
        action: "translate",
        url: location.href,
        title: document.title,
        segments: segments.map(({ id, text }) => ({ id, text })),
      });
    } catch (e) {
      ccInject.clearInjected(document.body); // 失敗清掉 skeleton，還原頁面
      throw e;
    }
    console.log("[cc-translate][content] background 回應:", resp);
    if (!resp || !resp.ok) {
      ccInject.clearInjected(document.body); // 失敗清掉 skeleton，還原頁面
      return { ok: false, error: resp ? resp.error : "無回應，bridge 未啟動？" };
    }

    // 成功：清掉 skeleton 再注入真正譯文（原段落節點未動，位置不變）。
    ccInject.clearInjected(document.body);
    const idToEl = new Map(lastSegmentEls.map((s) => [s.id, s.el]));
    const items = (resp.data.translations || [])
      .filter((t) => idToEl.has(t.id))
      .map((t) => ({ el: idToEl.get(t.id), translation: t.translation }));
    ccInject.injectTranslations(items);
    lastSummary = resp.data.summary || "";
    if (lastSummary) {
      ccInject.injectSummaryCard(summaryContainer(), lastSummary);
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
