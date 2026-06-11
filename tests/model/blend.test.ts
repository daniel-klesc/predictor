import { describe, expect, it } from "vitest";

import {
  blendProbabilities,
  blendProbability,
  DEFAULT_BLEND_WEIGHT,
} from "@/convex/lib/model/blend";

describe("blendProbability", () => {
  it("defaults to w = 0.7 toward the market", () => {
    expect(DEFAULT_BLEND_WEIGHT).toBe(0.7);
    expect(blendProbability(0.5, 0.4)).toBeCloseTo(0.7 * 0.5 + 0.3 * 0.4, 12);
  });

  it("honours a custom weight", () => {
    expect(blendProbability(0.6, 0.2, 0.5)).toBeCloseTo(0.4, 12);
    expect(blendProbability(0.6, 0.2, 1)).toBeCloseTo(0.6, 12);
    expect(blendProbability(0.6, 0.2, 0)).toBeCloseTo(0.2, 12);
  });
});

describe("blendProbabilities", () => {
  it("preserves a sum of 1 when both inputs sum to 1", () => {
    const blended = blendProbabilities([0.5, 0.3, 0.2], [0.4, 0.35, 0.25]);
    expect(blended.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(blended[0]).toBeCloseTo(0.7 * 0.5 + 0.3 * 0.4, 12);
  });

  it("rejects mismatched lengths", () => {
    expect(() => blendProbabilities([0.5, 0.5], [1])).toThrow(
      /length mismatch/,
    );
  });
});
