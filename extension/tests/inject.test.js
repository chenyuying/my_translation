import { describe, it, expect, beforeEach } from "vitest";
const {
  buildTranslationNode,
  buildSummaryCard,
  injectTranslations,
  injectBatchTranslations,
  injectSummaryCard,
  injectSummary,
  clearInjected,
  clearSkeletons,
  buildSkeletonNode,
  injectSkeletons,
  injectSkeletonSummary,
  showStatusToast,
  showErrorToast,
  removeStatusToast,
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

  it("buildSkeletonNode clones source tag as an empty cc-skeleton placeholder", () => {
    document.body.innerHTML = '<p id="x" class="post" data-cc-id="seg0">orig text</p>';
    const p = document.getElementById("x");
    const node = buildSkeletonNode(p);
    expect(node.tagName).toBe("P"); // 沿用原段落標籤 → 佔位版面一致
    expect(node.classList.contains("cc-skeleton")).toBe(true);
    expect(node.hasAttribute("id")).toBe(false); // 移除 id 避免重複
    expect(node.hasAttribute("data-cc-id")).toBe(false);
    expect(node.textContent).not.toContain("orig text"); // 不含原文，是佔位
    expect(node.querySelectorAll(".cc-skeleton-line").length).toBeGreaterThan(0); // 內含 shimmer 灰條
  });

  it("injectSkeletons inserts a cc-skeleton placeholder right after each element", () => {
    document.body.innerHTML = "<p id=a>A</p><p id=b>B</p>";
    const a = document.getElementById("a");
    const b = document.getElementById("b");
    injectSkeletons([{ el: a }, { el: b }]);
    expect(a.nextElementSibling.classList.contains("cc-skeleton")).toBe(true);
    expect(a.nextElementSibling.tagName).toBe("P"); // 沿用原段落標籤
    expect(b.nextElementSibling.classList.contains("cc-skeleton")).toBe(true);
  });

  it("injectSkeletonSummary prepends a cc-summary skeleton card to the container", () => {
    document.body.innerHTML = "<article><p>first</p></article>";
    const article = document.querySelector("article");
    const card = injectSkeletonSummary(article);
    expect(article.firstElementChild).toBe(card);
    expect(card.classList.contains("cc-summary")).toBe(true); // clearInjected 認得
    expect(card.classList.contains("cc-skeleton")).toBe(true); // 也是骨架
  });

  it("clearInjected also removes skeleton placeholders", () => {
    document.body.innerHTML =
      '<details class="cc-summary cc-skeleton"><summary>s</summary></details>' +
      '<p>orig</p><p class="cc-skeleton"></p>';
    clearInjected(document.body);
    expect(document.querySelectorAll(".cc-skeleton").length).toBe(0);
    expect(document.querySelector("p").textContent).toBe("orig"); // 原文保留
  });
});

