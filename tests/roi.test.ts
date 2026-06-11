import { describe, expect, it } from "vitest";

import { computeRoi, suggestedStake } from "@/lib/roi";

describe("computeRoi", () => {
  it("counts only settled bets — proposed and placed never affect ROI", () => {
    const roi = computeRoi([
      { status: "proposed" },
      { status: "placed", stake: 500 },
      { status: "won", stake: 400, payout: 840 },
      { status: "lost", stake: 200, payout: 0 },
      { status: "void", stake: 300, payout: 300 },
    ]);
    expect(roi.staked).toBe(900);
    expect(roi.returned).toBe(1140);
    expect(roi.profit).toBe(240);
    expect(roi.yield).toBeCloseTo(240 / 900, 12);
  });

  it("matches the hand-checked mockup sample (2,400 staked → 2,910 returned → +21.25%)", () => {
    const roi = computeRoi([
      { status: "won", stake: 400, payout: 840 }, // O2.5 @ 2.10
      { status: "won", stake: 1000, payout: 1870 }, // @ 1.87
      { status: "lost", stake: 200, payout: 0 }, // BTTS yes
      { status: "void", stake: 200, payout: 200 }, // postponed
      { status: "lost", stake: 600, payout: 0 },
    ]);
    expect(roi.staked).toBe(2400);
    expect(roi.returned).toBe(2910);
    expect(roi.profit).toBe(510);
    expect(roi.yield).toBeCloseTo(0.2125, 12);
  });

  it("yields null (not NaN) while nothing is staked", () => {
    expect(computeRoi([])).toEqual({
      staked: 0,
      returned: 0,
      profit: 0,
      yield: null,
    });
    expect(computeRoi([{ status: "proposed" }]).yield).toBeNull();
  });

  it("tolerates missing stake/payout fields", () => {
    const roi = computeRoi([{ status: "won" }, { status: "lost", stake: 100 }]);
    expect(roi.staked).toBe(100);
    expect(roi.returned).toBe(0);
    expect(roi.profit).toBe(-100);
  });
});

describe("suggestedStake", () => {
  it("multiplies the stored kelly fraction by the bankroll, rounded whole", () => {
    expect(suggestedStake(0.03, 10000)).toBe(300);
    expect(suggestedStake(0.025, 10010)).toBe(250); // 250.25 → 250
  });

  it("omits the suggestion when either input is missing or non-positive", () => {
    expect(suggestedStake(null, 10000)).toBeNull();
    expect(suggestedStake(undefined, 10000)).toBeNull();
    expect(suggestedStake(0.03, null)).toBeNull();
    expect(suggestedStake(0.03, undefined)).toBeNull();
    expect(suggestedStake(0, 10000)).toBeNull();
    expect(suggestedStake(-0.01, 10000)).toBeNull();
    expect(suggestedStake(0.03, 0)).toBeNull();
    expect(suggestedStake(Number.NaN, 10000)).toBeNull();
  });

  it("omits sub-unit suggestions instead of suggesting 0", () => {
    expect(suggestedStake(0.001, 400)).toBeNull(); // 0.4 rounds to 0 → omitted
    expect(suggestedStake(0.002, 400)).toBe(1); // 0.8 rounds to 1 → kept
  });
});
