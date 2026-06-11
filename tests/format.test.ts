import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDecimalOdds,
  formatKickoff,
  formatPercent,
} from "@/lib/format";

describe("formatPercent", () => {
  it("renders probabilities as whole percents by default", () => {
    expect(formatPercent(0.575)).toBe("58%");
    expect(formatPercent(0.05)).toBe("5%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("supports fraction digits", () => {
    expect(formatPercent(0.5757, 1)).toBe("57.6%");
    expect(formatPercent(0.5754, 1)).toBe("57.5%");
  });
});

describe("formatDecimalOdds", () => {
  it("always shows two decimals", () => {
    expect(formatDecimalOdds(2)).toBe("2.00");
    expect(formatDecimalOdds(2.051)).toBe("2.05");
  });
});

describe("formatCurrency", () => {
  it("formats EUR with grouping by default", () => {
    expect(formatCurrency(1234.5)).toBe("€1,234.50");
  });
});

describe("formatKickoff", () => {
  it("formats a UTC kickoff as weekday, day month, 24h time", () => {
    // 2026-06-13 18:00 UTC — a World Cup group-stage Saturday.
    const kickoff = Date.UTC(2026, 5, 13, 18, 0);
    expect(formatKickoff(kickoff)).toBe("Sat 13 Jun, 18:00");
  });
});
