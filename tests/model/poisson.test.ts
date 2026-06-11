import { describe, expect, it } from "vitest";

import {
  DIXON_COLES_RHO,
  dixonColesAdjustedGrid,
  gridSum,
  independentScorelineGrid,
  MAX_GOALS,
  poissonPmf,
  scorelineGrid,
} from "@/convex/lib/model/poisson";

const LAMBDA_PAIRS: Array<[number, number]> = [
  [1.3, 1.3],
  [2.37, 0.71],
  [4.5, 0.2],
  [0.2, 4.5],
  [1.54, 1.1],
];

describe("poissonPmf", () => {
  it("P(0) = e^−λ", () => {
    expect(poissonPmf(0, 1.7)).toBeCloseTo(Math.exp(-1.7), 12);
  });

  it("P(2) for λ=2 is 2e^−2", () => {
    expect(poissonPmf(2, 2)).toBeCloseTo(2 * Math.exp(-2), 12);
  });
});

describe("scorelineGrid", () => {
  it("is an 11×11 grid summing to 1 ± 1e-9 after DC renormalization", () => {
    for (const [lh, la] of LAMBDA_PAIRS) {
      const grid = scorelineGrid(lh, la);
      expect(grid).toHaveLength(MAX_GOALS + 1);
      for (const row of grid) expect(row).toHaveLength(MAX_GOALS + 1);
      expect(Math.abs(gridSum(grid) - 1)).toBeLessThan(1e-9);
    }
  });

  it("has only non-negative cells", () => {
    const grid = scorelineGrid(2.37, 0.71);
    for (const row of grid) {
      for (const p of row) expect(p).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Dixon-Coles correction", () => {
  it("touches ONLY the 0-0 / 1-0 / 0-1 / 1-1 cells pre-renormalization", () => {
    for (const [lh, la] of LAMBDA_PAIRS) {
      const plain = independentScorelineGrid(lh, la);
      const adjusted = dixonColesAdjustedGrid(lh, la);
      for (let h = 0; h <= MAX_GOALS; h += 1) {
        for (let a = 0; a <= MAX_GOALS; a += 1) {
          if (h <= 1 && a <= 1) continue;
          expect(adjusted[h][a]).toBe(plain[h][a]);
        }
      }
    }
  });

  it("with ρ = −0.1 inflates 0-0 and 1-1 and deflates 1-0 and 0-1", () => {
    expect(DIXON_COLES_RHO).toBe(-0.1);
    const plain = independentScorelineGrid(1.54, 1.1);
    const adjusted = dixonColesAdjustedGrid(1.54, 1.1);
    expect(adjusted[0][0]).toBeGreaterThan(plain[0][0]);
    expect(adjusted[1][1]).toBeGreaterThan(plain[1][1]);
    expect(adjusted[1][0]).toBeLessThan(plain[1][0]);
    expect(adjusted[0][1]).toBeLessThan(plain[0][1]);
  });

  it("ρ = 0 reduces to the renormalized independent grid", () => {
    const independent = independentScorelineGrid(1.54, 1.1);
    const total = gridSum(independent);
    const grid = scorelineGrid(1.54, 1.1, 0);
    expect(grid[0][0]).toBeCloseTo(independent[0][0] / total, 12);
    expect(grid[1][1]).toBeCloseTo(independent[1][1] / total, 12);
  });
});
