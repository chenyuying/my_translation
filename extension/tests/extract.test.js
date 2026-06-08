import { describe, it, expect, beforeEach } from "vitest";
const { collectSegments } = require("../src/extract.js");

function setBody(html) {
  document.body.innerHTML = html;
  return document.body;
}

describe("collectSegments", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects text from p, headings, li, blockquote", () => {
    const root = setBody(
      "<h1>Title</h1><p>Para one</p><ul><li>Item A</li></ul><blockquote>Quote</blockquote>"
    );
    const segs = collectSegments(root);
    const texts = segs.map((s) => s.text);
    expect(texts).toEqual(["Title", "Para one", "Item A", "Quote"]);
  });

  it("assigns sequential ids and data-cc-id attribute", () => {
    const root = setBody("<p>one</p><p>two</p>");
    const segs = collectSegments(root);
    expect(segs.map((s) => s.id)).toEqual(["seg0", "seg1"]);
    expect(root.querySelectorAll("[data-cc-id]").length).toBe(2);
    expect(segs[0].el.getAttribute("data-cc-id")).toBe("seg0");
  });

  it("skips empty and whitespace-only blocks", () => {
    const root = setBody("<p>real</p><p>   </p><p></p>");
    expect(collectSegments(root).map((s) => s.text)).toEqual(["real"]);
  });

  it("skips containers that hold other translatable blocks (leaf only)", () => {
    // blockquote 內含 p → 只取內層 p，不取 blockquote
    const root = setBody("<blockquote><p>inner</p></blockquote>");
    const segs = collectSegments(root);
    expect(segs.map((s) => s.text)).toEqual(["inner"]);
  });

  it("does not collect already-injected translation nodes", () => {
    const root = setBody('<p>orig</p><div class="cc-trans"><p>譯文</p></div>');
    const segs = collectSegments(root);
    expect(segs.map((s) => s.text)).toEqual(["orig"]);
  });

  it("returns elements referencing the actual DOM nodes", () => {
    const root = setBody("<p id=target>hi</p>");
    const segs = collectSegments(root);
    expect(segs[0].el).toBe(root.querySelector("#target"));
  });
});
