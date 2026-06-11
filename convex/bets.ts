/**
 * Bet mutations. The match-detail "+ Slip" button proposes a bet here; the
 * confirm/stake flow and the Bets tab UI belong to the bet-slip issue (#6).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation } from "./_generated/server";

/**
 * One-tap propose from the analysis screens: inserts a `bets` doc with
 * status "proposed" for the signed-in user. `source` defaults to "analysis";
 * the chat backend's `propose_bet` tool passes "chat" (and an optional
 * `note`) — appended as optional args so existing call sites are unchanged.
 */
export const propose = mutation({
  args: {
    matchId: v.id("matches"),
    market: v.string(),
    selection: v.string(),
    odds: v.number(),
    bookmaker: v.optional(v.string()),
    note: v.optional(v.string()),
    source: v.optional(v.union(v.literal("analysis"), v.literal("chat"))),
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
      note: args.note,
      status: "proposed",
      source: args.source ?? "analysis",
    });
  },
});
