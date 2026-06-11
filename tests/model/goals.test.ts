import { describe, expect, it } from "vitest";

import {
  BASE_TOTAL_GOALS,
  expectedGoals,
  MAX_LAMBDA,
  MIN_LAMBDA,
} from "@/convex/lib/model/goals";

describe("expectedGoals", () => {
  it("splits the μ ≈ 2.6 baseline evenly for equal teams", () => {
    const { home, away } = expectedGoals(0);
    expect(home).toBeCloseTo(BASE_TOTAL_GOALS / 2, 12);
    expect(away).toBeCloseTo(BASE_TOTAL_GOALS / 2, 12);
    expect(BASE_TOTAL_GOALS).toBeCloseTo(2.6, 12);
  });

  it("gives the stronger side more goals, monotonically in the diff", () => {
    const d100 = expectedGoals(100);
    const d300 = expectedGoals(300);
    expect(d100.home).toBeGreaterThan(d100.away);
    expect(d300.home).toBeGreaterThan(d100.home);
    expect(d300.away).toBeLessThan(d100.away);
  });

  it("is mirror-symmetric in the sign of the diff", () => {
    const plus = expectedGoals(220);
    const minus = expectedGoals(-220);
    expect(plus.home).toBeCloseTo(minus.away, 12);
    expect(plus.away).toBeCloseTo(minus.home, 12);
  });

  it("clamps extreme mismatches into [MIN_LAMBDA, MAX_LAMBDA]", () => {
    const blowout = expectedGoals(2000);
    expect(blowout.home).toBe(MAX_LAMBDA);
    expect(blowout.away).toBe(MIN_LAMBDA);
    const reverse = expectedGoals(-2000);
    expect(reverse.home).toBe(MIN_LAMBDA);
    expect(reverse.away).toBe(MAX_LAMBDA);
  });
});
