import { describe, it, expect, beforeEach } from "vitest";
const {
  buildTranslationNode,
  buildSummaryCard,
  injectTranslations,
  injectSummaryCard,
  clearInjected,
} = require("../src/inject.js");

describe("inject", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("buildTranslationNode clones source tag/class with translated text", () => {
    document.body.innerHTML = '<p id="x" class="post" data-cc-id="seg0">orig</p>';
    const p = document.getElementById("x");
    const node = buildTranslationNode(p, "你好");
    expect(node.tagName).toBe("P"); // 沿用原段落標籤
    expect(node.classList.contains("post")).toBe(true); // 沿用原 class → 套原站樣式
    expect(node.classList.contains("cc-trans")).toBe(true); // 加上標記
    expect(node.textContent).toBe("你好");
    expect(node.hasAttribute("id")).toBe(false); // 移除 id 避免重複
    expect(node.hasAttribute("data-cc-id")).toBe(false);
  });

  it("buildSummaryCard creates collapsible details.cc-summary", () => {
    const card = buildSummaryCard(document, "整頁摘要內容");
    expect(card.tagName).toBe("DETAILS");
    expect(card.classList.contains("cc-summary")).toBe(true);
    expect(card.querySelector("summary")).not.toBeNull();
    expect(card.querySelector(".cc-summary-body").textContent).toBe("整頁摘要內容");
  });

  it("injectTranslations inserts a cc-trans node right after each original", () => {
    document.body.innerHTML = "<p id=a>A</p><p id=b>B</p>";
    const a = document.getElementById("a");
    const b = document.getElementById("b");
    injectTranslations([
      { el: a, translation: "甲" },
      { el: b, translation: "乙" },
    ]);
    expect(a.nextElementSibling.classList.contains("cc-trans")).toBe(true);
    expect(a.nextElementSibling.tagName).toBe("P"); // 沿用原段落標籤
    expect(a.nextElementSibling.textContent).toBe("甲");
    expect(b.nextElementSibling.textContent).toBe("乙");
  });

  it("injectSummaryCard prepends card to the container", () => {
    document.body.innerHTML = "<article><p>first</p></article>";
    const article = document.querySelector("article");
    const card = injectSummaryCard(article, "摘要");
    expect(article.firstElementChild).toBe(card);
    expect(card.classList.contains("cc-summary")).toBe(true);
  });

  it("clearInjected removes previously injected translation and summary nodes", () => {
    document.body.innerHTML =
      '<details class="cc-summary"><summary>s</summary></details>' +
      '<p>orig</p><div class="cc-trans">譯</div>';
    clearInjected(document.body);
    expect(document.querySelectorAll(".cc-trans, .cc-summary").length).toBe(0);
    expect(document.querySelector("p").textContent).toBe("orig"); // 原文保留
  });
});
