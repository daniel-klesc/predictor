/**
 * Public tournament-simulation queries for the UI (Matches → Tournament
 * view). Sims are an append-only time series; "latest" is the newest doc.
 */
import { query } from "./_generated/server";

/** Latest Monte-Carlo tournament simulation (null until the first run). */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tournamentSims")
      .withIndex("by_computedAt")
      .order("desc")
      .first();
  },
});
