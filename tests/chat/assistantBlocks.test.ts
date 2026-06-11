/**
 * Assistant-trace helpers: tool-chip arg summaries, the lenient propose_bet
 * parse (full JSON + the truncated SSE summary), card titles, and folding
 * persisted `blocks` into chips/cards/error markers.
 */
import { describe, expect, it } from "vitest";

import {
  parseAssistantBlocks,
  parseProposedBet,
  proposedBetTitle,
  toolChipDetail,
  toolChipDetailFromArgs,
} from "@/lib/chat/assistant-blocks";

/** The exact payload shape `runProposeBet` returns (tools.ts `ok()`). */
const PROPOSE_RESULT = JSON.stringify({
  proposed: true,
  betId: "k57abc123def456ghi789jkl0mno1pqr",
  match: "MEX–RSA (#1)",
  market: "h2h",
  selection: "home",
  odds: 1.95,
  bookmaker: "Betano",
  status: "proposed",
  note: "Recorded as a proposal only — the user reviews and places every bet manually.",
});

describe("toolChipDetail", () => {
  it("summarizes salient args compactly", () => {
    expect(toolChipDetail("get_match_analysis", { matchNumber: 1 })).toBe("#1");
    expect(toolChipDetail("get_team_profile", { code: "mex" })).toBe("MEX");
    expect(toolChipDetail("get_fixtures", { date: "2026-06-11" })).toBe(
      "2026-06-11",
    );
    expect(toolChipDetail("get_value_bets", { minEdge: 0.03 })).toBe("≥3%");
    expect(toolChipDetail("web_search", { query: "Mexico lineup news" })).toBe(
      '"Mexico lineup news"',
    );
    expect(
      toolChipDetail("propose_bet", {
        matchNumber: 1,
        market: "h2h",
        selection: "home",
        odds: 1.95,
      }),
    ).toBe("#1 h2h home @ 1.95");
  });

  it("clips long queries and tolerates junk input", () => {
    const detail = toolChipDetail("web_search", { query: "x".repeat(80) });
    expect(detail.length).toBeLessThanOrEqual(43); // 40 + quotes + ellipsis
    expect(detail.endsWith('…"')).toBe(true);
    expect(toolChipDetail("get_fixtures", null)).toBe("");
    expect(toolChipDetail("get_fixtures", "nope")).toBe("");
    expect(toolChipDetail("get_fixtures", [1, 2])).toBe("");
    expect(toolChipDetail("get_tournament_sim", {})).toBe("");
  });

  it("parses the tool-start args JSON, tolerating truncation", () => {
    expect(
      toolChipDetailFromArgs("get_match_analysis", '{"matchNumber":7}'),
    ).toBe("#7");
    expect(toolChipDetailFromArgs("web_search", "")).toBe("");
    expect(toolChipDetailFromArgs("get_odds", '{"matchNumber":')).toBe("");
  });
});

describe("parseProposedBet", () => {
  it("parses the full persisted payload", () => {
    expect(parseProposedBet(PROPOSE_RESULT)).toEqual({
      match: "MEX–RSA (#1)",
      market: "h2h",
      selection: "home",
      odds: 1.95,
      bookmaker: "Betano",
    });
  });

  it("recovers the fields from a truncated SSE summary", () => {
    // The stream truncates summaries to 200 chars (cutting JSON mid-string).
    const truncated = `${PROPOSE_RESULT.slice(0, 199)}…`;
    expect(JSON.parse.bind(null, truncated)).toThrow();
    expect(parseProposedBet(truncated)).toEqual({
      match: "MEX–RSA (#1)",
      market: "h2h",
      selection: "home",
      odds: 1.95,
      bookmaker: "Betano",
    });
  });

  it("returns null unless the payload affirms proposed:true", () => {
    expect(parseProposedBet('{"error":"odds must be decimal odds"}')).toBe(
      null,
    );
    expect(parseProposedBet('{"proposed":false}')).toBe(null);
    expect(parseProposedBet("not json at all")).toBe(null);
  });
});

