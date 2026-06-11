/**
 * Bets: propose (match-detail "+ Slip" / chat), the Bets-tab query, the
 * place/remove/update-stake flow, per-user betting settings, and the
 * internal auto-settlement pass triggered by results-sync when a match
 * reaches a final state. Settlement decisions live in the pure module
 * `convex/lib/settle.ts` (bookmaker convention: 1X2 / O-U 2.5 / BTTS all
 * settle on the 90-minute result; postponed/cancelled → void, stake back).
 *
 * Every public function scopes to the signed-in user — bets are personal.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { DEFAULT_BLEND_WEIGHT, DEFAULT_KELLY_MULTIPLIER } from "./lib/model";
import { settleBet } from "./lib/settle";

/**
 * One-tap propose from the analysis screens: inserts a `bets` doc with
 * status "proposed" and source "analysis" for the signed-in user.
 */
export const propose = mutation({
  args: {
    matchId: v.id("matches"),
    market: v.string(),
    selection: v.string(),
    odds: v.number(),
    bookmaker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated — sign in to propose bets");
    }
    return await ctx.db.insert("bets", {
      userId,
      matchId: args.matchId,
      market: args.market,
      selection: args.selection,
      odds: args.odds,
      bookmaker: args.bookmaker,
      status: "proposed",
      source: "analysis",
    });
  },
});

/** Slim match payload embedded in each Bets-tab card. */
async function betMatchSummary(
  ctx: QueryCtx,
  matchId: Id<"matches"> | undefined,
  cache: Map<string, BetMatchSummary | null>,
): Promise<BetMatchSummary | null> {
  if (!matchId) return null;
  const cached = cache.get(matchId);
  if (cached !== undefined) return cached;
  const match = await ctx.db.get(matchId);
  if (!match) {
    cache.set(matchId, null);
    return null;
  }
  const [home, away] = await Promise.all([
    match.homeTeamId ? ctx.db.get(match.homeTeamId) : null,
    match.awayTeamId ? ctx.db.get(match.awayTeamId) : null,
  ]);
  const summary = {
    _id: match._id,
    kickoffAt: match.kickoffAt,
    status: match.status,
    stage: match.stage,
    home: home ? { code: home.code, name: home.name } : null,
    away: away ? { code: away.code, name: away.name } : null,
    homePlaceholder: match.homePlaceholder,
    awayPlaceholder: match.awayPlaceholder,
  };
  cache.set(matchId, summary);
  return summary;
}

interface BetMatchSummary {
  _id: Id<"matches">;
  kickoffAt: number;
  status: Doc<"matches">["status"];
  stage: Doc<"matches">["stage"];
  home: { code: string; name: string } | null;
  away: { code: string; name: string } | null;
  homePlaceholder?: string;
  awayPlaceholder?: string;
}

/**
 * The signed-in user's bets, enriched and grouped for the Bets tab:
 * `proposed` (newest first, with edge + kellyFraction context from the
 * prediction's valueBets when the bet matches one), `placed` (open bets),
 * `settled` (won/lost/void, most recently settled first) — plus the user's
 * bankroll so the UI can compute the suggested stake. Null when signed out.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const [bets, settings] = await Promise.all([
      ctx.db
        .query("bets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    ]);

    const matchCache = new Map<string, BetMatchSummary | null>();
    const predictionCache = new Map<string, Doc<"predictions"> | null>();

    const enrich = async (bet: Doc<"bets">) => {
      const match = await betMatchSummary(ctx, bet.matchId, matchCache);
      // Edge/Kelly context only matters before placement (the Place dialog).
      let edge: number | null = null;
      let kellyFraction: number | null = null;
      if (bet.status === "proposed" && bet.matchId) {
        let prediction = predictionCache.get(bet.matchId);
        if (prediction === undefined) {
          prediction = await ctx.db
            .query("predictions")
            .withIndex("by_match", (q) =>
              q.eq("matchId", bet.matchId as Id<"matches">),
            )
            .first();
          predictionCache.set(bet.matchId, prediction);
        }
        const valueBet = prediction?.valueBets.find(
          (entry) =>
            entry.market === bet.market &&
            (entry.selection ?? "") === bet.selection,
        );
        edge = valueBet?.edge ?? null;
        kellyFraction = valueBet?.kellyFraction ?? null;
      }
      return { ...bet, match, edge, kellyFraction };
    };

    const enriched = await Promise.all(bets.map(enrich));

    const proposed = enriched
      .filter((bet) => bet.status === "proposed")
      .sort((a, b) => b._creationTime - a._creationTime);
    const placed = enriched
      .filter((bet) => bet.status === "placed")
      .sort(
        (a, b) =>
          (b.placedAt ?? b._creationTime) - (a.placedAt ?? a._creationTime),
      );
    const settled = enriched
      .filter(
        (bet) =>
          bet.status === "won" ||
          bet.status === "lost" ||
          bet.status === "void",
      )
      .sort(
        (a, b) =>
          (b.settledAt ?? b._creationTime) - (a.settledAt ?? a._creationTime),
      );

    return { proposed, placed, settled, bankroll: settings?.bankroll ?? null };
  },
});

/** Load a bet and verify it belongs to the signed-in user. */
async function getOwnedBet(
  ctx: MutationCtx,
  betId: Id<"bets">,
): Promise<Doc<"bets">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated — sign in to manage bets");
  }
  const bet = await ctx.db.get(betId);
  if (!bet || bet.userId !== userId) {
    throw new Error("Bet not found");
  }
  return bet;
}

