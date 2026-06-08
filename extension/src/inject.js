(function (global) {
  function buildTranslationNode(doc, text) {
    const div = doc.createElement("div");
    div.className = "cc-trans";
    div.textContent = text;
    return div;
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
      const node = buildTranslationNode(el.ownerDocument, translation);
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
