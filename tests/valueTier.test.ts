import { describe, expect, it } from "vitest";

import { topValueBet, valueTier } from "@/lib/value-tier";

describe("valueTier — THE single tier map", () => {
  it("maps edges to tiers at the specced inclusive thresholds", () => {
    expect(valueTier(0.12)).toBe("strong");
    expect(valueTier(0.08)).toBe("strong");
    expect(valueTier(0.0799)).toBe("solid");
    expect(valueTier(0.04)).toBe("solid");
    expect(valueTier(0.0399)).toBe("slight");
    expect(valueTier(0.02)).toBe("slight");
  });

  it("returns null below the slight threshold and for junk", () => {
    expect(valueTier(0.0199)).toBeNull();
    expect(valueTier(0)).toBeNull();
    expect(valueTier(-0.05)).toBeNull();
    expect(valueTier(null)).toBeNull();
    expect(valueTier(undefined)).toBeNull();
    expect(valueTier(Number.NaN)).toBeNull();
  });
});

describe("topValueBet", () => {
  it("picks the highest-edge entry", () => {
    const bets = [{ edge: 0.03 }, { edge: 0.09 }, { edge: 0.05 }];
    expect(topValueBet(bets)).toEqual({ edge: 0.09 });
  });

  it("returns null for empty or missing lists", () => {
    expect(topValueBet([])).toBeNull();
    expect(topValueBet(undefined)).toBeNull();
    expect(topValueBet(null)).toBeNull();
  });
});
