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

  function buildSkeletonNode(sourceEl) {
    // 沿用原段落標籤讓佔位版面一致；清空原文、放進 shimmer 灰條當「翻譯中」佔位。
    const node = sourceEl.cloneNode(false);
    node.removeAttribute("data-cc-id");
    node.removeAttribute("id");
    node.className = "cc-skeleton"; // 只留骨架 class，不帶原站 class（避免原樣式干擾佔位外觀）
    node.appendChild(buildSkeletonLines(sourceEl.ownerDocument, 2));
    return node;
  }

  function injectSkeletons(items) {
    items.forEach(({ el }) => {
      el.insertAdjacentElement("afterend", buildSkeletonNode(el));
    });
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
    root.querySelectorAll(".cc-trans, .cc-summary, .cc-skeleton").forEach((n) => n.remove());
  }

  const api = {
    buildTranslationNode,
    buildSummaryCard,
    injectTranslations,
    injectSummaryCard,
    clearInjected,
    buildSkeletonNode,
    injectSkeletons,
    injectSkeletonSummary,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ccInject = api;
})(typeof window !== "undefined" ? window : globalThis);
