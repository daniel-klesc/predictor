/**
 * The Odds API sync.
 *
 * - odds-sync (cron, every 6h): ONE request covers ALL upcoming WC matches
 *   (markets=h2h,totals × regions=eu = 2 credits) → one oddsSnapshots doc per
 *   matched match with computed best{} and median{} lines.
 * - outrights-sync (cron, daily): tournament-winner prices (1 credit). The
 *   sport key is verified against the free /sports endpoint first; when the
 *   winner market is not offered the run logs a skip.
 *
 * Budget: ~9 credits/day against the free 500/month. QUOTA GUARD: the
 * x-requests-remaining response header is persisted to
 * syncAudit.creditsRemaining on every call; when the last known value drops
 * below QUOTA_MIN_CREDITS the run HARD-STOPS with zero API calls.
 *
 * Both actions no-op cleanly (audit row, no API call) when ODDS_API_KEY is
 * unset; 401/429 responses are audited without throwing (no retry loops).
 * Unmatched team names are logged and skipped, never guessed. After snapshot
 * changes the predictions recompute is scheduled (event-driven, never a cron).
 */
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  ODDS_API_BASE_URL,
  ODDS_SPORT_KEY,
  type OddsApiEvent,
  type OddsApiSport,
  buildOddsSnapshots,
  buildOutrightPrices,
  pickOutrightSportKey,
} from "../lib/oddsApi";
import {
  QUOTA_MIN_CREDITS,
  parseCreditsHeader,
  shouldSkipForQuota,
  startOfUtcMonth,
} from "../lib/quota";
import { errorMessage } from "./util";

export const oddsSync = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await runOddsSync(ctx);
  },
});

export const outrightsSync = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await runOutrightsSync(ctx);
  },
});

// ---------------------------------------------------------------------------
// HTTP plumbing (never leaks the api key into errors or audit rows)
// ---------------------------------------------------------------------------

interface OddsApiResponse {
  ok: boolean;
  status: number;
  statusText: string;
  creditsRemaining?: number;
  body?: unknown;
}

