import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

/** Append one syncAudit row. Every sync run logs exactly one (ok or error). */
export const log = internalMutation({
  args: {
    source: v.string(),
    startedAt: v.number(),
    finishedAt: v.number(),
    ok: v.boolean(),
    itemsUpdated: v.number(),
    error: v.optional(v.string()),
    detail: v.optional(v.string()),
    creditsRemaining: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("syncAudit", args);
  },
});
