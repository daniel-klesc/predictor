/**
 * Minimal public team queries for the UI issue (which may extend them).
 */
import { v } from "convex/values";

import { query } from "./_generated/server";

/** A team by FIFA trigram, e.g. "CZE" (null when unknown). */
export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
  },
});

/** All 48 qualified teams (Tournament + Groups views join on `code`). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("teams").collect();
  },
});
