(function (global) {
  function buildTranslationNode(sourceEl, text) {
    // 沿用原段落的標籤與屬性（class/style），讓譯文視覺上跟原文一致
    // （顏色、字體自動跟著網頁走，深色頁也不會隱形）。
    // 僅換成譯文、加 cc-trans 標記、移除會造成重複的 id / 抽取用的 data-cc-id。
    const node = sourceEl.cloneNode(false);
    node.removeAttribute("data-cc-id");
    node.removeAttribute("id");
    node.classList.add("cc-trans");
    node.textContent = text;
    return node;
  }

  function buildSummaryCard(doc, summary) {
    const details = doc.createElement("details");
    details.className = "cc-summary";
    details.open = true;
    const summaryEl = doc.createElement("summary");
    summaryEl.textContent = "中文摘要";
    const body = doc.createElement("div");
    body.className = "cc-summary-body";
    body.textContent = summary;
    details.appendChild(summaryEl);
    details.appendChild(body);
    return details;
  }

  function buildSkeletonLines(doc, count) {
    // 幾條動畫灰條當佔位；最後一條較短，看起來像段落收尾。
    const frag = doc.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const line = doc.createElement("span");
      line.className = "cc-skeleton-line";
      if (i === count - 1) line.classList.add("cc-skeleton-line-short");
      frag.appendChild(line);
    }
    return frag;
  }

  function buildSkeletonNode(sourceEl, id) {
    // 沿用原段落標籤讓佔位版面一致；清空原文、放進 shimmer 灰條當「翻譯中」佔位。
    const node = sourceEl.cloneNode(false);
    node.removeAttribute("data-cc-id");
    node.removeAttribute("id");
    node.className = "cc-skeleton"; // 只留骨架 class，不帶原站 class（避免原樣式干擾佔位外觀）
    // 標上對應段落 id，讓譯文分批回來時能精準找到並替換「這一段」的骨架
    // （streaming：其他段落的骨架仍留著，繼續轉圈）。
    if (id != null) node.dataset.ccSkeletonFor = id;
    node.appendChild(buildSkeletonLines(sourceEl.ownerDocument, 2));
    return node;
  }

  function injectSkeletons(items) {
    items.forEach(({ el, id }) => {
      el.insertAdjacentElement("afterend", buildSkeletonNode(el, id));
    });
  }

  // 逐批注入：譯文一批批回來時，把「這批」段落的骨架換成真正譯文，
  // 其餘尚未翻的段落骨架不動（繼續顯示翻譯中）。
  function injectBatchTranslations(items) {
    items.forEach(({ el, id, translation }) => {
      // 先插譯文（緊接在原段落之後），再移除同段落的骨架，收斂成 [原文, 譯文]。
      el.insertAdjacentElement("afterend", buildTranslationNode(el, translation));
      if (id != null) {
        const skel = el.ownerDocument.querySelector(
          '.cc-skeleton[data-cc-skeleton-for="' + id + '"]'
        );
        if (skel) skel.remove();
      }
    });
  }

  // ── 原文重點句標記 ────────────────────────────────────────────────
  // 把 bridge 挑出的重點句標在「英文原文」上，讓眼睛先掃原文、落在真正承載重點的
  // 句子上（練速讀），看不懂再往下看譯文。標的是原文而非譯文，這才是練英文的地方。

  function highlightSentences(items) {
    items.forEach(({ el, sentence }) => {
      // 找不到句子就退回「整段標記」：寧可標粗一點，也不要靜默失效。
      if (!markSentence(el, sentence)) el.classList.add("cc-key-para");
    });
  }

  function markSentence(el, sentence) {
    // claude 不保證逐字照抄：常把段落前綴 [segN] 一起抄進來、空白也可能不一致。
    // 故先去前綴、把空白正規化，再比對（見 CLAUDE.md：對 claude 輸出保持寬容）。
    const needle = String(sentence || "")
      .replace(/^\[[^\]]+\]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (needle.length < 12) return false; // 太短容易誤標到別處

    // 原文常被 <a>/<em>/<strong> 切成多個文字節點，且含換行縮排。這裡把段落裡所有
    // 文字節點串成一條「空白正規化後」的字串，同時逐字記下它來自哪個節點的哪一位，
    // 才能跨節點比對、再把命中位置換回 Range。
    const doc = el.ownerDocument;
    const chars = [];
    let flat = "";
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++) {
        const isWs = /\s/.test(v[i]);
        if (isWs && flat.endsWith(" ")) continue; // 連續空白壓成一個
        flat += isWs ? " " : v[i];
        chars.push({ node: n, offset: i });
      }
    }

    const at = flat.indexOf(needle);
    if (at < 0) return false;
    const start = chars[at];
    const end = chars[at + needle.length - 1];
    const range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    const mark = doc.createElement("mark");
    mark.className = "cc-key";
    try {
      range.surroundContents(mark);
    } catch (_) {
      // 句子跨越行內元素邊界（例如中間有連結）→ 不能包成單一 mark。
      // 不硬拆原文結構，交給呼叫端退回整段標記。
      return false;
    }
    return true;
  }

  // 標記是「包在原文裡面」的，不能像譯文那樣整個 remove（會把原文一起刪掉）——
  // 要拆殼還原，再 normalize 把文字節點合回去，否則下一輪比對會被切得更碎。
  function clearHighlights(root) {
    root.querySelectorAll("mark.cc-key").forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      m.remove();
      parent.normalize();
    });
    root.querySelectorAll(".cc-key-para").forEach((n) => n.classList.remove("cc-key-para"));
  }

  // 只清「還在轉圈的骨架」，保留已注入的譯文（cc-trans）與真正摘要卡。
  // streaming 收尾 / 中途失敗時用：已翻好的批次留在畫面上，未翻的骨架清掉。
  function clearSkeletons(root) {
    root.querySelectorAll(".cc-skeleton").forEach((n) => n.remove());
  }

  // 摘要回來時，把骨架摘要卡（或舊摘要卡）換成真正摘要。
  function injectSummary(container, summary) {
    container.ownerDocument
      .querySelectorAll(".cc-summary")
      .forEach((n) => n.remove());
    return injectSummaryCard(container, summary);
  }

  function injectSkeletonSummary(container) {
    const doc = container.ownerDocument;
    const details = doc.createElement("details");
    details.className = "cc-summary cc-skeleton"; // cc-summary 套卡片外框、cc-skeleton 讓 clearInjected 認得
    details.open = true;
    const summaryEl = doc.createElement("summary");
    summaryEl.textContent = "中文摘要";
    const body = doc.createElement("div");
    body.className = "cc-summary-body";
    body.appendChild(buildSkeletonLines(doc, 3));
    details.appendChild(summaryEl);
    details.appendChild(body);
    container.insertBefore(details, container.firstChild);
    return details;
  }

  function injectTranslations(items) {
    items.forEach(({ el, translation }) => {
      const node = buildTranslationNode(el, translation);
      el.insertAdjacentElement("afterend", node);
    });
  }

  function injectSummaryCard(container, summary) {
    const card = buildSummaryCard(container.ownerDocument, summary);
    container.insertBefore(card, container.firstChild);
    return card;
  }

  function clearInjected(root) {
    // 只清「注入到文章裡」的譯文/摘要/骨架；狀態條（cc-toast）是獨立回饋，
    // 由 show/removeStatusToast 自己管理，故意不在此清掉——這樣失敗清骨架後，
    // 錯誤提示仍留在畫面上。
    root.querySelectorAll(".cc-trans, .cc-summary, .cc-skeleton").forEach((n) => n.remove());
    clearHighlights(root); // 原文上的重點句標記要拆殼，不能 remove
  }

  // ── 頁面浮動狀態條 ──────────────────────────────────────────────
  // 翻譯進度 / 失敗原因直接顯示在頁面上，與 popup 是否開著無關（popup 是短命的，
  // 長翻譯途中會被關掉，回饋不能只靠它）。全頁固定一個實例（單一 id）。
  const STATUS_TOAST_ID = "cc-status-toast";

  function ensureStatusToast(doc) {
    let toast = doc.getElementById(STATUS_TOAST_ID);
    if (!toast) {
      toast = doc.createElement("div");
      toast.id = STATUS_TOAST_ID;
      doc.body.appendChild(toast);
    }
    return toast;
  }

  function showStatusToast(doc, message) {
    const toast = ensureStatusToast(doc);
    toast.className = "cc-toast cc-toast-info";
    toast.textContent = message;
    return toast;
  }

  function showErrorToast(doc, message) {
    const toast = ensureStatusToast(doc);
    toast.className = "cc-toast cc-toast-error";
    toast.textContent = "";
    const span = doc.createElement("span");
    span.className = "cc-toast-msg";
    span.textContent = message;
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "cc-toast-close";
    close.textContent = "✕";
    close.setAttribute("aria-label", "關閉");
    close.addEventListener("click", () => toast.remove());
    toast.appendChild(span);
    toast.appendChild(close);
    return toast;
  }

  function removeStatusToast(doc) {
    const toast = doc.getElementById(STATUS_TOAST_ID);
    if (toast) toast.remove();
  }

  const api = {
    buildTranslationNode,
    buildSummaryCard,
    injectTranslations,
    injectBatchTranslations,
    injectSummaryCard,
    injectSummary,
    clearInjected,
    clearSkeletons,
    highlightSentences,
    clearHighlights,
    buildSkeletonNode,
    injectSkeletons,
    injectSkeletonSummary,
    showStatusToast,
    showErrorToast,
    removeStatusToast,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ccInject = api;
})(typeof window !== "undefined" ? window : globalThis);
