(function (global) {
  const SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote";

  function collectSegments(root) {
    const nodes = root.querySelectorAll(SELECTOR);
    const segments = [];
    let i = 0;
    nodes.forEach((el) => {
      // 跳過已注入的譯文 / 摘要卡內部
      if (el.closest(".cc-trans, .cc-summary")) return;
      // 只取葉節點：若本身還包著其他可翻譯塊，交給內層處理，避免巢狀重複
      if (el.querySelector(SELECTOR)) return;
      const text = el.textContent.trim();
      if (!text) return;
      const id = "seg" + i++;
      el.setAttribute("data-cc-id", id);
      segments.push({ id, el, text });
    });
    return segments;
  }

  const api = { collectSegments, SELECTOR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ccExtract = api;
})(typeof window !== "undefined" ? window : globalThis);
