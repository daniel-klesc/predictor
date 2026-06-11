/**
 * Dry-run tests for the odds/outrights sync actions: a fake ActionCtx plus a
 * stubbed global fetch exercise the real action pipeline — quota hard-stop,
 * header parsing into syncAudit.creditsRemaining, response parsing, alias
 * mapping (incl. unknown-team skip), 401/429 handling — with zero network.
 */
import { type FunctionReference, getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/convex/_generated/server";
import { runOddsSync, runOutrightsSync } from "@/convex/sync/oddsApi";

const nameOf = (ref: unknown): string =>
  getFunctionName(ref as FunctionReference<"query">);

interface FakeCtxOptions {
  lastKnownCredits?: number | null;
  matchInfos?: unknown[];
}

function makeCtx(options: FakeCtxOptions = {}) {
  const audits: Record<string, unknown>[] = [];
  const mutations: { name: string; args: Record<string, unknown> }[] = [];
  const scheduled: { name: string; args: unknown }[] = [];

  const ctx = {
    runQuery: vi.fn(async (ref: unknown) => {
      const name = nameOf(ref);
      if (name === "sync/oddsApi:lastKnownCredits") {
        return options.lastKnownCredits ?? null;
      }
      if (name === "sync/oddsApi:listMatchInfos") {
        return options.matchInfos ?? [];
      }
      throw new Error(`unexpected query: ${name}`);
    }),
    runMutation: vi.fn(async (ref: unknown, args: Record<string, unknown>) => {
      const name = nameOf(ref);
      mutations.push({ name, args });
      if (name === "sync/audit:log") {
        audits.push(args);
        return null;
      }
      if (name === "sync/oddsApi:applySnapshots") {
        const snapshots = args.snapshots as { matchId: string }[];
        return { changedMatchIds: snapshots.map((s) => s.matchId) };
      }
      if (name === "sync/oddsApi:applyOutright") {
        return { changed: true };
      }
      throw new Error(`unexpected mutation: ${name}`);
    }),
    scheduler: {
      runAfter: vi.fn(async (_delayMs: number, ref: unknown, args: unknown) => {
        scheduled.push({ name: nameOf(ref), args });
      }),
    },
  };
  return {
    ctx: ctx as unknown as ActionCtx,
    audits,
    mutations,
    scheduled,
  };
}

function jsonResponse(
  body: unknown,
  init: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: init.headers,
  });
}

function stubFetchQueue(...responses: Response[]) {
  const calls: string[] = [];
  const mock = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return next;
  });
  vi.stubGlobal("fetch", mock);
  return { mock, calls };
}

const KICKOFF_ISO = "2026-06-12T19:00:00Z";

/** Minimal but realistic odds payload: two bookmakers, h2h + totals. */
const ODDS_PAYLOAD = [
  {
    id: "evt-mex-rsa",
    sport_key: "soccer_fifa_world_cup",
    commence_time: KICKOFF_ISO,
    home_team: "Mexico",
    away_team: "South Africa",
    bookmakers: [
      {
        key: "pinnacle",
        title: "Pinnacle",
        last_update: "2026-06-12T18:00:00Z",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Mexico", price: 1.85 },
              { name: "South Africa", price: 4.6 },
              { name: "Draw", price: 3.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: 1.95, point: 2.5 },
              { name: "Under", price: 1.87, point: 2.5 },
            ],
          },
        ],
      },
      {
        key: "unibet_eu",
        title: "Unibet",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Mexico", price: 1.9 },
              { name: "South Africa", price: 4.4 },
              { name: "Draw", price: 3.6 },
            ],
          },
        ],
      },
    ],
  },
  {
    // Unknown team — must be logged and skipped, never guessed.
    id: "evt-unknown",
    sport_key: "soccer_fifa_world_cup",
    commence_time: KICKOFF_ISO,
    home_team: "Atlantis",
    away_team: "South Africa",
    bookmakers: [],
  },
];

const MATCH_INFOS = [
  {
    id: "m1",
    kickoffAt: Date.parse(KICKOFF_ISO),
    homeCode: "MEX",
    awayCode: "RSA",
  },
];

