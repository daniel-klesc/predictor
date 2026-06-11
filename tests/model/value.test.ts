import { describe, expect, it } from "vitest";

import {
  assessValue,
  DEFAULT_KELLY_MULTIPLIER,
  kellyFraction,
  MAX_KELLY_FRACTION,
  MAX_VALUE_ODDS,
  MIN_VALUE_EDGE,
  MIN_VALUE_ODDS,
} from "@/convex/lib/model/value";

describe("kellyFraction", () => {
  it("is fractional Kelly × 0.25", () => {
    // full Kelly = (0.5·2.4 − 1)/1.4 = 1/7
    expect(kellyFraction(0.5, 2.4)).toBeCloseTo(
      (1 / 7) * DEFAULT_KELLY_MULTIPLIER,
      12,
    );
  });

  it("caps the stake at 5% of bankroll", () => {
    // full Kelly = (0.9·3 − 1)/2 = 0.85 → ×0.25 = 0.2125 → capped
    expect(kellyFraction(0.9, 3)).toBe(MAX_KELLY_FRACTION);
    expect(MAX_KELLY_FRACTION).toBe(0.05);
  });

  it("is 0 when the edge is non-positive", () => {
    expect(kellyFraction(0.3, 3)).toBe(0); // p·o = 0.9 < 1
    expect(kellyFraction(1 / 3, 3)).toBe(0); // p·o = 1 exactly
    expect(kellyFraction(0.5, 1)).toBe(0); // no payout
  });
});

describe("assessValue", () => {
  it("flags edge > 0.02 inside the 1.1–15 odds band", () => {
    const assessed = assessValue(0.55, 2.0);
    expect(assessed.edge).toBeCloseTo(0.05, 12);
    expect(assessed.isValue).toBe(true);
    expect(assessed.kellyFraction).toBeGreaterThan(0);
    expect(assessed.kellyFraction).toBeLessThanOrEqual(MAX_KELLY_FRACTION);
  });

  it("does not flag an edge at or below the threshold (strictly greater)", () => {
    expect(MIN_VALUE_EDGE).toBe(0.02);
    // below the default threshold (dyadic values keep the floats exact)
    const below = assessValue(0.515625, 2.0); // edge = 0.015625 exactly
    expect(below.isValue).toBe(false);
    expect(below.kellyFraction).toBe(0);
    // exactly equal to the threshold (dyadic override keeps it exact)
    const exact = assessValue(0.53125, 2.0, { minEdge: 0.03125 });
    expect(exact.edge).toBe(0.03125);
    expect(exact.isValue).toBe(false);
  });

  it("does not flag negative or zero edges", () => {
    const assessed = assessValue(0.4, 2.0);
    expect(assessed.isValue).toBe(false);
    expect(assessed.kellyFraction).toBe(0);
  });

  it("does not flag outside the 1.1–15 odds band, however big the edge", () => {
    expect(MIN_VALUE_ODDS).toBe(1.1);
    expect(MAX_VALUE_ODDS).toBe(15);
    expect(assessValue(0.99, 1.05).isValue).toBe(false);
    expect(assessValue(0.5, 16).isValue).toBe(false);
    // boundary values are inside the band
    expect(assessValue(0.95, 1.1).isValue).toBe(true);
    expect(assessValue(0.1, 15).isValue).toBe(true);
  });

  it("supports lifting the odds ceiling for outrights", () => {
    const assessed = assessValue(0.1, 40, {
      maxOdds: Number.POSITIVE_INFINITY,
    });
    expect(assessed.isValue).toBe(true);
    expect(assessed.kellyFraction).toBeGreaterThan(0);
  });

  it("honours a custom Kelly multiplier", () => {
    const quarter = assessValue(0.55, 2.0, { kellyMultiplier: 0.25 });
    const half = assessValue(0.55, 2.0, { kellyMultiplier: 0.5 });
    expect(half.kellyFraction).toBeCloseTo(quarter.kellyFraction * 2, 12);
  });
});
