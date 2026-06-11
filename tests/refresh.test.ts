/**
 * Manual-refresh tests (fake ActionCtx): auth rejection, the 1-per-2-min
 * rate limit driven by the latest "manual-refresh" syncAudit row, and the
 * combined summary string returned to the UI.
 */
import { type FunctionReference, getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/convex/_generated/server";
import {
  MANUAL_REFRESH_MIN_INTERVAL_MS,
  runManualRefresh,
} from "@/convex/sync/refresh";

const nameOf = (ref: unknown): string =>
  getFunctionName(ref as FunctionReference<"query">);

interface FakeCtxOptions {
  identity?: unknown;
  lastManualStartedAt?: number | null;
  oddsSummary?: string;
  oddsError?: Error;
  fixturesError?: Error;
}

function makeCtx(options: FakeCtxOptions = {}) {
  const audits: Record<string, unknown>[] = [];
  const actionCalls: string[] = [];

  const ctx = {
    auth: {
      getUserIdentity: vi.fn(async () => options.identity ?? null),
    },
    runQuery: vi.fn(async (ref: unknown) => {
      const name = nameOf(ref);
      if (name === "sync/refresh:latestManualRefreshStartedAt") {
        return options.lastManualStartedAt ?? null;
      }
      throw new Error(`unexpected query: ${name}`);
    }),
    runAction: vi.fn(async (ref: unknown) => {
      const name = nameOf(ref);
      actionCalls.push(name);
      if (name === "sync/oddsApi:oddsSync") {
        if (options.oddsError) throw options.oddsError;
        return options.oddsSummary ?? "odds: 2 snapshots (2 changed)";
      }
      if (name === "sync/footballData:fixturesSync") {
        if (options.fixturesError) throw options.fixturesError;
        return null;
      }
      throw new Error(`unexpected action: ${name}`);
    }),
    runMutation: vi.fn(async (ref: unknown, args: Record<string, unknown>) => {
      const name = nameOf(ref);
      if (name === "sync/audit:log") {
        audits.push(args);
        return null;
      }
      throw new Error(`unexpected mutation: ${name}`);
    }),
  };
  return { ctx: ctx as unknown as ActionCtx, audits, actionCalls };
}

describe("runManualRefresh", () => {
  it("rejects unauthenticated callers without running anything", async () => {
    const { ctx, audits, actionCalls } = makeCtx({ identity: null });

    await expect(runManualRefresh(ctx)).rejects.toThrow("Not authenticated");
    expect(actionCalls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("enforces the 1-per-2-min rate limit via the latest manual-refresh audit row", async () => {
    const { ctx, audits, actionCalls } = makeCtx({
      identity: { subject: "user1" },
      lastManualStartedAt: Date.now() - 30_000,
    });

    const summary = await runManualRefresh(ctx);

    expect(summary).toContain("Rate limited");
    expect(actionCalls).toHaveLength(0);
    // Rate-limited attempts do NOT log a row (would extend the window forever).
    expect(audits).toHaveLength(0);
  });

  it("runs again once the window has passed", async () => {
    const { ctx, actionCalls } = makeCtx({
      identity: { subject: "user1" },
      lastManualStartedAt: Date.now() - MANUAL_REFRESH_MIN_INTERVAL_MS - 1000,
    });

    const summary = await runManualRefresh(ctx);

    expect(actionCalls).toEqual([
      "sync/oddsApi:oddsSync",
      "sync/footballData:fixturesSync",
    ]);
    expect(summary).toContain("results: refreshed");
  });

  it("triggers odds + results and logs one manual-refresh audit row", async () => {
    const { ctx, audits, actionCalls } = makeCtx({
      identity: { subject: "user1" },
      oddsSummary: "odds: 12 snapshots (3 changed), credits remaining 410",
    });

    const summary = await runManualRefresh(ctx);

    expect(actionCalls).toEqual([
      "sync/oddsApi:oddsSync",
      "sync/footballData:fixturesSync",
    ]);
    expect(summary).toBe(
      "odds: 12 snapshots (3 changed), credits remaining 410 · results: refreshed",
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      source: "manual-refresh",
      ok: true,
      detail: summary,
    });
  });

  it("reports partial failures in the summary and audits ok=false", async () => {
    const { ctx, audits } = makeCtx({
      identity: { subject: "user1" },
      oddsError: new Error("boom"),
    });

    const summary = await runManualRefresh(ctx);

    expect(summary).toContain("odds: failed (boom)");
    expect(summary).toContain("results: refreshed");
    expect(audits[0]).toMatchObject({ source: "manual-refresh", ok: false });
  });
});