function assertValidStake(stake: number): void {
  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error("Stake must be a positive number");
  }
}

/**
 * Confirm a proposed bet as placed (Daniel placed it manually on his
 * betting platform — no money moves here). Records the stake; the odds
 * taken were captured at propose time.
 */
export const place = mutation({
  args: { betId: v.id("bets"), stake: v.number() },
  handler: async (ctx, { betId, stake }) => {
    assertValidStake(stake);
    const bet = await getOwnedBet(ctx, betId);
    if (bet.status !== "proposed") {
      throw new Error("Only proposed bets can be placed");
    }
    await ctx.db.patch(betId, {
      status: "placed",
      stake,
      placedAt: Date.now(),
    });
  },
});

/** Dismiss a proposal. Only proposed bets can be removed. */
export const remove = mutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await getOwnedBet(ctx, betId);
    if (bet.status !== "proposed") {
      throw new Error("Only proposed bets can be dismissed");
    }
    await ctx.db.delete(betId);
  },
});

/** Adjust the recorded stake of an open (placed, unsettled) bet. */
export const updateStake = mutation({
  args: { betId: v.id("bets"), stake: v.number() },
  handler: async (ctx, { betId, stake }) => {
    assertValidStake(stake);
    const bet = await getOwnedBet(ctx, betId);
    if (bet.status !== "placed") {
      throw new Error("Only placed bets can have their stake updated");
    }
    await ctx.db.patch(betId, { stake });
  },
});

/**
 * Settle all PLACED bets on a match — scheduled by results-sync whenever a
 * match transitions into a final state (finished/postponed/cancelled) or a
 * finished match's score changes. Idempotent: already-settled bets are
 * never touched, and a re-run on the same final state is a no-op. Bets the
 * pure decision can't resolve (unknown markets, finished without a score)
 * stay placed for manual settlement. Outright bets (no matchId) are out of
 * the by_match index, so the pass never sees them.
 */
export const settleForMatch = internalMutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) return;
    const bets = await ctx.db
      .query("bets")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const settledAt = Date.now();
    for (const bet of bets) {
      if (bet.status !== "placed") continue;
      const patch = settleBet(bet, match);
      if (patch === null) continue;
      await ctx.db.patch(bet._id, { ...patch, settledAt });
    }
  },
});

/**
 * The signed-in user's betting settings with documented defaults applied
 * (kellyMultiplier 0.25, blendWeight 0.7). Bankroll stays null until set —
 * stake suggestions are omitted without it. Null when signed out.
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      bankroll: settings?.bankroll ?? null,
      kellyMultiplier: settings?.kellyMultiplier ?? DEFAULT_KELLY_MULTIPLIER,
      blendWeight: settings?.blendWeight ?? DEFAULT_BLEND_WEIGHT,
    };
  },
});

/**
 * Upsert the signed-in user's bankroll / Kelly multiplier (Settings sheet).
 * Omitted fields stay unchanged; the kelly multiplier feeds the next
 * predictions recompute, the bankroll feeds stake suggestions directly.
 */
export const updateSettings = mutation({
  args: {
    bankroll: v.optional(v.number()),
    kellyMultiplier: v.optional(v.number()),
  },
  handler: async (ctx, { bankroll, kellyMultiplier }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated — sign in to update settings");
    }
    if (
      bankroll !== undefined &&
      (!Number.isFinite(bankroll) || bankroll < 0)
    ) {
      throw new Error("Bankroll must be zero or a positive number");
    }
    if (
      kellyMultiplier !== undefined &&
      (!Number.isFinite(kellyMultiplier) ||
        kellyMultiplier <= 0 ||
        kellyMultiplier > 1)
    ) {
      throw new Error("Kelly multiplier must be between 0 and 1");
    }
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      const patch: Partial<Doc<"userSettings">> = {};
      if (bankroll !== undefined) patch.bankroll = bankroll;
      if (kellyMultiplier !== undefined)
        patch.kellyMultiplier = kellyMultiplier;
      if (Object.keys(patch).length > 0)
        await ctx.db.patch(existing._id, patch);
      return;
    }
    await ctx.db.insert("userSettings", {
      userId,
      bankroll,
      kellyMultiplier: kellyMultiplier ?? DEFAULT_KELLY_MULTIPLIER,
      blendWeight: DEFAULT_BLEND_WEIGHT,
    });
  },
});
