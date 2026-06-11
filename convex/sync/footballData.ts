/**
 * football-data.org sync.
 *
 * - fixtures-sync (cron, every 6h): full pass — kickoff changes, knockout
 *   slot resolution (TBD → real teams), venue, status/score updates.
 * - results-sync (cron, every 10min): GUARDED by the pure predicate
 *   shouldPollResults — the API is only called when a match is live, kicked
 *   off <3.5h ago, or kicks off <15min from now; otherwise the run no-ops
 *   with ZERO API calls.
 *
 * Both no-op cleanly (audit row, no API call) when FOOTBALL_DATA_API_KEY is
 * not set. After any data change the predictions recompute is scheduled
 * (event-driven, never a cron).
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
  type FdMatchesResponse,
  fdScoreToScore,
  normalizeFdStatus,
  pairingKey,
  resolveFdTeamCode,
} from "../lib/footballDataApi";
import { shouldPollResults } from "../lib/resultsGuard";
import { matchStatusValidator, scoreValidator } from "../schema";
import { errorMessage, fetchJson } from "./util";

const FOOTBALL_DATA_MATCHES_URL =
  "https://api.football-data.org/v4/competitions/WC/matches";

export const fixturesSync = internalAction({
  args: {},
  handler: async (ctx) => {
    await runFdSync(ctx, "fixtures-sync", { guarded: false });
  },
});

export const resultsSync = internalAction({
  args: {},
  handler: async (ctx) => {
    await runFdSync(ctx, "results-sync", { guarded: true });
  },
});

async function runFdSync(
  ctx: ActionCtx,
  source: string,
  { guarded }: { guarded: boolean },
): Promise<void> {
  const startedAt = Date.now();
  const details: string[] = [];
  try {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.sync.audit.log, {
        source,
        startedAt,
        finishedAt: Date.now(),
        ok: true,
        itemsUpdated: 0,
        detail: "skipped: FOOTBALL_DATA_API_KEY not set — zero API calls",
      });
      return;
    }

    if (guarded) {
      const matches = await ctx.runQuery(
        internal.sync.footballData.listAllMatches,
        {},
      );
      if (!shouldPollResults(matches, Date.now())) {
        await ctx.runMutation(internal.sync.audit.log, {
          source,
          startedAt,
          finishedAt: Date.now(),
          ok: true,
          itemsUpdated: 0,
          detail: "guard: no live or imminent matches — zero API calls",
        });
        return;
      }
    }

    const fd = (await fetchJson(FOOTBALL_DATA_MATCHES_URL, {
      headers: { "X-Auth-Token": apiKey },
    })) as FdMatchesResponse;

    const unresolved = new Set<string>();
    const updates = [];
    for (const fdMatch of fd.matches ?? []) {
      const kickoffAt = Date.parse(fdMatch.utcDate);
      if (!Number.isFinite(kickoffAt)) continue;
      const homeCode = resolveFdTeamCode(fdMatch.homeTeam);
      const awayCode = resolveFdTeamCode(fdMatch.awayTeam);
      // TBD knockout slots have null team names — those are fine. A NAMED
      // team that fails to resolve is logged and skipped, never guessed.
      if (fdMatch.homeTeam?.name && !homeCode)
        unresolved.add(fdMatch.homeTeam.name);
      if (fdMatch.awayTeam?.name && !awayCode)
        unresolved.add(fdMatch.awayTeam.name);
      const score = fdScoreToScore(fdMatch.score);
      const winner =
        fdMatch.score?.winner === "HOME_TEAM"
          ? ("home" as const)
          : fdMatch.score?.winner === "AWAY_TEAM"
            ? ("away" as const)
            : fdMatch.score?.winner === "DRAW"
              ? ("draw" as const)
              : undefined;
      updates.push({
        footballDataId: fdMatch.id,
        kickoffAt,
        status: normalizeFdStatus(fdMatch.status),
        homeCode: homeCode ?? undefined,
        awayCode: awayCode ?? undefined,
        venue: fdMatch.venue ?? undefined,
        score,
        winner,
      });
    }
    if (unresolved.size > 0) {
      details.push(
        `football-data teams skipped (no alias-map match): ${[...unresolved].join(", ")}`,
      );
    }

    const result = await ctx.runMutation(
      internal.sync.footballData.applyFdUpdates,
      {
        updates,
      },
    );
    if (result.unmatched > 0) {
      details.push(
        `${result.unmatched} football-data matches had no local match yet`,
      );
    }

    // Event-driven recompute for every match whose data changed.
    if (result.changedMatchIds.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.predictions.recomputeForMatches,
        {
          matchIds: result.changedMatchIds,
        },
      );
    }

    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: true,
      itemsUpdated: result.changedMatchIds.length,
      detail: details.length > 0 ? details.join(" | ") : undefined,
    });
  } catch (error) {
    await ctx.runMutation(internal.sync.audit.log, {
      source,
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      itemsUpdated: 0,
      error: errorMessage(error),
      detail: details.length > 0 ? details.join(" | ") : undefined,
    });
    throw error;
  }
}

/** All matches — input for the results guard and FD pairing. */
export const listAllMatches = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("matches").collect();
  },
});

