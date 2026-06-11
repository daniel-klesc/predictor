/**
 * Manual refresh — public, AUTHED action behind the UI's refresh button
 * (Today screen / Settings sheet). Triggers the odds sync plus a full
 * football-data fixtures/results pass, rate-limited to one run per
 * 2 minutes via the most recent "manual-refresh" syncAudit row. Returns a
 * human-readable summary string for the UI.
 */
import { internal } from "../_generated/api";
import { type ActionCtx, action, internalQuery } from "../_generated/server";
import { errorMessage } from "./util";

/** Minimum interval between manual refreshes. */
export const MANUAL_REFRESH_MIN_INTERVAL_MS = 2 * 60 * 1000;

const SOURCE = "manual-refresh";

export const manualRefresh = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await runManualRefresh(ctx);
  },
});

/** Exported for the fake-ctx unit tests. */
export async function runManualRefresh(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated — manual refresh requires sign-in");
  }

  const startedAt = Date.now();
  const last = await ctx.runQuery(
    internal.sync.refresh.latestManualRefreshStartedAt,
    {},
  );
  if (last !== null && startedAt - last < MANUAL_REFRESH_MIN_INTERVAL_MS) {
    const retryInS = Math.ceil(
      (MANUAL_REFRESH_MIN_INTERVAL_MS - (startedAt - last)) / 1000,
    );
    return `Rate limited — manual refresh runs at most once per 2 minutes. Try again in ${retryInS}s.`;
  }

  const parts: string[] = [];
  let ok = true;
  try {
    parts.push(await ctx.runAction(internal.sync.oddsApi.oddsSync, {}));
  } catch (error) {
    ok = false;
    parts.push(`odds: failed (${errorMessage(error, 200)})`);
  }
  try {
    // Full unguarded pass: statuses, scores, kickoff moves, slot resolution.
    await ctx.runAction(internal.sync.footballData.fixturesSync, {});
    parts.push("results: refreshed");
  } catch (error) {
    ok = false;
    parts.push(`results: failed (${errorMessage(error, 200)})`);
  }

  const summary = parts.join(" · ");
  await ctx.runMutation(internal.sync.audit.log, {
    source: SOURCE,
    startedAt,
    finishedAt: Date.now(),
    ok,
    itemsUpdated: 0,
    detail: summary,
  });
  return summary;
}

/** startedAt of the most recent manual refresh (rate-limit input). */
export const latestManualRefreshStartedAt = internalQuery({
  args: {},
  handler: async (ctx): Promise<number | null> => {
    const latest = await ctx.db
      .query("syncAudit")
      .withIndex("by_source", (q) => q.eq("source", SOURCE))
      .order("desc")
      .first();
    return latest?.startedAt ?? null;
  },
});
