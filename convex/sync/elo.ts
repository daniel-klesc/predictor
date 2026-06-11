/**
 * elo-nightly sync (cron, daily 03:30 UTC): refresh team Elo ratings from
 * the eloratings.net TSV endpoints (no API key needed). Teams without a
 * resolvable Elo entry are logged and skipped — never guessed. When any
 * rating changed, the full predictions recompute is scheduled.
 */
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import {
  ELO_TEAMS_TSV_URL,
  ELO_WORLD_TSV_URL,
  eloRatingsByTeamCode,
  parseEloTsv,
} from "../lib/eloTsv";
import { errorMessage, fetchText } from "./util";

export const nightly = internalAction({
  args: {},
  handler: async (ctx) => {
    const startedAt = Date.now();
    try {
      const [worldTsv, teamsTsv] = await Promise.all([
        fetchText(ELO_WORLD_TSV_URL),
        fetchText(ELO_TEAMS_TSV_URL),
      ]);
      const ratings = eloRatingsByTeamCode(parseEloTsv(worldTsv, teamsTsv));
      const result = await ctx.runMutation(internal.sync.elo.applyRatings, {
        ratings: [...ratings.entries()].map(([code, value]) => ({
          code,
          rating: value.rating,
          eloName: value.eloName,
        })),
      });

      if (result.changed > 0) {
        await ctx.scheduler.runAfter(0, internal.predictions.recomputeAll, {});
      }

      await ctx.runMutation(internal.sync.audit.log, {
        source: "elo-nightly",
        startedAt,
        finishedAt: Date.now(),
        ok: true,
        itemsUpdated: result.changed,
        detail:
          result.missing.length > 0
            ? `teams without a resolvable Elo entry skipped: ${result.missing.join(", ")}`
            : undefined,
      });
    } catch (error) {
      await ctx.runMutation(internal.sync.audit.log, {
        source: "elo-nightly",
        startedAt,
        finishedAt: Date.now(),
        ok: false,
        itemsUpdated: 0,
        error: errorMessage(error),
      });
      throw error;
    }
  },
});

/** Patch changed Elo ratings onto teams; returns codes with no rating. */
export const applyRatings = internalMutation({
  args: {
    ratings: v.array(
      v.object({
        code: v.string(),
        rating: v.number(),
        eloName: v.string(),
      }),
    ),
  },
  handler: async (ctx, { ratings }) => {
    const byCode = new Map(ratings.map((r) => [r.code, r]));
    const teams = await ctx.db.query("teams").collect();
    let changed = 0;
    const missing: string[] = [];
    for (const team of teams) {
      const rating = byCode.get(team.code);
      if (!rating) {
        missing.push(team.code);
        continue;
      }
      if (team.elo !== rating.rating || team.ext?.eloName !== rating.eloName) {
        await ctx.db.patch(team._id, {
          elo: rating.rating,
          ext: { ...team.ext, eloName: rating.eloName },
        });
        changed += 1;
      }
    }
    return { changed, missing };
  },
});