/** GET an Odds API path. The apiKey only ever lives in the URL, never in errors. */
async function fetchOddsApi(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<OddsApiResponse> {
  const url = new URL(`${ODDS_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apiKey", apiKey);
  const response = await fetch(url.toString());
  const creditsRemaining = parseCreditsHeader(
    response.headers.get("x-requests-remaining"),
  );
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      creditsRemaining,
    };
  }
  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    creditsRemaining,
    body: await response.json(),
  };
}

/**
 * Classify a non-2xx response. 401/403 (bad key) and 429 (rate limited) are
 * audited and swallowed — throwing would only produce a retry/error loop the
 * next cron tick cannot fix. Anything else is thrown after auditing.
 */
function classifyHttpFailure(response: {
  status: number;
  statusText: string;
}): { message: string; rethrow: boolean } {
  if (response.status === 401 || response.status === 403) {
    return {
      message: `odds api auth failed (${response.status}) — check ODDS_API_KEY`,
      rethrow: false,
    };
  }
  if (response.status === 429) {
    return {
      message:
        "odds api rate limited (429) — waiting for the next scheduled run",
      rethrow: false,
    };
  }
  return {
    message: `odds api error: ${response.status} ${response.statusText}`,
    rethrow: true,
  };
}

interface SkipOutcome {
  summary: string;
}

/**
 * Shared preamble for both syncs: missing-key no-op and the quota HARD-STOP.
 * Returns a skip outcome (already audited) or the api key to proceed with.
 */
async function checkPreconditions(
  ctx: ActionCtx,
  source: string,
  startedAt: number,
): Promise<{ apiKey: string } | SkipOutcome> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: true,
      itemsUpdated: 0,
      detail: "skipped: ODDS_API_KEY not set — zero API calls",
    });
    return { summary: `${source}: skipped (ODDS_API_KEY not set)` };
  }

  const lastKnown = await ctx.runQuery(
    internal.sync.oddsApi.lastKnownCredits,
    {},
  );
  if (shouldSkipForQuota(lastKnown)) {
    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: true,
      itemsUpdated: 0,
      detail: `skipped: credits low (${lastKnown} < ${QUOTA_MIN_CREDITS}) — zero API calls`,
      creditsRemaining: lastKnown ?? undefined,
    });
    return { summary: `${source}: skipped (credits low: ${lastKnown})` };
  }

  return { apiKey };
}

// ---------------------------------------------------------------------------
// Odds sync (h2h + totals, every 6h, 2 credits/run)
// ---------------------------------------------------------------------------

/** Exported for the mocked-fetch dry-run tests. */
export async function runOddsSync(ctx: ActionCtx): Promise<string> {
  const source = "odds-sync";
  const startedAt = Date.now();
  const details: string[] = [];
  let creditsRemaining: number | undefined;
  try {
    const pre = await checkPreconditions(ctx, source, startedAt);
    if ("summary" in pre) return pre.summary;

    const response = await fetchOddsApi(
      `/sports/${ODDS_SPORT_KEY}/odds`,
      { regions: "eu", markets: "h2h,totals", oddsFormat: "decimal" },
      pre.apiKey,
    );
    creditsRemaining = response.creditsRemaining;

    if (!response.ok) {
      const failure = classifyHttpFailure(response);
      if (failure.rethrow) throw new Error(failure.message);
      await ctx.runMutation(internal.sync.audit.log, {
        source,
        startedAt,
        finishedAt: Date.now(),
        ok: false,
        itemsUpdated: 0,
        error: failure.message,
        creditsRemaining,
      });
      return `${source}: error (${failure.message})`;
    }

    if (!Array.isArray(response.body)) {
      throw new Error(
        "odds api: unexpected response shape (expected an array of events)",
      );
    }
    const events = response.body as OddsApiEvent[];

    const matchInfos = await ctx.runQuery(
      internal.sync.oddsApi.listMatchInfos,
      {},
    );
    const build = buildOddsSnapshots(events, matchInfos, Date.now());
    if (build.unknownTeams.length > 0) {
      details.push(
        `odds api teams skipped (no alias-map match): ${build.unknownTeams.join(", ")}`,
      );
    }
    if (build.unmatchedEvents.length > 0) {
      details.push(
        `${build.unmatchedEvents.length} events had no local match: ${build.unmatchedEvents.join("; ")}`,
      );
    }
    if (build.unpricedEvents > 0) {
      details.push(`${build.unpricedEvents} events had no priced lines`);
    }

    let changedCount = 0;
    if (build.snapshots.length > 0) {
      const result = await ctx.runMutation(
        internal.sync.oddsApi.applySnapshots,
        { snapshots: build.snapshots },
      );
      changedCount = result.changedMatchIds.length;
      // Event-driven recompute for matches whose computed lines changed.
      if (result.changedMatchIds.length > 0) {
        await ctx.scheduler.runAfter(
          0,
          internal.predictions.recomputeForMatches,
          { matchIds: result.changedMatchIds },
        );
      }
    }

    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: true,
      itemsUpdated: build.snapshots.length,
      detail:
        [`${changedCount} matches changed`, ...details].join(" | ") ||
        undefined,
      creditsRemaining,
    });
    return `odds: ${build.snapshots.length} snapshots (${changedCount} changed), credits remaining ${creditsRemaining ?? "unknown"}`;
  } catch (error) {
    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      itemsUpdated: 0,
      error: errorMessage(error),
      detail: details.length > 0 ? details.join(" | ") : undefined,
      creditsRemaining,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Outrights sync (tournament winner, daily, 1 credit/run)
// ---------------------------------------------------------------------------

/** Exported for the mocked-fetch dry-run tests. */
export async function runOutrightsSync(ctx: ActionCtx): Promise<string> {
  const source = "outrights-sync";
  const startedAt = Date.now();
  const details: string[] = [];
  let creditsRemaining: number | undefined;
  try {
    const pre = await checkPreconditions(ctx, source, startedAt);
    if ("summary" in pre) return pre.summary;

    // Free call (no quota cost): verify the winner outright sport key exists.
    const sportsResponse = await fetchOddsApi(
      "/sports",
      { all: "true" },
      pre.apiKey,
    );
    creditsRemaining = sportsResponse.creditsRemaining ?? creditsRemaining;
    if (!sportsResponse.ok) {
      const failure = classifyHttpFailure(sportsResponse);
      if (failure.rethrow) throw new Error(failure.message);
      await ctx.runMutation(internal.sync.audit.log, {
        source,
        startedAt,
        finishedAt: Date.now(),
        ok: false,
        itemsUpdated: 0,
        error: failure.message,
        creditsRemaining,
      });
      return `${source}: error (${failure.message})`;
    }
    if (!Array.isArray(sportsResponse.body)) {
      throw new Error("odds api: unexpected /sports response shape");
    }
    const sportKey = pickOutrightSportKey(
      sportsResponse.body as OddsApiSport[],
    );
    if (!sportKey) {
      await ctx.runMutation(internal.sync.audit.log, {
        source,
        startedAt,
        finishedAt: Date.now(),
        ok: true,
        itemsUpdated: 0,
        detail:
          "skipped: no World Cup winner outright sport offered by The Odds API",
        creditsRemaining,
      });
      return "outrights: skipped (winner market not offered)";
    }
    if (sportKey !== "soccer_fifa_world_cup_winner") {
      details.push(`using fallback outright sport key ${sportKey}`);
    }

    const response = await fetchOddsApi(
      `/sports/${sportKey}/odds`,
      { regions: "eu", markets: "outrights", oddsFormat: "decimal" },
      pre.apiKey,
    );
    creditsRemaining = response.creditsRemaining ?? creditsRemaining;
    if (!response.ok) {
      const failure = classifyHttpFailure(response);
      if (failure.rethrow) throw new Error(failure.message);
      await ctx.runMutation(internal.sync.audit.log, {
        source,
        startedAt,
        finishedAt: Date.now(),
        ok: false,
        itemsUpdated: 0,
        error: failure.message,
        creditsRemaining,
      });
      return `${source}: error (${failure.message})`;
    }
    if (!Array.isArray(response.body)) {
      throw new Error("odds api: unexpected outrights response shape");
    }

    const build = buildOutrightPrices(response.body as OddsApiEvent[]);
    if (build.unknownTeams.length > 0) {
      details.push(
        `outright teams skipped (no alias-map match): ${build.unknownTeams.join(", ")}`,
      );
    }

    let changed = false;
    if (build.prices.length > 0) {
      const result = await ctx.runMutation(
        internal.sync.oddsApi.applyOutright,
        { fetchedAt: Date.now(), prices: build.prices },
      );
      changed = result.changed;
      // Outright prices feed tournament-sim value detection → full recompute.
      if (changed) {
        await ctx.scheduler.runAfter(0, internal.predictions.recomputeAll, {});
      }
    } else {
      details.push("no outright prices returned");
    }

    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: true,
      itemsUpdated: build.prices.length,
      detail: details.length > 0 ? details.join(" | ") : undefined,
      creditsRemaining,
    });
    return `outrights: ${build.prices.length} team prices (${changed ? "changed" : "unchanged"}), credits remaining ${creditsRemaining ?? "unknown"}`;
  } catch (error) {
    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      itemsUpdated: 0,
      error: errorMessage(error),
      detail: details.length > 0 ? details.join(" | ") : undefined,
      creditsRemaining,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Queries + mutations
// ---------------------------------------------------------------------------

/**
 * Most recent creditsRemaining recorded by an odds-related sync this UTC
 * month (The Odds API quota resets monthly — older values are stale and
 * treated as unknown). Null when nothing usable was recorded.
 */
export const lastKnownCredits = internalQuery({
  args: {},
  handler: async (ctx): Promise<number | null> => {
    const monthStart = startOfUtcMonth(Date.now());
    let latest: Doc<"syncAudit"> | null = null;
    for (const source of ["odds-sync", "outrights-sync"]) {
      const row = await ctx.db
        .query("syncAudit")
        .withIndex("by_source", (q) => q.eq("source", source))
        .order("desc")
        .filter((q) => q.neq(q.field("creditsRemaining"), undefined))
        .first();
      if (row && (!latest || row.startedAt > latest.startedAt)) {
        latest = row;
      }
    }
    if (!latest || latest.startedAt < monthStart) return null;
    return latest.creditsRemaining ?? null;
  },
});

/** Matches with both teams known — the pairing input for the odds sync. */
export const listMatchInfos = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [matches, teams] = await Promise.all([
      ctx.db.query("matches").collect(),
      ctx.db.query("teams").collect(),
    ]);
    const codeById = new Map(teams.map((team) => [team._id, team.code]));
    return matches.flatMap((match) => {
      const homeCode = match.homeTeamId
        ? codeById.get(match.homeTeamId)
        : undefined;
      const awayCode = match.awayTeamId
        ? codeById.get(match.awayTeamId)
        : undefined;
      if (!homeCode || !awayCode) return [];
      return [
        { id: match._id, kickoffAt: match.kickoffAt, homeCode, awayCode },
      ];
    });
  },
});

// Validators mirror the oddsSnapshots shapes in convex/schema.ts (the schema
// issue owns the table; these stay local so this issue never edits schema.ts).
const h2hValidator = v.object({
  home: v.number(),
  draw: v.number(),
  away: v.number(),
});

const snapshotValidator = v.object({
  matchId: v.id("matches"),
  oddsApiEventId: v.string(),
  fetchedAt: v.number(),
  bookmakers: v.array(
    v.object({
      key: v.string(),
      title: v.optional(v.string()),
      lastUpdateAt: v.optional(v.number()),
      h2h: v.optional(h2hValidator),
      totals: v.optional(
        v.array(
          v.object({ point: v.number(), over: v.number(), under: v.number() }),
        ),
      ),
    }),
  ),
  best: v.optional(
    v.object({
      h2h: v.optional(
        v.object({
          home: v.number(),
          homeBookmaker: v.string(),
          draw: v.number(),
          drawBookmaker: v.string(),
          away: v.number(),
          awayBookmaker: v.string(),
        }),
      ),
      totals25: v.optional(
        v.object({
          over: v.number(),
          overBookmaker: v.string(),
          under: v.number(),
          underBookmaker: v.string(),
        }),
      ),
    }),
  ),
  median: v.optional(
    v.object({
      h2h: v.optional(h2hValidator),
      totals25: v.optional(v.object({ over: v.number(), under: v.number() })),
    }),
  ),
});

/**
 * Insert one snapshot per match (append-only time series) and report which
 * matches' computed best/median lines actually changed vs their previous
 * latest snapshot — only those get a predictions recompute. Also captures the
 * Odds API event id on the match (ext.oddsApiId) for traceability.
 */
export const applySnapshots = internalMutation({
  args: { snapshots: v.array(snapshotValidator) },
  handler: async (ctx, { snapshots }) => {
    const changedMatchIds: Id<"matches">[] = [];
    for (const snapshot of snapshots) {
      const previous = await ctx.db
        .query("oddsSnapshots")
        .withIndex("by_match", (q) => q.eq("matchId", snapshot.matchId))
        .order("desc")
        .first();
      await ctx.db.insert("oddsSnapshots", {
        matchId: snapshot.matchId,
        fetchedAt: snapshot.fetchedAt,
        bookmakers: snapshot.bookmakers,
        best: snapshot.best,
        median: snapshot.median,
      });

      const match = await ctx.db.get(snapshot.matchId);
      if (match && match.ext?.oddsApiId !== snapshot.oddsApiEventId) {
        await ctx.db.patch(snapshot.matchId, {
          ext: { ...match.ext, oddsApiId: snapshot.oddsApiEventId },
        });
      }

      const changed =
        !previous ||
        JSON.stringify({ best: previous.best, median: previous.median }) !==
          JSON.stringify({ best: snapshot.best, median: snapshot.median });
      if (changed) changedMatchIds.push(snapshot.matchId);
    }
    return { changedMatchIds };
  },
});

/** Insert an outright snapshot; changed = prices differ from the previous latest. */
export const applyOutright = internalMutation({
  args: {
    fetchedAt: v.number(),
    prices: v.array(
      v.object({
        teamCode: v.string(),
        bestOdds: v.number(),
        medianOdds: v.number(),
        bookmaker: v.string(),
      }),
    ),
  },
  handler: async (ctx, { fetchedAt, prices }) => {
    const previous = await ctx.db
      .query("outrightSnapshots")
      .withIndex("by_fetchedAt")
      .order("desc")
      .first();
    await ctx.db.insert("outrightSnapshots", { fetchedAt, prices });
    const changed =
      !previous || JSON.stringify(previous.prices) !== JSON.stringify(prices);
    return { changed };
  },
});
