/**
 * System-prompt builder tests: the prompt is a frozen cache-stable string
 * carrying the tool-grounding rules; volatile context (date, match) rides as
 * the LAST content block of the LAST user turn — never in the system prompt.
 */
import { describe, expect, it } from "vitest";

import {
  buildContextBlock,
  buildModelMessages,
  formatPragueInstant,
  SYSTEM_PROMPT,
} from "@/lib/chat/system-prompt";

// 2026-06-11 12:00:00 UTC → 14:00 in Europe/Prague (CEST).
const NOW = Date.UTC(2026, 5, 11, 12, 0, 0);

describe("SYSTEM_PROMPT", () => {
  it("encodes the hard grounding rules", () => {
    expect(SYSTEM_PROMPT).toContain("NEVER invent");
    expect(SYSTEM_PROMPT).toContain("MUST come verbatim from a tool result");
    expect(SYSTEM_PROMPT).toContain("quarter-Kelly");
    expect(SYSTEM_PROMPT).toContain("propose_bet");
    expect(SYSTEM_PROMPT).toContain("web_search");
  });

  it("is cache-stable: no dates, times, or per-request values", () => {
    // A timestamp interpolated into the system prompt would invalidate the
    // prompt cache on every request.
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT).not.toContain("Today");
  });
});

describe("buildContextBlock", () => {
  it("carries today's date in Europe/Prague", () => {
    const block = buildContextBlock({ now: NOW });
    expect(block).toContain("<context>");
    expect(block).toContain("Thursday 2026-06-11");
    expect(block).toContain("Europe/Prague");
    expect(block).not.toContain("match #");
  });

  it("includes the thread's match context when present", () => {
    const block = buildContextBlock({
      now: NOW,
      match: {
        matchNumber: 24,
        stage: "group",
        // 17:00 UTC → 19:00 Prague.
        kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
        status: "scheduled",
        home: { code: "MEX", name: "Mexico" },
        away: { code: "RSA", name: "South Africa" },
        homePlaceholder: null,
        awayPlaceholder: null,
      },
    });
    expect(block).toContain("match #24 MEX–RSA");
    expect(block).toContain("MEX (Mexico) vs RSA (South Africa)");
    expect(block).toContain("kickoff 2026-06-11 19:00");
  });

  it("falls back to placeholders for unresolved knockout pairings", () => {
    const block = buildContextBlock({
      now: NOW,
      match: {
        matchNumber: 80,
        stage: "r32",
        kickoffAt: NOW,
        status: "scheduled",
        home: null,
        away: null,
        homePlaceholder: "1A",
        awayPlaceholder: "2B",
      },
    });
    expect(block).toContain("match #80 1A–2B");
  });
});

describe("buildModelMessages", () => {
  const CONTEXT = "<context>ctx</context>";

  it("attaches the context block as the LAST content block of the last user turn", () => {
    const messages = buildModelMessages(
      [
        { role: "user", text: "first" },
        { role: "assistant", text: "reply" },
        { role: "user", text: "second" },
      ],
      CONTEXT,
    );
    expect(messages).not.toBeNull();
    expect(messages).toHaveLength(3);
    expect(messages![0]).toEqual({ role: "user", content: "first" });
    expect(messages![1]).toEqual({ role: "assistant", content: "reply" });
    const last = messages![2];
    expect(last.role).toBe("user");
    expect(Array.isArray(last.content)).toBe(true);
    const blocks = last.content as Array<{ type: string; text: string }>;
    expect(blocks[0]).toEqual({ type: "text", text: "second" });
    expect(blocks[blocks.length - 1]).toEqual({
      type: "text",
      text: CONTEXT,
    });
  });

  it("drops leading assistant turns and unknown roles", () => {
    const messages = buildModelMessages(
      [
        { role: "assistant", text: "orphan" },
        { role: "system", text: "never replayed" },
        { role: "user", text: "hello" },
      ],
      CONTEXT,
    );
    expect(messages).toHaveLength(1);
    expect(messages![0].role).toBe("user");
  });

  it("skips empty messages (failed turns persisted with empty text)", () => {
    const messages = buildModelMessages(
      [
        { role: "user", text: "question" },
        { role: "assistant", text: "" },
        { role: "user", text: "follow-up" },
      ],
      CONTEXT,
    );
    expect(messages).toHaveLength(2);
  });

  it("returns null when there is no user turn to anchor the context", () => {
    expect(buildModelMessages([], CONTEXT)).toBeNull();
    expect(
      buildModelMessages([{ role: "assistant", text: "hi" }], CONTEXT),
    ).toBeNull();
  });
});

describe("formatPragueInstant", () => {
  it("renders UTC instants in Europe/Prague", () => {
    expect(formatPragueInstant(Date.UTC(2026, 5, 11, 17, 0, 0))).toBe(
      "2026-06-11 19:00",
    );
    // Winter (CET, UTC+1).
    expect(formatPragueInstant(Date.UTC(2026, 0, 5, 17, 0, 0))).toBe(
      "2026-01-05 18:00",
    );
  });
});
