import { describe, expect, it } from "vitest";

import { computePrediction } from "@/convex/lib/model";
import { proportional } from "@/convex/lib/model/margin";

/** Known bookmaker example: 2.10 / 3.40 / 3.60 (booksum ≈ 1.048). */
const BEST_H2H = {
  home: 2.1,
  homeBookmaker: "bet365",
  draw: 3.4,
  drawBookmaker: "pinnacle",
  away: 3.6,
  awayBookmaker: "unibet",
};

const WITH_ODDS = {
  homeElo: 1950,
  awayElo: 1900,
  hostAdvApplies: false,
  stage: "group" as const,
  oddsBest: {
    h2h: BEST_H2H,
    totals25: {
      over: 2.05,
      overBookmaker: "betfair",
      under: 1.85,
      underBookmaker: "bet365",
    },
  },
  oddsMedian: {
    h2h: { home: 2.05, draw: 3.35, away: 3.5 },
    totals25: { over: 2.0, under: 1.8 },
  },
};

describe("computePrediction with bookmaker odds", () => {
  const result = computePrediction(WITH_ODDS);

  it("model 1X2 / totals / BTTS each sum to 1", () => {
    const m = result.model;
    expect(m.pHome + m.pDraw + m.pAway).toBeCloseTo(1, 9);
    expect(m.pOver25 + m.pUnder25).toBeCloseTo(1, 9);
    expect(m.pBttsYes + m.pBttsNo).toBeCloseTo(1, 9);
    expect(m.pHome).toBeGreaterThan(m.pAway); // higher Elo at home
    expect(m.topScorelines).toHaveLength(6);
  });

  it("records the lambdas and rho used", () => {
    expect(result.inputs.homeElo).toBe(1950);
    expect(result.inputs.awayElo).toBe(1900);
    expect(result.inputs.homeLambda).toBeGreaterThan(result.inputs.awayLambda);
    expect(result.inputs.rho).toBe(-0.1);
  });

  it("de-margins the median line with Shin (sums to 1)", () => {
    const market = result.market!;
    expect(market.method).toBe("shin");
    expect(market.pHome + market.pDraw + market.pAway).toBeCloseTo(1, 9);
    expect(market.pOver25! + market.pUnder25!).toBeCloseTo(1, 9);
    // sanity: near the proportionally de-margined median prices
    const reference = proportional([2.05, 3.35, 3.5]);
    expect(market.pHome).toBeCloseTo(reference[0], 1);
  });

  it("blends market and model with w = 0.7 (sums to 1, between the two)", () => {
    const blend = result.blend!;
    expect(blend.weight).toBe(0.7);
    expect(blend.pHome + blend.pDraw + blend.pAway).toBeCloseTo(1, 9);
    const lo = Math.min(result.market!.pHome, result.model.pHome);
    const hi = Math.max(result.market!.pHome, result.model.pHome);
    expect(blend.pHome).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(blend.pHome).toBeLessThanOrEqual(hi + 1e-9);
  });

  it("flags only positive-edge bets inside the odds band, with capped Kelly", () => {
    for (const bet of result.valueBets) {
      expect(bet.edge).toBeGreaterThan(0.02);
      expect(bet.bestOdds).toBeGreaterThanOrEqual(1.1);
      expect(bet.bestOdds).toBeLessThanOrEqual(15);
      expect(bet.kellyFraction).toBeGreaterThan(0);
      expect(bet.kellyFraction).toBeLessThanOrEqual(0.05);
      expect(bet.pImplied).toBeCloseTo(1 / bet.bestOdds, 12);
      expect(bet.edge).toBeCloseTo(bet.pBlend - bet.pImplied, 12);
    }
  });

  it("carries the per-selection bookmaker through to value bets", () => {
    const bookmakers = {
      home: "bet365",
      draw: "pinnacle",
      away: "unibet",
      over: "betfair",
      under: "bet365",
    } as const;
    for (const bet of result.valueBets) {
      expect(bet.bookmaker).toBe(bookmakers[bet.selection]);
    }
  });

  it("is deterministic", () => {
    expect(computePrediction(WITH_ODDS)).toEqual(result);
  });

  it("flags a value bet when the market underprices the model favourite", () => {
    const skewed = computePrediction({
      homeElo: 2100,
      awayElo: 1700,
      hostAdvApplies: false,
      stage: "group",
      oddsBest: {
        h2h: {
          home: 1.55,
          homeBookmaker: "novibet",
          draw: 4.5,
          drawBookmaker: "bet365",
          away: 7.0,
          awayBookmaker: "william_hill",
        },
      },
      oddsMedian: { h2h: { home: 1.5, draw: 4.4, away: 6.8 } },
    });
    const homeBet = skewed.valueBets.find(
      (bet) => bet.market === "h2h" && bet.selection === "home",
    );
    expect(homeBet).toBeDefined();
    expect(homeBet!.bookmaker).toBe("novibet");
    expect(homeBet!.edge).toBeGreaterThan(0.02);
    expect(homeBet!.bestOdds).toBe(1.55);
    expect(homeBet!.kellyFraction).toBeGreaterThan(0);
    expect(homeBet!.kellyFraction).toBeLessThanOrEqual(0.05);
  });
});

describe("computePrediction without odds (model-only)", () => {
  const result = computePrediction({
    homeElo: 1875,
    awayElo: 1726,
    hostAdvApplies: true,
    stage: "group",
  });

  it("omits market/blend and returns no value bets", () => {
    expect(result.market).toBeUndefined();
    expect(result.blend).toBeUndefined();
    expect(result.valueBets).toEqual([]);
  });

  it("still produces a consistent model section", () => {
    const m = result.model;
    expect(m.pHome + m.pDraw + m.pAway).toBeCloseTo(1, 9);
    expect(m.pQualifyHome).toBeUndefined(); // group stage: no pQualify
  });

  it("host advantage shifts the model toward the home side", () => {
    const withoutHost = computePrediction({
      homeElo: 1875,
      awayElo: 1726,
      hostAdvApplies: false,
      stage: "group",
    });
    expect(result.model.pHome).toBeGreaterThan(withoutHost.model.pHome);
  });
});

describe("computePrediction on knockout stages", () => {
  it("adds Elo-tilted qualification probabilities summing to 1", () => {
    const result = computePrediction({
      homeElo: 2000,
      awayElo: 1850,
      hostAdvApplies: false,
      stage: "r16",
    });
    expect(result.model.pQualifyHome).toBeDefined();
    expect(result.model.pQualifyAway).toBeDefined();
    expect(result.model.pQualifyHome! + result.model.pQualifyAway!).toBeCloseTo(
      1,
      9,
    );
    expect(result.model.pQualifyHome!).toBeGreaterThan(result.model.pHome);
    expect(result.model.pQualifyHome!).toBeGreaterThan(0.5);
  });
});
