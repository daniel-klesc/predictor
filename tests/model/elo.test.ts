import { describe, expect, it } from "vitest";

import {
  effectiveEloDiff,
  HOST_ELO_BONUS,
  winExpectancy,
} from "@/convex/lib/model/elo";

describe("winExpectancy", () => {
  it("is 0.5 for equal ratings", () => {
    expect(winExpectancy(0)).toBeCloseTo(0.5, 12);
  });

  it("is 10/11 at +400", () => {
    expect(winExpectancy(400)).toBeCloseTo(10 / 11, 12);
  });

  it("is symmetric: E(d) + E(−d) = 1", () => {
    for (const d of [37, 120, 333, 800]) {
      expect(winExpectancy(d) + winExpectancy(-d)).toBeCloseTo(1, 12);
    }
  });

  it("is strictly increasing", () => {
    expect(winExpectancy(100)).toBeGreaterThan(winExpectancy(0));
    expect(winExpectancy(300)).toBeGreaterThan(winExpectancy(100));
  });
});

describe("effectiveEloDiff", () => {
  it("is the plain difference without host advantage", () => {
    expect(effectiveEloDiff(1900, 1800, false)).toBe(100);
  });

  it("adds the +100 host bonus to the home side", () => {
    expect(effectiveEloDiff(1900, 1800, true)).toBe(100 + HOST_ELO_BONUS);
    expect(HOST_ELO_BONUS).toBe(100);
  });
});