/**
 * Apply a football-data pass: link ids, move kickoffs, resolve knockout
 * slots (TBD → team ids; the "1A"/"W74" placeholder strings are kept for
 * display), update venue/status/score/winner. Returns the ids of matches
 * that actually changed so the caller can schedule the recompute.
 */
export const applyFdUpdates = internalMutation({
  args: {
    updates: v.array(
      v.object({
        footballDataId: v.number(),
        kickoffAt: v.number(),
        status: matchStatusValidator,
        homeCode: v.optional(v.string()),
        awayCode: v.optional(v.string()),
        venue: v.optional(v.string()),
        score: v.optional(scoreValidator),
        winner: v.optional(
          v.union(v.literal("home"), v.literal("away"), v.literal("draw")),
        ),
      }),
    ),
  },
  handler: async (ctx, { updates }) => {
    const [matches, teams] = await Promise.all([
      ctx.db.query("matches").collect(),
      ctx.db.query("teams").collect(),
    ]);
    const teamIdByCode = new Map(teams.map((team) => [team.code, team._id]));
    const codeByTeamId = new Map(teams.map((team) => [team._id, team.code]));

    const byFdId = new Map<number, (typeof matches)[number]>();
    const byPairing = new Map<string, (typeof matches)[number]>();
    for (const match of matches) {
      if (match.ext?.footballDataId !== undefined) {
        byFdId.set(match.ext.footballDataId, match);
      }
      if (match.homeTeamId && match.awayTeamId) {
        const homeCode = codeByTeamId.get(match.homeTeamId);
        const awayCode = codeByTeamId.get(match.awayTeamId);
        if (homeCode && awayCode) {
          byPairing.set(pairingKey(match.kickoffAt, homeCode, awayCode), match);
        }
      }
    }

    const changedMatchIds: Id<"matches">[] = [];
    let unmatched = 0;
    for (const update of updates) {
      const match =
        byFdId.get(update.footballDataId) ??
        (update.homeCode && update.awayCode
          ? byPairing.get(
              pairingKey(update.kickoffAt, update.homeCode, update.awayCode),
            )
          : undefined);
      if (!match) {
        unmatched += 1;
        continue;
      }

      const patch: Partial<Doc<"matches">> = {};
      if (match.ext?.footballDataId !== update.footballDataId) {
        patch.ext = { ...match.ext, footballDataId: update.footballDataId };
      }
      if (match.kickoffAt !== update.kickoffAt)
        patch.kickoffAt = update.kickoffAt;
      if (match.status !== update.status) patch.status = update.status;
      if (update.venue && match.venue !== update.venue)
        patch.venue = update.venue;

      // Knockout slot resolution: fill team ids once football-data knows them.
      const homeTeamId = update.homeCode
        ? teamIdByCode.get(update.homeCode)
        : undefined;
      const awayTeamId = update.awayCode
        ? teamIdByCode.get(update.awayCode)
        : undefined;
      if (homeTeamId && match.homeTeamId !== homeTeamId)
        patch.homeTeamId = homeTeamId;
      if (awayTeamId && match.awayTeamId !== awayTeamId)
        patch.awayTeamId = awayTeamId;

      if (
        update.score &&
        JSON.stringify(match.score) !== JSON.stringify(update.score)
      ) {
        patch.score = update.score;
      }
      if (
        update.status === "finished" &&
        update.winner &&
        update.winner !== "draw"
      ) {
        const winnerTeamId =
          update.winner === "home"
            ? (homeTeamId ?? match.homeTeamId)
            : (awayTeamId ?? match.awayTeamId);
        if (winnerTeamId && match.winnerTeamId !== winnerTeamId) {
          patch.winnerTeamId = winnerTeamId;
        }
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(match._id, patch);
        changedMatchIds.push(match._id);
      }
    }
    return { changedMatchIds, unmatched };
  },
});
