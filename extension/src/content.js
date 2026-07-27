(function () {
  let lastSummary = "";
  let lastSegmentEls = []; // [{ id, el }]

  function summaryContainer() {
    return document.querySelector("article, main") || document.body;
  }

  // 每 20s 從 content 送一次 keepalive 心跳到背景頁。
  // 為什麼需要：非常駐背景頁（event page）閒置約 30s 就會被瀏覽器回收。單一批
  // claude 呼叫要 ~38s，這段期間 HTTP 串流上「沒有任何資料流動」，背景頁看起來就是
  // 閒置的 → 途中被回收 → port 斷線、翻譯中斷（實測翻到第 48 段時發生）。
  // content script 跟著分頁存活、穩定，定時送訊息即可重置背景頁的閒置計時器，
  // 跨過批次之間的長空窗。20s < 30s，留足安全邊際。
  const KEEPALIVE_MS = 20000;

  // 透過一條 port 送請求、逐批收結果（不用 sendMessage）。
  // port 連著 + keepalive 心跳撐住背景頁，讓長翻譯（>100s）的 fetch 不被回收中斷；
  // 每一批（batch）與摘要（summary）走 port.postMessage 即時回來，邊收邊注入，
  // 也避開 sendMessage 長時間後「Receiving end does not exist」的坑。
  //
  // handlers.onBatch(translations) / handlers.onSummary(summary) 於每個事件即時觸發。
  // 回傳 Promise 於串流結束時 resolve：正常收到 done → {ok:true}；
  // 收到 error 或 port 中途斷線 → {ok:false, error}。一律 resolve、不 reject。
  function requestTranslateViaPort(payload, handlers) {
    return new Promise((resolve) => {
      let settled = false;
      let keepAlive = null;
      const done = (r) => {
        if (!settled) {
          settled = true;
          if (keepAlive) clearInterval(keepAlive);
          resolve(r);
          try {
            port.disconnect();
          } catch (_) {}
        }
      };
      let port;
      try {
        port = browser.runtime.connect({ name: "cc-translate" });
      } catch (e) {
        done({ ok: false, error: "無法連上背景頁：" + ((e && e.message) || e) });
        return;
      }
      port.onMessage.addListener((ev) => {
        if (!ev || !ev.type) return;
        if (ev.type === "batch") {
          try {
            handlers.onBatch(ev.translations || []);
          } catch (err) {
            console.error("[cc-translate][content] onBatch 失敗:", err);
          }
        } else if (ev.type === "summary") {
          try {
            handlers.onSummary(ev.summary || "");
          } catch (err) {
            console.error("[cc-translate][content] onSummary 失敗:", err);
          }
        } else if (ev.type === "error") {
          done({ ok: false, error: ev.error || "翻譯失敗" });
        } else if (ev.type === "done") {
          done({ ok: true });
        }
      });
      port.onDisconnect.addListener(() => {
        // Firefox 用 port.error、Chrome 用 runtime.lastError。
        const e = port.error || browser.runtime.lastError || null;
        done({ ok: false, error: (e && e.message) || "背景頁連線中斷（可能被瀏覽器回收）" });
      });
      port.postMessage(payload);
      // 開始心跳（背景頁收到訊息就重置閒置計時器，撐過批次間的長空窗）。
      keepAlive = setInterval(() => {
        try {
          port.postMessage({ action: "keepalive" });
        } catch (_) {
          // port 已斷：停掉心跳（onDisconnect 會負責收尾）。
          if (keepAlive) clearInterval(keepAlive);
        }
      }, KEEPALIVE_MS);
    });
  }

  // 實際翻譯流程：在「頁面情境」自己跑到完，不依賴 popup 是否開著。
  // 之前的 bug：popup 一關，短命的背景頁在長 fetch（48s）途中被回收，
  // 整包翻譯連同 skeleton 一起消失。改由 content script 驅動，並用一條 port
  // 同時撐住背景頁與傳輸結果（見 background.js），fetch 才能跑完、結果才收得到。
  async function runTranslate(segments) {
    lastSegmentEls = segments.map(({ id, el }) => ({ id, el }));
    const idToEl = new Map(lastSegmentEls.map((s) => [s.id, s.el]));

    // 立即回饋：頁面狀態條 + 每段下方/文章頂端的 skeleton 佔位。
    // skeleton 帶上段落 id，讓譯文分批回來時能精準替換「那一段」。
    ccInject.showStatusToast(document, "翻譯中…可關閉此視窗，結果會陸續顯示在頁面上");
    ccInject.injectSkeletons(lastSegmentEls);
    ccInject.injectSkeletonSummary(summaryContainer());

    let doneCount = 0;

    console.log("[cc-translate][content] 送往 background 翻譯（port，streaming）…");
    const result = await requestTranslateViaPort(
      {
        action: "translate",
        url: location.href,
        title: document.title,
        segments: segments.map(({ id, text }) => ({ id, text })),
      },
      {
        // 每收到一批：把該批段落的 skeleton 換成真正譯文，其餘段落骨架不動。
        onBatch: (translations) => {
          const items = translations
            .filter((t) => idToEl.has(t.id))
            .map((t) => ({ id: t.id, el: idToEl.get(t.id), translation: t.translation }));
          ccInject.injectBatchTranslations(items);
          doneCount += items.length;
          ccInject.showStatusToast(
            document,
            `翻譯中…已完成 ${doneCount}/${lastSegmentEls.length} 段（可關閉此視窗）`
          );
          console.log("[cc-translate][content] 已注入一批", items.length, "段，累計", doneCount);
        },
        // 收到摘要：把骨架摘要卡換成真正摘要。
        onSummary: (summary) => {
          lastSummary = summary || "";
          if (lastSummary) ccInject.injectSummary(summaryContainer(), lastSummary);
        },
      }
    );
    console.log("[cc-translate][content] 串流結束:", result);

    // 收尾：清掉殘餘骨架（正常情況都已被各批替換；中途失敗則清掉未翻的骨架，
    // 但保留已注入的批次不動）。
    ccInject.clearSkeletons(document.body);

    if (!result || !result.ok) {
      ccInject.showErrorToast(
        document,
        "翻譯" +
          (doneCount > 0 ? "中斷" : "失敗") +
          "：" +
          ((result && result.error) || "無回應，bridge 未啟動？") +
          (doneCount > 0 ? `（已完成 ${doneCount} 段）` : "")
      );
      return;
    }

    ccInject.removeStatusToast(document); // 成功不留提示
    console.log("[cc-translate][content] 完成，共翻譯", doneCount, "段");
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
