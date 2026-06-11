/**
 * Tool-layer tests: definitions are deterministic and well-formed, and each
 * executor maps to the right Convex function with compact, token-frugal
 * output (probabilities rounded to 3 dp, nulls omitted, lists sorted).
 * ConvexHttpClient is mocked — no deployment needed.
 */
import { describe, expect, it } from "vitest";

import {
  ALL_CHAT_TOOLS,
  CHAT_TOOL_NAMES,
  CHAT_TOOLS,
  compact,
  executeChatTool,
  round3,
  WEB_SEARCH_TOOL,
} from "@/lib/chat/tools";
import { nextDayKey, startOfDayKey } from "@/lib/day";

import { fakeConvex } from "./fakes";

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

describe("tool definitions", () => {
  it("defines the eight custom tools in stable order, web_search last", () => {
    expect(CHAT_TOOL_NAMES).toEqual([
      "get_fixtures",
      "get_match_analysis",
      "get_odds",
      "get_value_bets",
      "get_team_profile",
      "get_tournament_sim",
      "get_my_bets",
      "propose_bet",
    ]);
    expect(ALL_CHAT_TOOLS).toHaveLength(CHAT_TOOLS.length + 1);
    expect(ALL_CHAT_TOOLS[ALL_CHAT_TOOLS.length - 1]).toBe(WEB_SEARCH_TOOL);
  });

  it("configures the server-side web_search tool per spec", () => {
    expect(WEB_SEARCH_TOOL).toEqual({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 5,
    });
  });

  it("gives every custom tool a description and an object schema", () => {
    for (const tool of CHAT_TOOLS) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.input_schema.type).toBe("object");
    }
  });
});

describe("compact", () => {
  it("rounds numbers to 3 decimals and drops null/undefined props", () => {
    expect(
      compact({
        pHome: 0.4512345,
        edge: 0.0789999,
        odds: 2.05,
        elo: 1822,
        gone: null,
        missing: undefined,
        nested: { pDraw: 0.2666666, empty: null },
        list: [{ p: 0.123456 }],
        keep: "text",
      }),
    ).toEqual({
      pHome: 0.451,
      edge: 0.079,
      odds: 2.05,
      elo: 1822,
      nested: { pDraw: 0.267 },
      list: [{ p: 0.123 }],
      keep: "text",
    });
    expect(round3(0.4515)).toBe(0.452);
  });
});

describe("get_fixtures", () => {
  it("converts the Prague date to a kickoff range and passes filters", async () => {
    const { client, queries } = fakeConvex({
      "chat:toolFixtures": () => [],
    });
    await executeChatTool(client, "get_fixtures", {
      date: "2026-06-11",
      stage: "group",
      teamCode: "MEX",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0].name).toBe("chat:toolFixtures");
    expect(queries[0].args).toEqual({
      start: startOfDayKey("2026-06-11"),
      end: startOfDayKey(nextDayKey("2026-06-11")),
      stage: "group",
      teamCode: "MEX",
    });
  });

  it("renders kickoffs as Prague strings and omits null fields", async () => {
    const { client } = fakeConvex({
      "chat:toolFixtures": () => [
        {
          matchNumber: 24,
          stage: "group",
          group: "B",
          kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
          venue: null,
          city: "Mexico City",
          status: "scheduled",
          home: { code: "MEX", name: "Mexico" },
          away: { code: "RSA", name: "South Africa" },
          homePlaceholder: null,
          awayPlaceholder: null,
          score: null,
        },
      ],
    });
    const result = await executeChatTool(client, "get_fixtures", {});
    expect(result.isError).toBe(false);
    const payload = parse(result.content);
    expect(payload.count).toBe(1);
    const fixture = (payload.fixtures as Record<string, unknown>[])[0];
    expect(fixture.kickoff).toBe("2026-06-11 19:00");
    expect(fixture).not.toHaveProperty("kickoffAt");
    expect(fixture).not.toHaveProperty("venue");
    expect(fixture).not.toHaveProperty("score");
    expect(fixture.home).toEqual({ code: "MEX", name: "Mexico" });
  });

  it("rejects malformed dates without calling Convex", async () => {
    const { client, queries } = fakeConvex({});
    const result = await executeChatTool(client, "get_fixtures", {
      date: "11.06.2026",
    });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toContain("YYYY-MM-DD");
    expect(queries).toHaveLength(0);
  });
});

