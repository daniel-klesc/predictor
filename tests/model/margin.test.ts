import { describe, expect, it } from "vitest";

import {
  impliedProbability,
  proportional,
  shin,
} from "@/convex/lib/model/margin";

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("proportional", () => {
  it("sums to 1", () => {
    expect(sum(proportional([2.1, 3.4, 3.6]))).toBeCloseTo(1, 12);
    expect(sum(proportional([1.85, 1.95]))).toBeCloseTo(1, 12);
  });

  it("is exact for a margin-free book", () => {
    expect(proportional([2, 4, 4])).toEqual([0.5, 0.25, 0.25]);
  });
});

describe("shin", () => {
  it("sums to 1 for three outcomes", () => {
    expect(sum(shin([2.1, 3.4, 3.6]))).toBeCloseTo(1, 9);
    expect(sum(shin([1.3, 5.5, 9]))).toBeCloseTo(1, 9);
  });

  it("sums to 1 for two outcomes (closed form)", () => {
    const probs = shin([1.85, 1.95]);
    expect(sum(probs)).toBeCloseTo(1, 9);
    for (const p of probs) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("equals the raw implied probabilities for a margin-free book", () => {
    const probs = shin([2, 4, 4]);
    expect(probs[0]).toBeCloseTo(0.5, 12);
    expect(probs[1]).toBeCloseTo(0.25, 12);
    expect(probs[2]).toBeCloseTo(0.25, 12);
  });

  it("shows the longshot signature vs proportional", () => {
    // Shin strips less margin from the favourite and more from longshots.
    const odds = [1.3, 5.5, 9];
    const viaShin = shin(odds);
    const viaProportional = proportional(odds);
    expect(viaShin[0]).toBeGreaterThan(viaProportional[0]); // favourite
    expect(viaShin[2]).toBeLessThan(viaProportional[2]); // longshot
  });

  it("keeps the two-outcome symmetric case symmetric", () => {
    const probs = shin([1.9, 1.9]);
    expect(probs[0]).toBeCloseTo(0.5, 12);
    expect(probs[1]).toBeCloseTo(0.5, 12);
  });
});

describe("impliedProbability", () => {
  it("is 1/odds", () => {
    expect(impliedProbability(4)).toBe(0.25);
  });
});
