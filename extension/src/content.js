(function () {
  let lastSummary = "";
  let lastSegmentEls = []; // [{ id, el }]

  function summaryContainer() {
    return document.querySelector("article, main") || document.body;
  }

  // 透過一條 port 送請求、收結果（不用 sendMessage）。
  // port 連著就撐住背景頁，讓長翻譯（~48s）的 fetch 不被回收中斷；結果走
  // port.postMessage 回來，避開 sendMessage 長時間後「Receiving end does not exist」的坑。
  // 一律 resolve（不 reject）：成功給 {ok:true,data}，失敗/斷線給 {ok:false,error}。
  function requestTranslateViaPort(payload) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (r) => {
        if (!settled) {
          settled = true;
          resolve(r);
        }
      };
      let port;
      try {
        port = browser.runtime.connect({ name: "cc-translate" });
      } catch (e) {
        done({ ok: false, error: "無法連上背景頁：" + ((e && e.message) || e) });
        return;
      }
      port.onMessage.addListener((msg) => {
        done(msg || { ok: false, error: "背景頁回應為空" });
        try {
          port.disconnect();
        } catch (_) {}
      });
      port.onDisconnect.addListener(() => {
        // Firefox 用 port.error、Chrome 用 runtime.lastError。
        const e = port.error || browser.runtime.lastError || null;
        done({ ok: false, error: (e && e.message) || "背景頁連線中斷（可能被瀏覽器回收）" });
      });
      port.postMessage(payload);
    });
  }

  // 實際翻譯流程：在「頁面情境」自己跑到完，不依賴 popup 是否開著。
  // 之前的 bug：popup 一關，短命的背景頁在長 fetch（48s）途中被回收，
  // 整包翻譯連同 skeleton 一起消失。改由 content script 驅動，並用一條 port
  // 同時撐住背景頁與傳輸結果（見 background.js），fetch 才能跑完、結果才收得到。
  async function runTranslate(segments) {
    lastSegmentEls = segments.map(({ id, el }) => ({ id, el }));

    // 立即回饋：頁面狀態條 + 每段下方/文章頂端的 skeleton 佔位。
    ccInject.showStatusToast(document, "翻譯中…可關閉此視窗，結果會顯示在頁面上");
    ccInject.injectSkeletons(lastSegmentEls);
    ccInject.injectSkeletonSummary(summaryContainer());

    console.log("[cc-translate][content] 送往 background 翻譯（port）…");
    const result = await requestTranslateViaPort({
      action: "translate",
      url: location.href,
      title: document.title,
      segments: segments.map(({ id, text }) => ({ id, text })),
    });
    console.log("[cc-translate][content] background 回應:", result);

    if (!result || !result.ok) {
      ccInject.clearInjected(document.body); // 失敗清掉 skeleton，還原頁面
      ccInject.showErrorToast(
        document,
        "翻譯失敗：" + ((result && result.error) || "無回應，bridge 未啟動？")
      );
      return;
    }

    // 成功：清掉 skeleton 再注入真正譯文（原段落節點未動，位置不變）。
    ccInject.clearInjected(document.body);
    const idToEl = new Map(lastSegmentEls.map((s) => [s.id, s.el]));
    const items = (result.data.translations || [])
      .filter((t) => idToEl.has(t.id))
      .map((t) => ({ el: idToEl.get(t.id), translation: t.translation }));
    ccInject.injectTranslations(items);
    lastSummary = result.data.summary || "";
    if (lastSummary) {
      ccInject.injectSummaryCard(summaryContainer(), lastSummary);
    }
    ccInject.removeStatusToast(document); // 成功不留提示（skeleton 已負責視覺進度）
    console.log("[cc-translate][content] 完成，已翻譯", items.length, "段");
  }

  // 「發射後不等」：收到指令就快速回 ack（確認 content script 在、此頁支援），
  // 真正翻譯在頁面自己跑完，popup 可以立刻關掉。
  function startTranslate() {
    ccInject.clearInjected(document.body); // 先清上一輪殘留，避免舊譯文被當新段落
    ccInject.removeStatusToast(document);
    const segments = ccExtract.collectSegments(document.body);
    console.log("[cc-translate][content] 收集到段落數:", segments.length);
    if (segments.length === 0) {
      console.log("[cc-translate][content] 0 段，不送出（此頁可能沒有可翻譯段落）");
      return { ok: true, count: 0 };
    }
    // 不 await：讓 runTranslate 在背景跑，這裡立刻回 ack 給 popup。
    runTranslate(segments).catch((e) => {
      console.error("[cc-translate][content] 翻譯流程未預期錯誤:", e);
      try {
        ccInject.clearInjected(document.body);
      } catch (_) {}
      try {
        ccInject.showErrorToast(document, "翻譯發生未預期錯誤：" + ((e && e.message) || e));
      } catch (_) {}
    });
    return { ok: true, started: true, count: segments.length };
  }

  // Firefox：回傳 Promise 即作為回應送回 popup（這裡是「已開始」的快速 ack）。
  browser.runtime.onMessage.addListener((msg) => {
    console.log("[cc-translate][content] 收到指令:", msg && msg.action);
    if (msg.action === "ping") return Promise.resolve({ ok: true });
    if (msg.action === "translatePage") return Promise.resolve(startTranslate());
  });
})();
