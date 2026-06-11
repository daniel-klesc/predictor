import { describe, expect, it } from "vitest";

import {
  betSelectionLabel,
  formatMoney,
  formatSignedMoney,
  formatSignedPercent,
} from "@/lib/bet-display";

const NAMES = { home: "Mexico", away: "South Africa" };

describe("betSelectionLabel", () => {
  it("labels 1X2 selections with team names", () => {
    expect(betSelectionLabel({ market: "h2h", selection: "home" }, NAMES)).toBe(
      "Mexico win",
    );
    expect(betSelectionLabel({ market: "h2h", selection: "away" }, NAMES)).toBe(
      "South Africa win",
    );
    expect(betSelectionLabel({ market: "h2h", selection: "draw" }, NAMES)).toBe(
      "Draw",
    );
  });

  it("falls back to TBD for unresolved teams", () => {
    expect(
      betSelectionLabel(
        { market: "h2h", selection: "home" },
        { home: null, away: null },
      ),
    ).toBe("TBD win");
  });

  it("labels totals and BTTS selections", () => {
    expect(
      betSelectionLabel({ market: "totals25", selection: "over" }, NAMES),
    ).toBe("Over 2.5");
    expect(
      betSelectionLabel({ market: "totals25", selection: "under" }, NAMES),
    ).toBe("Under 2.5");
    expect(betSelectionLabel({ market: "btts", selection: "yes" }, NAMES)).toBe(
      "BTTS yes",
    );
    expect(betSelectionLabel({ market: "btts", selection: "no" }, NAMES)).toBe(
      "BTTS no",
    );
  });

  it("never crashes on unknown markets (e.g. chat-proposed outrights)", () => {
    expect(
      betSelectionLabel(
        { market: "outright", selection: "ESP" },
        { home: null, away: null },
      ),
    ).toBe("outright ESP");
  });
});

describe("money/percent formatting", () => {
  it("groups thousands and keeps ≤2 decimals", () => {
    expect(formatMoney(2400)).toBe("2,400");
    expect(formatMoney(437.5)).toBe("437.5");
    expect(formatMoney(649.99)).toBe("649.99");
  });

  it("signs net results with a true minus sign", () => {
    expect(formatSignedMoney(440)).toBe("+440");
    expect(formatSignedMoney(-200)).toBe("−200");
    expect(formatSignedMoney(0)).toBe("±0");
  });

  it("formats yield as a signed whole percent", () => {
    expect(formatSignedPercent(0.2125)).toBe("+21%");
    expect(formatSignedPercent(-0.08)).toBe("−8%");
    expect(formatSignedPercent(0)).toBe("+0%");
  });
});
