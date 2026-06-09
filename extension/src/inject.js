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
    root.querySelectorAll(".cc-trans, .cc-summary").forEach((n) => n.remove());
  }

  const api = {
    buildTranslationNode,
    buildSummaryCard,
    injectTranslations,
    injectSummaryCard,
    clearInjected,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ccInject = api;
})(typeof window !== "undefined" ? window : globalThis);