beforeEach(() => {
  vi.stubEnv("ODDS_API_KEY", "test-api-key-123");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runOddsSync", () => {
  it("no-ops with a skipped audit row when ODDS_API_KEY is unset", async () => {
    vi.stubEnv("ODDS_API_KEY", undefined);
    const { mock } = stubFetchQueue();
    const { ctx, audits } = makeCtx();

    const summary = await runOddsSync(ctx);

    expect(mock).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      source: "odds-sync",
      ok: true,
      itemsUpdated: 0,
    });
    expect(String(audits[0].detail)).toContain("ODDS_API_KEY not set");
    expect(summary).toContain("skipped");
  });

  it("HARD-STOPS below 30 credits: zero API calls, skip logged to syncAudit", async () => {
    const { mock } = stubFetchQueue();
    const { ctx, audits, mutations } = makeCtx({ lastKnownCredits: 12 });

    const summary = await runOddsSync(ctx);

    expect(mock).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      source: "odds-sync",
      ok: true,
      itemsUpdated: 0,
      creditsRemaining: 12,
    });
    expect(String(audits[0].detail)).toContain("skipped: credits low");
    expect(
      mutations.filter((m) => m.name === "sync/oddsApi:applySnapshots"),
    ).toHaveLength(0);
    expect(summary).toContain("skipped");
  });

  it("still runs at exactly 30 credits (threshold is strict <)", async () => {
    const { mock } = stubFetchQueue(
      jsonResponse([], { headers: { "x-requests-remaining": "28" } }),
    );
    const { ctx, audits } = makeCtx({ lastKnownCredits: 30 });

    await runOddsSync(ctx);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(audits[0]).toMatchObject({ ok: true, creditsRemaining: 28 });
  });

  it("parses snapshots, records credits, and schedules the recompute", async () => {
    const { mock, calls } = stubFetchQueue(
      jsonResponse(ODDS_PAYLOAD, {
        headers: { "x-requests-remaining": "411", "x-requests-used": "89" },
      }),
    );
    const { ctx, audits, mutations, scheduled } = makeCtx({
      lastKnownCredits: 413,
      matchInfos: MATCH_INFOS,
    });

    const summary = await runOddsSync(ctx);

    // Request shape: one call, eu region, h2h+totals, decimal odds.
    expect(mock).toHaveBeenCalledTimes(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/v4/sports/soccer_fifa_world_cup/odds");
    expect(url.searchParams.get("regions")).toBe("eu");
    expect(url.searchParams.get("markets")).toBe("h2h,totals");
    expect(url.searchParams.get("oddsFormat")).toBe("decimal");

    // Snapshot written for the paired match with computed lines.
    const apply = mutations.find(
      (m) => m.name === "sync/oddsApi:applySnapshots",
    );
    expect(apply).toBeDefined();
    const snapshots = apply?.args.snapshots as {
      matchId: string;
      best?: { h2h?: { home: number } };
      median?: { h2h?: { draw: number } };
    }[];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].matchId).toBe("m1");
    expect(snapshots[0].best?.h2h?.home).toBe(1.9);
    expect(snapshots[0].median?.h2h?.draw).toBeCloseTo(3.55, 10);

    // Recompute scheduled for the changed match.
    expect(scheduled).toEqual([
      { name: "predictions:recomputeForMatches", args: { matchIds: ["m1"] } },
    ]);

    // Audit row carries the parsed quota header and the unknown-team skip.
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      source: "odds-sync",
      ok: true,
      itemsUpdated: 1,
      creditsRemaining: 411,
    });
    expect(String(audits[0].detail)).toContain("Atlantis");

    // The api key never leaks into audit rows or the summary.
    expect(JSON.stringify(audits)).not.toContain("test-api-key-123");
    expect(summary).not.toContain("test-api-key-123");
    expect(summary).toContain("1 snapshots");
  });

  it("audits a 401 cleanly without throwing (no retry loop)", async () => {
    stubFetchQueue(
      jsonResponse(
        { message: "Invalid API key" },
        { status: 401, statusText: "Unauthorized" },
      ),
    );
    const { ctx, audits, scheduled } = makeCtx({ lastKnownCredits: 400 });

    const summary = await runOddsSync(ctx);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ source: "odds-sync", ok: false });
    expect(String(audits[0].error)).toContain("401");
    expect(scheduled).toHaveLength(0);
    expect(summary).toContain("401");
  });

  it("audits a 429 cleanly without throwing", async () => {
    stubFetchQueue(
      jsonResponse(
        { message: "Too many requests" },
        { status: 429, statusText: "Too Many Requests" },
      ),
    );
    const { ctx, audits } = makeCtx();

    await expect(runOddsSync(ctx)).resolves.toContain("429");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ ok: false });
    expect(String(audits[0].error)).toContain("429");
  });

  it("audits exactly one error row and rethrows on unexpected statuses", async () => {
    stubFetchQueue(
      jsonResponse(
        { message: "boom" },
        { status: 500, statusText: "Internal Server Error" },
      ),
    );
    const { ctx, audits } = makeCtx();

    await expect(runOddsSync(ctx)).rejects.toThrow("500");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ source: "odds-sync", ok: false });
  });

  it("rejects unexpected response shapes after auditing", async () => {
    stubFetchQueue(jsonResponse({ not: "an array" }));
    const { ctx, audits } = makeCtx();

    await expect(runOddsSync(ctx)).rejects.toThrow("unexpected response shape");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ ok: false });
  });
});