describe("get_match_analysis", () => {
  it("maps to chat:toolMatchAnalysis and rounds probabilities to 3 dp", async () => {
    const { client, queries } = fakeConvex({
      "chat:toolMatchAnalysis": () => ({
        match: {
          matchNumber: 24,
          stage: "group",
          kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
          status: "scheduled",
          home: { code: "MEX", name: "Mexico", elo: 1810, isHost: true },
          away: { code: "RSA", name: "South Africa", elo: 1620, isHost: false },
        },
        prediction: {
          computedAt: Date.UTC(2026, 5, 11, 6, 0, 0),
          model: { pHome: 0.5512345, pDraw: 0.2487654, pAway: 0.2000001 },
          market: null,
          blend: { weight: 0.7, pHome: 0.5399999 },
          valueBets: [
            {
              market: "h2h",
              selection: "home",
              pBlend: 0.5399999,
              pImplied: 0.4878049,
              edge: 0.052195,
              bestOdds: 2.05,
              bookmaker: "bet365",
              kellyFraction: 0.0123456,
            },
          ],
        },
        odds: null,
      }),
    });
    const result = await executeChatTool(client, "get_match_analysis", {
      matchNumber: 24,
    });
    expect(queries[0]).toEqual({
      name: "chat:toolMatchAnalysis",
      args: { matchNumber: 24 },
    });
    expect(result.isError).toBe(false);
    const payload = parse(result.content);
    const prediction = payload.prediction as Record<string, unknown>;
    expect(prediction.model).toEqual({
      pHome: 0.551,
      pDraw: 0.249,
      pAway: 0.2,
    });
    expect(prediction).not.toHaveProperty("market");
    const bet = (prediction.valueBets as Record<string, unknown>[])[0];
    expect(bet.edge).toBe(0.052);
    expect(bet.kellyFraction).toBe(0.012);
    expect(bet.bestOdds).toBe(2.05);
    expect(payload).not.toHaveProperty("odds");
  });

  it("returns an error result for unknown match numbers", async () => {
    const { client } = fakeConvex({ "chat:toolMatchAnalysis": () => null });
    const result = await executeChatTool(client, "get_match_analysis", {
      matchNumber: 99,
    });
    expect(result.isError).toBe(true);
  });

  it("validates matchNumber before calling Convex", async () => {
    const { client, queries } = fakeConvex({});
    const result = await executeChatTool(client, "get_match_analysis", {
      matchNumber: 1234,
    });
    expect(result.isError).toBe(true);
    expect(queries).toHaveLength(0);
  });
});

describe("get_odds", () => {
  it("extracts the 2.5 totals line per bookmaker", async () => {
    const { client, queries } = fakeConvex({
      "chat:toolOdds": () => ({
        matchNumber: 24,
        home: { code: "MEX", name: "Mexico" },
        away: { code: "RSA", name: "South Africa" },
        kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
        status: "scheduled",
        snapshot: {
          fetchedAt: Date.UTC(2026, 5, 11, 8, 0, 0),
          best: { h2h: { home: 2.05, homeBookmaker: "bet365" } },
          median: { h2h: { home: 2.0, draw: 3.4, away: 3.9 } },
          bookmakers: [
            {
              key: "bet365",
              h2h: { home: 2.05, draw: 3.4, away: 3.8 },
              totals: [
                { point: 1.5, over: 1.4, under: 2.9 },
                { point: 2.5, over: 2.1, under: 1.75 },
              ],
            },
            { key: "pinnacle", h2h: null, totals: null },
          ],
        },
      }),
    });
    const result = await executeChatTool(client, "get_odds", {
      matchNumber: 24,
    });
    expect(queries[0].name).toBe("chat:toolOdds");
    const payload = parse(result.content);
    const odds = payload.odds as Record<string, unknown>;
    const bookmakers = odds.bookmakers as Record<string, unknown>[];
    expect(bookmakers[0].totals25).toEqual({
      point: 2.5,
      over: 2.1,
      under: 1.75,
    });
    expect(bookmakers[1]).toEqual({ key: "pinnacle" });
    expect(odds.fetched).toBe("2026-06-11 10:00");
  });

  it("notes missing odds instead of inventing them", async () => {
    const { client } = fakeConvex({
      "chat:toolOdds": () => ({
        matchNumber: 24,
        home: null,
        away: null,
        kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
        status: "scheduled",
        snapshot: null,
      }),
    });
    const result = await executeChatTool(client, "get_odds", {
      matchNumber: 24,
    });
    expect(result.isError).toBe(false);
    const payload = parse(result.content);
    expect(payload).not.toHaveProperty("odds");
    expect(payload.note).toContain("No bookmaker odds");
  });
});

