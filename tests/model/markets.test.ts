import { describe, expect, it } from "vitest";

import { winExpectancy } from "@/convex/lib/model/elo";
import {
  btts,
  oneXTwo,
  overUnder25,
  qualifyProbabilities,
  topScorelines,
} from "@/convex/lib/model/markets";
import { scorelineGrid } from "@/convex/lib/model/poisson";

const GRID = scorelineGrid(1.54, 1.1);

describe("market consistency", () => {
  it("1X2 sums to 1", () => {
    const { home, draw, away } = oneXTwo(GRID);
    expect(home + draw + away).toBeCloseTo(1, 9);
    expect(home).toBeGreaterThan(away); // λhome > λaway
  });

  it("over/under 2.5 sums to 1", () => {
    const { over, under } = overUnder25(GRID);
    expect(over + under).toBeCloseTo(1, 9);
  });

  it("BTTS yes+no sums to 1", () => {
    const { yes, no } = btts(GRID);
    expect(yes + no).toBeCloseTo(1, 9);
  });

  it("a symmetric grid gives pHome = pAway", () => {
    const symmetric = scorelineGrid(1.3, 1.3);
    const { home, draw, away } = oneXTwo(symmetric);
    expect(home).toBeCloseTo(away, 12);
    expect(draw).toBeGreaterThan(0.2);
  });
});

describe("topScorelines", () => {
  it("returns the 6 most likely scorelines sorted descending", () => {
    const top = topScorelines(GRID);
    expect(top).toHaveLength(6);
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].p).toBeGreaterThanOrEqual(top[i].p);
    }
    const maxCell = Math.max(...GRID.flat());
    expect(top[0].p).toBe(maxCell);
  });

  it("each entry references its grid cell", () => {
    for (const { home, away, p } of topScorelines(GRID)) {
      expect(GRID[home][away]).toBe(p);
    }
  });
});

describe("qualifyProbabilities", () => {
  it("home + away qualification sums to 1", () => {
    const q = qualifyProbabilities(GRID, 100);
    expect(q.home + q.away).toBeCloseTo(1, 9);
  });

  it("splits the draw mass evenly for equal Elo", () => {
    const { home, draw } = oneXTwo(GRID);
    const q = qualifyProbabilities(GRID, 0);
    expect(q.home).toBeCloseTo(home + draw / 2, 12);
  });

  it("tilts the ET/pens split by Elo", () => {
    const { home, draw } = oneXTwo(GRID);
    const q = qualifyProbabilities(GRID, 250);
    expect(q.home).toBeCloseTo(home + draw * winExpectancy(250), 12);
    expect(q.home).toBeGreaterThan(qualifyProbabilities(GRID, 0).home);
  });
});