describe("runOutrightsSync", () => {
  const SPORTS_PAYLOAD = [
    { key: "soccer_fifa_world_cup", active: true, has_outrights: false },
    { key: "soccer_fifa_world_cup_winner", active: true, has_outrights: true },
  ];

  const OUTRIGHT_PAYLOAD = [
    {
      id: "winner-2026",
      sport_key: "soccer_fifa_world_cup_winner",
      commence_time: "2026-06-11T00:00:00Z",
      home_team: null,
      away_team: null,
      bookmakers: [
        {
          key: "pinnacle",
          title: "Pinnacle",
          markets: [
            {
              key: "outrights",
              outcomes: [
                { name: "Spain", price: 5.5 },
                { name: "England", price: 7.0 },
              ],
            },
          ],
        },
        {
          key: "unibet_eu",
          title: "Unibet",
          markets: [
            {
              key: "outrights",
              outcomes: [
                { name: "Spain", price: 6.0 },
                { name: "England", price: 6.5 },
              ],
            },
          ],
        },
      ],
    },
  ];

  it("verifies the sport key (free call), fetches prices, and records credits", async () => {
    const { mock, calls } = stubFetchQueue(
      jsonResponse(SPORTS_PAYLOAD, {
        headers: { "x-requests-remaining": "410" },
      }),
      jsonResponse(OUTRIGHT_PAYLOAD, {
        headers: { "x-requests-remaining": "409" },
      }),
    );
    const { ctx, audits, mutations, scheduled } = makeCtx({
      lastKnownCredits: 411,
    });

    const summary = await runOutrightsSync(ctx);

    expect(mock).toHaveBeenCalledTimes(2);
    expect(new URL(calls[0]).pathname).toBe("/v4/sports");
    const oddsUrl = new URL(calls[1]);
    expect(oddsUrl.pathname).toBe(
      "/v4/sports/soccer_fifa_world_cup_winner/odds",
    );
    expect(oddsUrl.searchParams.get("markets")).toBe("outrights");
    expect(oddsUrl.searchParams.get("regions")).toBe("eu");

    const apply = mutations.find(
      (m) => m.name === "sync/oddsApi:applyOutright",
    );
    expect(apply).toBeDefined();
    const prices = apply?.args.prices as {
      teamCode: string;
      bestOdds: number;
      medianOdds: number;
      bookmaker: string;
    }[];
    expect(prices).toEqual([
      { teamCode: "ESP", bestOdds: 6.0, medianOdds: 5.75, bookmaker: "Unibet" },
      {
        teamCode: "ENG",
        bestOdds: 7.0,
        medianOdds: 6.75,
        bookmaker: "Pinnacle",
      },
    ]);

    expect(scheduled).toEqual([{ name: "predictions:recomputeAll", args: {} }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      source: "outrights-sync",
      ok: true,
      itemsUpdated: 2,
      creditsRemaining: 409,
    });
    expect(summary).toContain("2 team prices");
  });

  it("logs a skip and spends no credits when the winner sport is absent", async () => {
    const { mock } = stubFetchQueue(
      jsonResponse(
        [{ key: "soccer_fifa_world_cup", active: true, has_outrights: false }],
        { headers: { "x-requests-remaining": "410" } },
      ),
    );
    const { ctx, audits, mutations } = makeCtx({ lastKnownCredits: 411 });

    const summary = await runOutrightsSync(ctx);

    expect(mock).toHaveBeenCalledTimes(1); // only the free sports-list call
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      source: "outrights-sync",
      ok: true,
      itemsUpdated: 0,
      creditsRemaining: 410,
    });
    expect(String(audits[0].detail)).toContain("skipped");
    expect(
      mutations.filter((m) => m.name === "sync/oddsApi:applyOutright"),
    ).toHaveLength(0);
    expect(summary).toContain("skipped");
  });

  it("HARD-STOPS below 30 credits with zero API calls", async () => {
    const { mock } = stubFetchQueue();
    const { ctx, audits } = makeCtx({ lastKnownCredits: 3 });

    await runOutrightsSync(ctx);

    expect(mock).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(String(audits[0].detail)).toContain("skipped: credits low");
  });

  it("no-ops when ODDS_API_KEY is unset", async () => {
    vi.stubEnv("ODDS_API_KEY", undefined);
    const { mock } = stubFetchQueue();
    const { ctx, audits } = makeCtx();

    await runOutrightsSync(ctx);

    expect(mock).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(String(audits[0].detail)).toContain("ODDS_API_KEY not set");
  });
});