describe("get_value_bets", () => {
  const rows = [
    {
      matchNumber: 24,
      stage: "group",
      kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
      home: "MEX",
      away: "RSA",
      market: "h2h",
      selection: "home",
      pBlend: 0.54,
      pImplied: 0.4878,
      edge: 0.0521949,
      bestOdds: 2.05,
      bookmaker: "bet365",
      kellyFraction: 0.0123456,
    },
    {
      matchNumber: 31,
      stage: "group",
      kickoffAt: Date.UTC(2026, 5, 12, 17, 0, 0),
      home: "USA",
      away: "PAR",
      market: "totals25",
      selection: "over",
      pBlend: 0.61,
      pImplied: 0.52,
      edge: 0.09,
      bestOdds: 1.92,
      bookmaker: "pinnacle",
      kellyFraction: 0.04,
    },
  ];

  it("sorts by edge descending and applies minEdge", async () => {
    const { client, queries } = fakeConvex({
      "chat:toolValueBets": () => rows,
    });
    const result = await executeChatTool(client, "get_value_bets", {});
    expect(queries[0].name).toBe("chat:toolValueBets");
    const payload = parse(result.content);
    const bets = payload.valueBets as Record<string, unknown>[];
    expect(bets.map((bet) => bet.matchNumber)).toEqual([31, 24]);
    expect(bets[1].edge).toBe(0.052);
    expect(bets[1].kickoff).toBe("2026-06-11 19:00");

    const filtered = await executeChatTool(client, "get_value_bets", {
      minEdge: 0.06,
    });
    const filteredBets = parse(filtered.content).valueBets as Record<
      string,
      unknown
    >[];
    expect(filteredBets).toHaveLength(1);
    expect(filteredBets[0].matchNumber).toBe(31);
  });

  it("returns a note instead of an empty answer when nothing qualifies", async () => {
    const { client } = fakeConvex({ "chat:toolValueBets": () => [] });
    const result = await executeChatTool(client, "get_value_bets", {});
    const payload = parse(result.content);
    expect(payload.count).toBe(0);
    expect(payload.note).toContain("No value bets");
  });
});

describe("get_team_profile / get_tournament_sim / get_my_bets", () => {
  it("maps get_team_profile and rounds sim probabilities", async () => {
    const { client, queries } = fakeConvex({
      "chat:toolTeamProfile": () => ({
        team: {
          code: "MEX",
          name: "Mexico",
          group: "A",
          elo: 1810,
          isHost: true,
        },
        standing: { position: 1, played: 1, won: 1, points: 3, goalDiff: 2 },
        remainingFixtures: [
          {
            matchNumber: 41,
            stage: "group",
            kickoffAt: Date.UTC(2026, 5, 17, 17, 0, 0),
            home: true,
            opponent: "KOR",
          },
        ],
        sim: { pWinGroup: 0.61234, pChampion: 0.0312345 },
        outright: { bestOdds: 34, medianOdds: 29, bookmaker: "bet365" },
      }),
    });
    const result = await executeChatTool(client, "get_team_profile", {
      code: "mex",
    });
    expect(queries[0]).toEqual({
      name: "chat:toolTeamProfile",
      args: { code: "mex" },
    });
    const payload = parse(result.content);
    expect((payload.sim as Record<string, unknown>).pChampion).toBe(0.031);
    const fixtures = payload.remainingFixtures as Record<string, unknown>[];
    expect(fixtures[0].kickoff).toBe("2026-06-17 19:00");
  });

  it("caps the tournament sim to the top teams by champion probability", async () => {
    const perTeam = Array.from({ length: 48 }, (_, index) => ({
      teamCode: `T${index}`,
      pChampion: index / 100,
      pWinGroup: 0.5,
    }));
    const { client } = fakeConvex({
      "chat:toolTournamentSim": () => ({
        computedAt: Date.UTC(2026, 5, 11, 5, 0, 0),
        runs: 10000,
        perTeam,
        valueOutrights: [],
      }),
    });
    const result = await executeChatTool(client, "get_tournament_sim", {});
    const payload = parse(result.content);
    const teams = payload.perTeam as Record<string, unknown>[];
    expect(teams).toHaveLength(20);
    expect(teams[0].teamCode).toBe("T47");
    expect(payload.note).toContain("Top 20 of 48");
  });

  it("maps get_my_bets newest-first with match labels", async () => {
    const { client, queries } = fakeConvex({
      "chat:toolMyBets": () => [
        {
          createdAt: Date.UTC(2026, 5, 10, 9, 0, 0),
          matchNumber: 24,
          home: "MEX",
          away: "RSA",
          market: "h2h",
          selection: "home",
          odds: 2.05,
          bookmaker: "bet365",
          stake: null,
          status: "proposed",
          source: "chat",
          payout: null,
          note: null,
        },
        {
          createdAt: Date.UTC(2026, 5, 11, 9, 0, 0),
          matchNumber: null,
          home: null,
          away: null,
          market: "outright",
          selection: "ESP",
          odds: 7.5,
          bookmaker: null,
          stake: 10,
          status: "placed",
          source: "manual",
          payout: null,
          note: null,
        },
      ],
    });
    const result = await executeChatTool(client, "get_my_bets", {});
    expect(queries[0].name).toBe("chat:toolMyBets");
    const payload = parse(result.content);
    const bets = payload.bets as Record<string, unknown>[];
    expect(bets[0].market).toBe("outright");
    expect(bets[0]).not.toHaveProperty("match");
    expect(bets[1].match).toBe("MEX–RSA (#24)");
    expect(bets[1].status).toBe("proposed");
  });
});

