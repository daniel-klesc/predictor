/**
 * Minimal public match queries for the UI issue (which may extend them).
 */
import { v } from "convex/values";

import { query } from "./_generated/server";

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
