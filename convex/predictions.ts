/**
 * Predictions recompute — event-driven (scheduled by the sync actions after
 * data changes, never by a cron).
 *
 * `recomputeForMatches` / `recomputeAll` keep the original stub signatures
 * (issues #2/#3 already schedule them). Each match with both teams resolved
 * gets EXACTLY ONE `predictions` doc, upserted in place; matches without a
 * resolved pairing are skipped. Matches with no odds snapshot (the odds
 * issue runs in parallel and the API key may be absent) get model-only
 * predictions: no market/blend sections and an empty valueBets array.
 *
 * `recomputeAll` additionally schedules the Monte-Carlo tournament
 * simulation (`simulate` internal action → one `tournamentSims` doc).
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  assessValue,
  computePrediction,
  DEFAULT_BLEND_WEIGHT,
  DEFAULT_KELLY_MULTIPLIER,
  DEFAULT_SIM_RUNS,
  DEFAULT_SIM_SEED,
  type PredictionResult,
  type SimMatch,
  simulateTournament,
  type SimTeam,
} from "./lib/model";

interface ModelSettings {
  blendWeight: number;
  kellyMultiplier: number;
}

/**
 * Settings of the earliest-created user (single-user app), falling back to
 * the documented defaults (blendWeight 0.7, kellyMultiplier 0.25).
 */
async function loadSettings(ctx: QueryCtx): Promise<ModelSettings> {
  const all = await ctx.db.query("userSettings").collect();
  const first = [...all].sort((a, b) => a._creationTime - b._creationTime)[0];
  return {
    blendWeight: first?.blendWeight ?? DEFAULT_BLEND_WEIGHT,
    kellyMultiplier: first?.kellyMultiplier ?? DEFAULT_KELLY_MULTIPLIER,
  };
}

/** Upsert the single predictions doc for a match (defensively de-duped). */
async function upsertPrediction(
  ctx: MutationCtx,
  matchId: Id<"matches">,
  result: PredictionResult,
): Promise<void> {
  const doc = {
    matchId,
    computedAt: Date.now(),
    inputs: result.inputs,
    // Explicit field list — the lib result carries extras (pQualify*) that
    // the schema does not persist.
    model: {
      pHome: result.model.pHome,
      pDraw: result.model.pDraw,
      pAway: result.model.pAway,
      pOver25: result.model.pOver25,
      pUnder25: result.model.pUnder25,
      pBttsYes: result.model.pBttsYes,
      pBttsNo: result.model.pBttsNo,
      topScorelines: result.model.topScorelines,
    },
    market: result.market,
    blend: result.blend,
    valueBets: result.valueBets,
  };
  const existing = await ctx.db
    .query("predictions")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  if (existing.length === 0) {
    await ctx.db.insert("predictions", doc);
    return;
  }
  await ctx.db.replace(existing[0]._id, doc);
  for (const extra of existing.slice(1)) {
    await ctx.db.delete(extra._id);
  }
}

/** Recompute predictions for the given matches; returns docs written. */
async function recomputeMatches(
  ctx: MutationCtx,
  matches: Doc<"matches">[],
): Promise<number> {
  const teams = await ctx.db.query("teams").collect();
  const teamById = new Map(teams.map((team) => [team._id, team]));
  const settings = await loadSettings(ctx);

  let written = 0;
  for (const match of matches) {
    if (!match.homeTeamId || !match.awayTeamId) continue;
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) continue;
    const snapshot = await ctx.db
      .query("oddsSnapshots")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .order("desc")
      .first();
    const result = computePrediction({
      homeElo: home.elo,
      awayElo: away.elo,
      hostAdvApplies: home.isHost,
      stage: match.stage,
      oddsBest: snapshot?.best,
      oddsMedian: snapshot?.median,
      blendWeight: settings.blendWeight,
      kellyMultiplier: settings.kellyMultiplier,
    });
    await upsertPrediction(ctx, match._id, result);
    written += 1;
  }
  return written;
}

/** Recompute predictions for specific matches (scheduled after fixture/result changes). */
export const recomputeForMatches = internalMutation({
  args: { matchIds: v.array(v.id("matches")) },
  handler: async (ctx, { matchIds }): Promise<{ written: number }> => {
    const unique = [...new Set(matchIds)];
    const matches = (
      await Promise.all(unique.map((id) => ctx.db.get(id)))
    ).filter((match): match is Doc<"matches"> => match !== null);
    const written = await recomputeMatches(ctx, matches);
    return { written };
  },
});