describe("propose_bet", () => {
  const matchHandler = () => ({
    matchId: "match_id_24",
    matchNumber: 24,
    status: "scheduled",
    kickoffAt: Date.UTC(2026, 5, 11, 17, 0, 0),
    home: { code: "MEX", name: "Mexico" },
    away: { code: "RSA", name: "South Africa" },
  });

  it("resolves the match and calls bets:propose with source chat", async () => {
    const { client, queries, mutations } = fakeConvex({
      "chat:matchByNumber": matchHandler,
      "bets:propose": () => "bet_id_1",
    });
    const result = await executeChatTool(client, "propose_bet", {
      matchNumber: 24,
      market: "h2h",
      selection: "home",
      odds: 2.05,
      bookmaker: "bet365",
      note: "5.2% edge per model",
    });
    expect(queries[0]).toEqual({
      name: "chat:matchByNumber",
      args: { matchNumber: 24 },
    });
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toEqual({
      name: "bets:propose",
      args: {
        matchId: "match_id_24",
        market: "h2h",
        selection: "home",
        odds: 2.05,
        bookmaker: "bet365",
        note: "5.2% edge per model",
        source: "chat",
      },
    });
    expect(result.isError).toBe(false);
    const payload = parse(result.content);
    expect(payload.proposed).toBe(true);
    expect(payload.betId).toBe("bet_id_1");
    expect(payload.match).toBe("MEX–RSA (#24)");
    expect(payload.status).toBe("proposed");
  });

  it("never writes for unknown matches or invalid odds", async () => {
    const missing = fakeConvex({ "chat:matchByNumber": () => null });
    const unknownMatch = await executeChatTool(missing.client, "propose_bet", {
      matchNumber: 24,
      market: "h2h",
      selection: "home",
      odds: 2.05,
    });
    expect(unknownMatch.isError).toBe(true);
    expect(missing.mutations).toHaveLength(0);

    const invalid = fakeConvex({ "chat:matchByNumber": matchHandler });
    const badOdds = await executeChatTool(invalid.client, "propose_bet", {
      matchNumber: 24,
      market: "h2h",
      selection: "home",
      odds: 0.95,
    });
    expect(badOdds.isError).toBe(true);
    expect(invalid.mutations).toHaveLength(0);
  });
});

describe("executeChatTool failure modes", () => {
  it("rejects unknown tool names", async () => {
    const { client } = fakeConvex({});
    const result = await executeChatTool(client, "rm_rf_slash", {});
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toContain("Unknown tool");
  });

  it("converts Convex failures into error results instead of throwing", async () => {
    const { client } = fakeConvex({
      "chat:toolValueBets": () => {
        throw new Error("deployment unreachable");
      },
    });
    const result = await executeChatTool(client, "get_value_bets", {});
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toContain("get_value_bets failed");
  });
});