describe("proposedBetTitle", () => {
  const base = {
    match: "MEX–RSA (#1)",
    market: "h2h",
    selection: "home",
    odds: 1.95,
    bookmaker: "Betano",
  };

  it("humanizes the known markets", () => {
    expect(proposedBetTitle(base)).toBe("MEX win @ 1.95");
    expect(proposedBetTitle({ ...base, selection: "away" })).toBe(
      "RSA win @ 1.95",
    );
    expect(proposedBetTitle({ ...base, selection: "draw", odds: 3.1 })).toBe(
      "Draw @ 3.10",
    );
    expect(
      proposedBetTitle({
        ...base,
        market: "totals25",
        selection: "over",
        odds: 2.1,
      }),
    ).toBe("Over 2.5 @ 2.10");
    expect(
      proposedBetTitle({
        ...base,
        market: "btts",
        selection: "yes",
        odds: 2.3,
      }),
    ).toBe("BTTS yes @ 2.30");
  });

  it("falls back to the raw market/selection pair", () => {
    expect(
      proposedBetTitle({
        match: null,
        market: "outright",
        selection: "ESP",
        odds: 8.5,
        bookmaker: null,
      }),
    ).toBe("outright ESP @ 8.50");
    expect(
      proposedBetTitle({
        match: null,
        market: null,
        selection: null,
        odds: null,
        bookmaker: null,
      }),
    ).toBe("— @ —");
  });
});

describe("parseAssistantBlocks", () => {
  it("folds a persisted trace into chips, bets, and markers", () => {
    const trace = parseAssistantBlocks([
      { type: "thinking" },
      {
        type: "tool_use",
        id: "t1",
        name: "get_value_bets",
        input: { minEdge: 0.03 },
      },
      {
        type: "tool_result",
        toolUseId: "t1",
        name: "get_value_bets",
        content: "[]",
      },
      {
        type: "server_tool_use",
        id: "s1",
        name: "web_search",
        input: { query: "Mexico news" },
      },
      { type: "web_search_tool_result", toolUseId: "s1", summary: "3 results" },
      {
        type: "tool_use",
        id: "t2",
        name: "propose_bet",
        input: { matchNumber: 1 },
      },
      {
        type: "tool_result",
        toolUseId: "t2",
        name: "propose_bet",
        content: PROPOSE_RESULT,
      },
      {
        type: "tool_use",
        id: "t3",
        name: "get_odds",
        input: { matchNumber: 9 },
      },
      {
        type: "tool_result",
        toolUseId: "t3",
        name: "get_odds",
        content: '{"error":"no odds"}',
        isError: true,
      },
      { type: "text", text: "answer" },
      { type: "error", message: "interrupted" },
    ]);

    expect(
      trace.chips.map((chip) => [chip.name, chip.detail, chip.isError]),
    ).toEqual([
      ["get_value_bets", "≥3%", false],
      ["web_search", '"Mexico news"', false],
      ["propose_bet", "#1", false],
      ["get_odds", "#9", true],
    ]);
    expect(trace.proposedBets).toEqual([
      {
        match: "MEX–RSA (#1)",
        market: "h2h",
        selection: "home",
        odds: 1.95,
        bookmaker: "Betano",
      },
    ]);
    expect(trace.errorMarkers).toEqual(["interrupted"]);
  });

  it("ignores an errored propose_bet result", () => {
    const trace = parseAssistantBlocks([
      { type: "tool_use", id: "t1", name: "propose_bet", input: {} },
      {
        type: "tool_result",
        toolUseId: "t1",
        name: "propose_bet",
        content: '{"error":"market is required"}',
        isError: true,
      },
    ]);
    expect(trace.proposedBets).toEqual([]);
    expect(trace.chips[0].isError).toBe(true);
  });

  it("tolerates missing/garbage blocks", () => {
    expect(parseAssistantBlocks(undefined)).toEqual({
      chips: [],
      proposedBets: [],
      errorMarkers: [],
    });
    expect(parseAssistantBlocks("nope")).toEqual({
      chips: [],
      proposedBets: [],
      errorMarkers: [],
    });
    expect(parseAssistantBlocks([null, 42, { type: "mystery" }]).chips).toEqual(
      [],
    );
  });
});
