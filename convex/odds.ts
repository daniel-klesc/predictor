/**
 * Public odds-snapshot queries for the UI (the screens issue may extend).
 * Snapshots are an append-only time series; "latest" is the newest fetchedAt
 * per match. Matches without a snapshot are simply unpriced ("no odds yet").
 */
import { v } from "convex/values";

import { query } from "./_generated/server";

/** Latest odds snapshot for one match (null while unpriced). */
export const latestForMatch = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    return await ctx.db
      .query("oddsSnapshots")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .order("desc")
      .first();
  },
});

/** Latest odds snapshot per requested match (null entries for unpriced ones). */
export const latestForMatches = query({
  args: { matchIds: v.array(v.id("matches")) },
  handler: async (ctx, { matchIds }) => {
    return await Promise.all(
      matchIds.map(async (matchId) => ({
        matchId,
        snapshot: await ctx.db
          .query("oddsSnapshots")
          .withIndex("by_match", (q) => q.eq("matchId", matchId))
          .order("desc")
          .first(),
      })),
    );
  },
});

/**
 * Full h2h price history for one match — one compact point per snapshot
 * (median consensus line, falling back to best prices for old snapshots
 * without a median). Ascending by fetchedAt (index order). Backs the
 * odds-movement sparklines; snapshots without any h2h prices are skipped.
 */
export const historyForMatch = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const snapshots = await ctx.db
      .query("oddsSnapshots")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const points: Array<{
      fetchedAt: number;
      h2h: { home: number; draw: number; away: number };
    }> = [];
    for (const snapshot of snapshots) {
      const h2h = snapshot.median?.h2h ?? snapshot.best?.h2h;
      if (!h2h) continue;
      points.push({
        fetchedAt: snapshot.fetchedAt,
        h2h: { home: h2h.home, draw: h2h.draw, away: h2h.away },
      });
    }
    return points;
  },
});

/** Latest tournament-winner outright snapshot (null until the first sync). */
export const latestOutright = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("outrightSnapshots")
      .withIndex("by_fetchedAt")
      .order("desc")
      .first();
  },
});
