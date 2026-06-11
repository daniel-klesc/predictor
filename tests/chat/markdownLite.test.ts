/**
 * Markdown-lite tokenizer tests — bold spans, lists, line breaks, and the
 * safety property: HTML never gets interpreted (spans stay literal text;
 * the component renders them as React text nodes, escaped by construction).
 */
import { describe, expect, it } from "vitest";

import { parseInlineSpans, parseMarkdownLite } from "@/lib/chat/markdown-lite";

describe("parseInlineSpans", () => {
  it("splits bold runs on ** pairs", () => {
    expect(parseInlineSpans("The **edge** is **+7.2%**")).toEqual([
      { bold: false, text: "The " },
      { bold: true, text: "edge" },
      { bold: false, text: " is " },
      { bold: true, text: "+7.2%" },
    ]);
  });

  it("keeps an unmatched ** literal", () => {
    expect(parseInlineSpans("a **b")).toEqual([{ bold: false, text: "a **b" }]);
    expect(parseInlineSpans("a **b** c **d")).toEqual([
      { bold: false, text: "a " },
      { bold: true, text: "b" },
      { bold: false, text: " c **d" },
    ]);
    expect(parseInlineSpans("**")).toEqual([{ bold: false, text: "**" }]);
  });
});

describe("parseMarkdownLite", () => {
  it("groups paragraphs on blank lines with soft line breaks inside", () => {
    const blocks = parseMarkdownLite("line one\nline two\n\nnext para");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        lines: [
          [{ bold: false, text: "line one" }],
          [{ bold: false, text: "line two" }],
        ],
      },
      { type: "paragraph", lines: [[{ bold: false, text: "next para" }]] },
    ]);
  });

  it("parses bullet lists (-, *, •)", () => {
    const blocks = parseMarkdownLite("- one\n* two\n• three");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ bold: false, text: "one" }],
          [{ bold: false, text: "two" }],
          [{ bold: false, text: "three" }],
        ],
      },
    ]);
  });

  it("parses numbered lists with . and ) markers", () => {
    const blocks = parseMarkdownLite("1. first\n2) second");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          [{ bold: false, text: "first" }],
          [{ bold: false, text: "second" }],
        ],
      },
    ]);
  });

  it("splits when a list switches between bullet and numbered", () => {
    const blocks = parseMarkdownLite("- a\n1. b");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[1]).toMatchObject({ type: "list", ordered: true });
  });

  it("renders headings as bold paragraph lines", () => {
    expect(parseMarkdownLite("## Value bets")).toEqual([
      { type: "paragraph", lines: [[{ bold: true, text: "Value bets" }]] },
    ]);
  });

  it("mixes paragraphs and lists with bold inside items", () => {
    const blocks = parseMarkdownLite(
      "Top picks:\n- **MEX win** @ 1.95\n- Over 2.5 @ 2.10\n\nDone.",
    );
    expect(blocks).toEqual([
      { type: "paragraph", lines: [[{ bold: false, text: "Top picks:" }]] },
      {
        type: "list",
        ordered: false,
        items: [
          [
            { bold: true, text: "MEX win" },
            { bold: false, text: " @ 1.95" },
          ],
          [{ bold: false, text: "Over 2.5 @ 2.10" }],
        ],
      },
      { type: "paragraph", lines: [[{ bold: false, text: "Done." }]] },
    ]);
  });

  it("never interprets HTML — markup stays literal span text", () => {
    const payload = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    expect(parseMarkdownLite(payload)).toEqual([
      { type: "paragraph", lines: [[{ bold: false, text: payload }]] },
    ]);
    // …including inside bold spans and list items.
    expect(parseMarkdownLite("- **<b>x</b>**")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ bold: true, text: "<b>x</b>" }]],
      },
    ]);
  });

  it("returns no blocks for empty/whitespace input", () => {
    expect(parseMarkdownLite("")).toEqual([]);
    expect(parseMarkdownLite("  \n\n  ")).toEqual([]);
  });
});
