/**
 * Markdown-lite tokenizer for assistant bubbles (chat UI issue #8).
 *
 * Supports exactly what the system prompt's style guide produces: **bold**,
 * bullet lists (-, *, •), numbered lists, headings (rendered as bold lines),
 * paragraphs and soft line breaks. Everything else stays literal text.
 *
 * SAFETY: this is a tokenizer, not an HTML renderer. It never interprets
 * HTML — `<b>` and friends come out as plain text spans, and the companion
 * component renders spans as React text nodes (escaped by construction).
 */

export interface MarkdownSpan {
  bold: boolean;
  text: string;
}

export type MarkdownBlock =
  | { type: "paragraph"; lines: MarkdownSpan[][] }
  | { type: "list"; ordered: boolean; items: MarkdownSpan[][] };

const BULLET_PATTERN = /^\s{0,3}[-*•]\s+(.*)$/;
const ORDERED_PATTERN = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.*)$/;

/**
 * Split one line into bold/plain spans on `**` pairs. An unmatched trailing
 * `**` stays literal.
 */
export function parseInlineSpans(text: string): MarkdownSpan[] {
  const parts = text.split("**");
  if (parts.length % 2 === 0) {
    // Odd number of ** markers — the last opener is literal text.
    const tail = parts.pop() as string;
    parts[parts.length - 1] += `**${tail}`;
  }
  const spans: MarkdownSpan[] = [];
  parts.forEach((part, index) => {
    if (part === "") return;
    spans.push({ bold: index % 2 === 1, text: part });
  });
  return spans;
}

/** Tokenize a whole message into paragraph/list blocks. */
export function parseMarkdownLite(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: MarkdownSpan[][] | null = null;
  let list: { ordered: boolean; items: MarkdownSpan[][] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph && paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraph });
    }
    paragraph = null;
  };
  const flushList = (): void => {
    if (list && list.items.length > 0) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = BULLET_PATTERN.exec(line);
    const ordered = bullet ? null : ORDERED_PATTERN.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push(parseInlineSpans((bullet ?? ordered)![1]));
      continue;
    }

    flushList();
    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "paragraph",
        lines: [[{ bold: true, text: heading[1] }]],
      });
      continue;
    }

    if (!paragraph) paragraph = [];
    paragraph.push(parseInlineSpans(line));
  }
  flushParagraph();
  flushList();
  return blocks;
}
