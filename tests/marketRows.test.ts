import { describe, expect, it } from "vitest";

import {
  marketRows,
  valueBetShortLabel,
  type MarketRowsPrediction,
} from "@/lib/market-rows";

const NAMES = { home: "Mexico", away: "South Africa" };

const MODEL = {
  pHome: 0.58,
  pDraw: 0.24,
  pAway: 0.18,
  pOver25: 0.47,
  pUnder25: 0.53,
  pBttsYes: 0.41,
};

describe("marketRows — model-only (no odds yet)", () => {
  const prediction: MarketRowsPrediction = { model: MODEL, valueBets: [] };
  const rows = marketRows(prediction, null, NAMES);

  it("builds the six fixed rows with team-name labels", () => {
    expect(rows.map((row) => row.key)).toEqual([
      "h2h:home",
      "h2h:draw",
      "h2h:away",
      "totals25:over",
      "totals25:under",
      "btts:yes",
    ]);
    expect(rows[0].label).toBe("Mexico win");
    expect(rows[2].label).toBe("South Africa win");
  });

  it("keeps model probabilities but no odds, edges, or tiers", () => {
    expect(rows[0].modelP).toBe(0.58);
    for (const row of rows) {
      expect(row.odds).toBeNull();
      expect(row.edge).toBeNull();
      expect(row.isValue).toBe(false);
      expect(row.tier).toBeNull();
    }
  });
});

describe("marketRows — with odds, blend, and a flagged value bet", () => {
  const prediction: MarketRowsPrediction = {
    model: MODEL,
    blend: {
      pHome: 0.585,
      pDraw: 0.24,
      pAway: 0.175,
      pOver25: 0.48,
      pUnder25: 0.52,
    },
    valueBets: [
      {
        market: "h2h",
        selection: "home",
        edge: 0.072,
        bestOdds: 1.95,
        bookmaker: "betano",
      },
    ],
  };
  const oddsBest = {
    h2h: {
      home: 1.95,
      homeBookmaker: "betano",
      draw: 3.6,
      drawBookmaker: "tipsport",
      away: 4.8,
      awayBookmaker: "fortuna",
    },
    totals25: {
      over: 2.1,
      overBookmaker: "betano",
      under: 1.75,
      underBookmaker: "tipsport",
    },
  };
  const rows = marketRows(prediction, oddsBest, NAMES);
  const byKey = new Map(rows.map((row) => [row.key, row]));

  it("marks the flagged row with its model edge and tier", () => {
    const home = byKey.get("h2h:home")!;
    expect(home.isValue).toBe(true);
    expect(home.edge).toBe(0.072);
    expect(home.tier).toBe("solid"); // 0.04 ≤ 0.072 < 0.08
    expect(home.odds).toBe(1.95);
    expect(home.bookmaker).toBe("betano");
  });

  it("computes informational blend-vs-price edges on unflagged rows", () => {
    const draw = byKey.get("h2h:draw")!;
    expect(draw.isValue).toBe(false);
    expect(draw.tier).toBeNull();
    expect(draw.edge).toBeCloseTo(0.24 - 1 / 3.6, 12);
    const over = byKey.get("totals25:over")!;
    expect(over.edge).toBeCloseTo(0.48 - 1 / 2.1, 12);
  });

  it("never prices BTTS (the odds feed covers h2h + totals only)", () => {
    const btts = byKey.get("btts:yes")!;
    expect(btts.odds).toBeNull();
    expect(btts.edge).toBeNull();
    expect(btts.tier).toBeNull();
  });
});

describe("valueBetShortLabel", () => {
  const codes = { home: "MEX", away: "RSA" };

  it("labels selections compactly for badges", () => {
    expect(
      valueBetShortLabel({ market: "h2h", selection: "home" }, codes),
    ).toBe("MEX win");
    expect(
      valueBetShortLabel({ market: "h2h", selection: "away" }, codes),
    ).toBe("RSA win");
    expect(
      valueBetShortLabel({ market: "h2h", selection: "draw" }, codes),
    ).toBe("Draw");
    expect(
      valueBetShortLabel({ market: "totals25", selection: "over" }, codes),
    ).toBe("Over 2.5");
    expect(
      valueBetShortLabel({ market: "totals25", selection: "under" }, codes),
    ).toBe("Under 2.5");
  });

  it("falls back to the market name for unknown selections", () => {
    expect(valueBetShortLabel({ market: "outright" }, codes)).toBe("outright");
  });
});
