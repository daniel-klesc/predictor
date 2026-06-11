/**
 * Public match queries for the UI. All are index-backed (`by_kickoff` /
 * `by_match`); the "withData" variants enrich matches with the slim team
 * summaries, the prediction doc, and the latest best odds so the screens
 * subscribe once per view and stay live on any dependent change.
 */
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";

/**
 * Matches with kickoff in [start, end) — UTC milliseconds. The UI computes
 * day boundaries in the display timezone (Europe/Prague) and passes them in.
 */
export const listByDay = query({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, { start, end }) => {
    return await ctx.db
      .query("matches")
      .withIndex("by_kickoff", (q) =>
        q.gte("kickoffAt", start).lt("kickoffAt", end),
      )
      .collect();
  },
});

/** A single match by id (null when it does not exist). */
export const get = query({
  args: { id: v.id("matches") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/** Slim team shape embedded in enriched match payloads. */
function teamSummary(team: Doc<"teams"> | null) {
  if (!team) return null;
  return {
    code: team.code,
    name: team.name,
    group: team.group,
    elo: team.elo,
    isHost: team.isHost,
  };
}

export type TeamSummary = ReturnType<typeof teamSummary>;

/** Match + teams + prediction + latest best odds (one reactive payload). */
async function withData(ctx: QueryCtx, match: Doc<"matches">) {
  const [home, away, prediction, snapshot] = await Promise.all([
    match.homeTeamId ? ctx.db.get(match.homeTeamId) : null,
    match.awayTeamId ? ctx.db.get(match.awayTeamId) : null,
    ctx.db
      .query("predictions")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .first(),
    ctx.db
      .query("oddsSnapshots")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .order("desc")
      .first(),
  ]);
  return {
    ...match,
    home: teamSummary(home),
    away: teamSummary(away),
    prediction,
    // Only `best` is UI-relevant — the raw bookmakers array stays server-side.
    odds: snapshot
      ? { best: snapshot.best ?? null, fetchedAt: snapshot.fetchedAt }
      : null,
  };
}

/**
 * Enriched matches with kickoff in [start, end) — UTC ms, sorted by kickoff.
 * Backs the Today screen (today / tomorrow / next-matchday sections).
 */
export const listByDayWithData = query({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, { start, end }) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_kickoff", (q) =>
        q.gte("kickoffAt", start).lt("kickoffAt", end),
      )
      .collect();
    return await Promise.all(matches.map((match) => withData(ctx, match)));
  },
});

/**
 * One enriched match by id. Takes a string and normalizes it so malformed
 * route params resolve to null instead of throwing.
 */
export const getWithData = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const matchId = ctx.db.normalizeId("matches", id);
    if (!matchId) return null;
    const match = await ctx.db.get(matchId);
    if (!match) return null;
    return await withData(ctx, match);
  },
});

/**
 * All 104 matches sorted by kickoff, with team summaries and the top value
 * bet per match (compact payload for the Matches/Schedule + Groups views).
 */
export const listAllWithTeams = query({
  args: {},
  handler: async (ctx) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_kickoff")
      .collect();
    return await Promise.all(
      matches.map(async (match) => {
        const [home, away, prediction] = await Promise.all([
          match.homeTeamId ? ctx.db.get(match.homeTeamId) : null,
          match.awayTeamId ? ctx.db.get(match.awayTeamId) : null,
          ctx.db
            .query("predictions")
            .withIndex("by_match", (q) => q.eq("matchId", match._id))
            .first(),
        ]);
        let topValue: {
          market: string;
          selection?: string;
          edge: number;
          bestOdds: number;
        } | null = null;
        for (const bet of prediction?.valueBets ?? []) {
          if (!topValue || bet.edge > topValue.edge) {
            topValue = {
              market: bet.market,
              selection: bet.selection,
              edge: bet.edge,
              bestOdds: bet.bestOdds,
            };
          }
        }
        return {
          ...match,
          home: teamSummary(home),
          away: teamSummary(away),
          topValue,
        };
      }),
    );
  },
});

/**
 * Kickoff of the next match at or after `after` (UTC ms; null when none).
 * The Today screen uses it to jump to the next matchday on empty days.
 */
export const nextKickoffAfter = query({
  args: { after: v.number() },
  handler: async (ctx, { after }) => {
    const next = await ctx.db
      .query("matches")
      .withIndex("by_kickoff", (q) => q.gte("kickoffAt", after))
      .first();
    return next?.kickoffAt ?? null;
  },
});
