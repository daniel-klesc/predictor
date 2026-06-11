/**
 * Bet mutations. The match-detail "+ Slip" button proposes a bet here; the
 * confirm/stake flow and the Bets tab UI belong to the bet-slip issue (#6).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation } from "./_generated/server";

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