describe("streaming injection (逐批)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("injectSkeletons tags each skeleton with its segment id", () => {
    document.body.innerHTML = '<p data-cc-id="seg0">A</p>';
    const el = document.querySelector('[data-cc-id="seg0"]');
    injectSkeletons([{ el, id: "seg0" }]);
    const skel = document.querySelector('.cc-skeleton[data-cc-skeleton-for="seg0"]');
    expect(skel).not.toBeNull();
    expect(el.nextElementSibling).toBe(skel);
  });

  it("injectBatchTranslations replaces that segment's skeleton with the translation", () => {
    document.body.innerHTML = '<p data-cc-id="seg0">A</p><p data-cc-id="seg1">B</p>';
    const a = document.querySelector('[data-cc-id="seg0"]');
    const b = document.querySelector('[data-cc-id="seg1"]');
    injectSkeletons([{ el: a, id: "seg0" }, { el: b, id: "seg1" }]);

    // 只回 seg0 這一批
    injectBatchTranslations([{ id: "seg0", el: a, translation: "甲" }]);

    // seg0：骨架換成譯文
    expect(a.nextElementSibling.classList.contains("cc-trans")).toBe(true);
    expect(a.nextElementSibling.textContent).toBe("甲");
    expect(document.querySelector('.cc-skeleton[data-cc-skeleton-for="seg0"]')).toBeNull();
    // seg1：尚未回來，骨架仍在
    expect(document.querySelector('.cc-skeleton[data-cc-skeleton-for="seg1"]')).not.toBeNull();
  });

  it("clearSkeletons removes only skeletons, keeping translations and summary", () => {
    document.body.innerHTML =
      '<div class="cc-trans">譯</div>' +
      '<p class="cc-skeleton" data-cc-skeleton-for="seg0"></p>' +
      '<details class="cc-summary"><summary>s</summary></details>';
    clearSkeletons(document.body);
    expect(document.querySelectorAll(".cc-skeleton").length).toBe(0);
    expect(document.querySelector(".cc-trans")).not.toBeNull(); // 已注入譯文保留
    expect(document.querySelector(".cc-summary")).not.toBeNull(); // 真摘要保留
  });

  it("injectSummary swaps the skeleton summary card for the real one", () => {
    document.body.innerHTML = "<article><p>first</p></article>";
    const article = document.querySelector("article");
    injectSkeletonSummary(article); // 先放骨架摘要卡
    const card = injectSummary(article, "真摘要");
    expect(document.querySelectorAll(".cc-summary").length).toBe(1); // 不疊加
    expect(card.classList.contains("cc-skeleton")).toBe(false); // 是真卡不是骨架
    expect(article.firstElementChild).toBe(card);
    expect(card.querySelector(".cc-summary-body").textContent).toBe("真摘要");
  });
});

describe("status toast", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("showStatusToast creates a single toast carrying the message", () => {
    const toast = showStatusToast(document, "翻譯中…");
    expect(toast.id).toBe("cc-status-toast");
    expect(toast.classList.contains("cc-toast")).toBe(true);
    expect(toast.textContent).toContain("翻譯中…");
    expect(document.querySelectorAll("#cc-status-toast").length).toBe(1);
  });

  it("showStatusToast reuses the same element and updates the text", () => {
    showStatusToast(document, "第一則");
    showStatusToast(document, "第二則");
    const all = document.querySelectorAll("#cc-status-toast");
    expect(all.length).toBe(1); // 不重複疊加
    expect(all[0].textContent).toContain("第二則");
    expect(all[0].textContent).not.toContain("第一則");
  });

  it("showErrorToast shows an error toast with a dismiss button", () => {
    const toast = showErrorToast(document, "bridge 502");
    expect(toast.classList.contains("cc-toast-error")).toBe(true);
    expect(toast.textContent).toContain("bridge 502");
    expect(toast.querySelector(".cc-toast-close")).not.toBeNull();
  });

  it("clicking the dismiss button removes the toast", () => {
    showErrorToast(document, "失敗原因");
    document.querySelector(".cc-toast-close").click();
    expect(document.getElementById("cc-status-toast")).toBeNull();
  });

  it("showErrorToast reuses the info toast rather than stacking", () => {
    showStatusToast(document, "翻譯中…");
    showErrorToast(document, "失敗了");
    const all = document.querySelectorAll("#cc-status-toast");
    expect(all.length).toBe(1);
    expect(all[0].classList.contains("cc-toast-error")).toBe(true);
    expect(all[0].classList.contains("cc-toast-info")).toBe(false);
  });

  it("removeStatusToast removes the toast", () => {
    showStatusToast(document, "翻譯中…");
    removeStatusToast(document);
    expect(document.getElementById("cc-status-toast")).toBeNull();
  });

  it("removeStatusToast is a no-op when no toast exists", () => {
    expect(() => removeStatusToast(document)).not.toThrow();
  });

  it("clearInjected leaves the toast intact (error survives skeleton clearing)", () => {
    showErrorToast(document, "翻譯失敗：bridge 502");
    document.body.insertAdjacentHTML("beforeend", '<p class="cc-skeleton"></p>');
    clearInjected(document.body);
    expect(document.getElementById("cc-status-toast")).not.toBeNull(); // toast 不被 clearInjected 清掉
    expect(document.querySelectorAll(".cc-skeleton").length).toBe(0); // 但 skeleton 清掉
  });
});
