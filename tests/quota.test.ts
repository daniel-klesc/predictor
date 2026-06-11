import { describe, expect, it } from "vitest";

import {
  QUOTA_MIN_CREDITS,
  parseCreditsHeader,
  shouldSkipForQuota,
  startOfUtcMonth,
} from "@/convex/lib/quota";

describe("parseCreditsHeader", () => {
  it("parses integer header strings", () => {
    expect(parseCreditsHeader("412")).toBe(412);
    expect(parseCreditsHeader("0")).toBe(0);
  });

  it("parses decimal header strings (the API reports floats on some plans)", () => {
    expect(parseCreditsHeader("411.0")).toBe(411);
    expect(parseCreditsHeader("410.5")).toBe(410.5);
  });

  it("trims whitespace", () => {
    expect(parseCreditsHeader("  37 ")).toBe(37);
  });

  it("is undefined for a missing header", () => {
    expect(parseCreditsHeader(null)).toBeUndefined();
    expect(parseCreditsHeader(undefined)).toBeUndefined();
  });

  it("is undefined for non-numeric garbage — never guessed", () => {
    expect(parseCreditsHeader("")).toBeUndefined();
    expect(parseCreditsHeader("   ")).toBeUndefined();
    expect(parseCreditsHeader("n/a")).toBeUndefined();
    expect(parseCreditsHeader("Infinity")).toBeUndefined();
  });
});

describe("shouldSkipForQuota (HARD-STOP)", () => {
  it("skips when remaining credits are below the threshold", () => {
    expect(shouldSkipForQuota(QUOTA_MIN_CREDITS - 1)).toBe(true);
    expect(shouldSkipForQuota(29)).toBe(true);
    expect(shouldSkipForQuota(1)).toBe(true);
    expect(shouldSkipForQuota(0)).toBe(true);
  });

  it("runs at exactly the threshold and above", () => {
    expect(shouldSkipForQuota(QUOTA_MIN_CREDITS)).toBe(false);
    expect(shouldSkipForQuota(30)).toBe(false);
    expect(shouldSkipForQuota(500)).toBe(false);
  });

  it("never blocks on unknown remaining (no odds call recorded yet)", () => {
    expect(shouldSkipForQuota(null)).toBe(false);
    expect(shouldSkipForQuota(undefined)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(shouldSkipForQuota(49, 50)).toBe(true);
    expect(shouldSkipForQuota(50, 50)).toBe(false);
  });
});

describe("startOfUtcMonth", () => {
  it("returns the first millisecond of the UTC month", () => {
    expect(startOfUtcMonth(Date.UTC(2026, 5, 11, 20, 30))).toBe(
      Date.UTC(2026, 5, 1),
    );
    expect(startOfUtcMonth(Date.UTC(2026, 6, 1, 0, 0, 0, 0))).toBe(
      Date.UTC(2026, 6, 1),
    );
  });

  it("credits recorded last month fall before this month's boundary (stale)", () => {
    const recordedAt = Date.UTC(2026, 5, 30, 23, 59);
    const now = Date.UTC(2026, 6, 2, 8, 0);
    expect(recordedAt < startOfUtcMonth(now)).toBe(true);
  });
});
