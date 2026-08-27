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
  highlightSentences,
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

  it("highlightSentences marks the key sentence inside the original paragraph", () => {
    // 原文常含換行縮排、且被 <em> 之類切碎；比對前空白要正規化才找得到句子。
    document.body.innerHTML =
      '<p id="p">The quick brown fox\n   jumps over the lazy dog. Tail line.</p>';
    const p = document.getElementById("p");
    highlightSentences([
      { el: p, sentence: "The quick brown fox jumps over the lazy dog." },
    ]);
    const mark = p.querySelector("mark.cc-key");
    expect(mark).not.toBeNull();
    expect(mark.textContent.replace(/\s+/g, " ")).toBe(
      "The quick brown fox jumps over the lazy dog."
    );
    expect(p.classList.contains("cc-key-para")).toBe(false); // 有精準標到，不用退回整段
    expect(p.textContent).toContain("Tail line."); // 原文其餘部分完好
  });

  it("highlightSentences falls back to marking the whole paragraph when not found", () => {
    document.body.innerHTML = '<p id="p">Something entirely different.</p>';
    const p = document.getElementById("p");
    // 句子跨行內元素邊界或 claude 沒逐字照抄時會走到這裡：標整段，不靜默失效。
    highlightSentences([{ el: p, sentence: "A sentence that is nowhere in the page." }]);
    expect(p.querySelector("mark.cc-key")).toBeNull();
    expect(p.classList.contains("cc-key-para")).toBe(true);
  });

  it("clearInjected unwraps highlights instead of deleting the original text", () => {
    document.body.innerHTML = '<p id="p">The key claim is here. Tail.</p>';
    const p = document.getElementById("p");
    highlightSentences([{ el: p, sentence: "The key claim is here." }]);
    clearInjected(document.body);
    expect(p.querySelector("mark.cc-key")).toBeNull();
    expect(p.textContent).toBe("The key claim is here. Tail."); // 原文一字不少
    expect(p.childNodes.length).toBe(1); // normalize 過，下輪比對不會被切碎
  });
});