/** Full recompute (scheduled after seed and Elo refreshes). */
export const recomputeAll = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ written: number }> => {
    const matches = await ctx.db.query("matches").collect();
    const written = await recomputeMatches(ctx, matches);
    // The tournament sim is too heavy for a mutation — run it as a
    // scheduled action on the same fresh data.
    await ctx.scheduler.runAfter(0, internal.predictions.simulate, {});
    return { written };
  },
});

interface SimInputs {
  teams: SimTeam[];
  matches: SimMatch[];
  kellyMultiplier: number;
  outrightPrices: Array<{
    teamCode: string;
    bestOdds: number;
    medianOdds: number;
    bookmaker: string;
  }>;
}

/** Everything the tournament simulation needs, in pure-lib shapes. */
export const simInputs = internalQuery({
  args: {},
  handler: async (ctx): Promise<SimInputs> => {
    const [teams, matches, outright, settings] = await Promise.all([
      ctx.db.query("teams").collect(),
      ctx.db.query("matches").collect(),
      ctx.db
        .query("outrightSnapshots")
        .withIndex("by_fetchedAt")
        .order("desc")
        .first(),
      loadSettings(ctx),
    ]);
    const codeById = new Map(teams.map((team) => [team._id, team.code]));
    return {
      teams: teams.map((team) => ({
        code: team.code,
        elo: team.elo,
        group: team.group,
        isHost: team.isHost,
      })),
      matches: matches.map((match) => ({
        matchNumber: match.matchNumber,
        stage: match.stage,
        group: match.group,
        homeCode: match.homeTeamId ? codeById.get(match.homeTeamId) : undefined,
        awayCode: match.awayTeamId ? codeById.get(match.awayTeamId) : undefined,
        homePlaceholder: match.homePlaceholder,
        awayPlaceholder: match.awayPlaceholder,
        status: match.status,
        score: match.score
          ? { home: match.score.home, away: match.score.away }
          : undefined,
        winnerCode: match.winnerTeamId
          ? codeById.get(match.winnerTeamId)
          : undefined,
      })),
      kellyMultiplier: settings.kellyMultiplier,
      outrightPrices: outright?.prices ?? [],
    };
  },
});

/**
 * Monte-Carlo tournament simulation (~10k seeded runs) → one
 * tournamentSims doc. Outright value uses the match-bet rule minus the
 * odds ceiling (tournament-winner longshots routinely trade above 15).
 */
export const simulate = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const inputs: SimInputs = await ctx.runQuery(
      internal.predictions.simInputs,
      {},
    );
    const result = simulateTournament(inputs.teams, inputs.matches, {
      runs: DEFAULT_SIM_RUNS,
      seed: DEFAULT_SIM_SEED,
    });
    const priceByCode = new Map(
      inputs.outrightPrices.map((price) => [price.teamCode, price]),
    );
    const valueOutrights: Array<{
      teamCode: string;
      market: string;
      pModel: number;
      pImplied: number;
      edge: number;
      bestOdds: number;
      bookmaker: string;
      kellyFraction: number;
    }> = [];
    for (const team of result.perTeam) {
      const price = priceByCode.get(team.teamCode);
      if (!price) continue;
      const assessed = assessValue(team.pChampion, price.bestOdds, {
        kellyMultiplier: inputs.kellyMultiplier,
        maxOdds: Number.POSITIVE_INFINITY,
      });
      if (!assessed.isValue) continue;
      valueOutrights.push({
        teamCode: team.teamCode,
        market: "outright",
        pModel: team.pChampion,
        pImplied: assessed.pImplied,
        edge: assessed.edge,
        bestOdds: price.bestOdds,
        bookmaker: price.bookmaker,
        kellyFraction: assessed.kellyFraction,
      });
    }
    await ctx.runMutation(internal.predictions.saveSim, {
      runs: result.runs,
      perTeam: result.perTeam,
      valueOutrights,
    });
  },
});

/** Persist one tournament simulation result (append-only time series). */
export const saveSim = internalMutation({
  args: {
    runs: v.number(),
    perTeam: v.array(
      v.object({
        teamCode: v.string(),
        pWinGroup: v.number(),
        pR32: v.number(),
        pR16: v.number(),
        pQF: v.number(),
        pSF: v.number(),
        pFinal: v.number(),
        pChampion: v.number(),
      }),
    ),
    valueOutrights: v.array(
      v.object({
        teamCode: v.string(),
        market: v.string(),
        pModel: v.number(),
        pImplied: v.number(),
        edge: v.number(),
        bestOdds: v.number(),
        bookmaker: v.string(),
        kellyFraction: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tournamentSims", {
      computedAt: Date.now(),
      runs: args.runs,
      perTeam: args.perTeam,
      valueOutrights: args.valueOutrights,
    });
  },
});
