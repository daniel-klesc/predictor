import { describe, expect, it } from "vitest";

import {
  FLAG_FALLBACK,
  flagEmoji,
  formatCurrency,
  formatDayHeading,
  formatDecimalOdds,
  formatEdge,
  formatKickoff,
  formatKickoffTime,
  formatPercent,
  formatPlaceholder,
  formatScoreline,
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

describe("formatKickoffTime (Europe/Prague default)", () => {
  it("renders the opener's 19:00 UTC kickoff as 21:00 local", () => {
    expect(formatKickoffTime(Date.UTC(2026, 5, 11, 19, 0))).toBe("21:00");
  });

  it("uses a 23-hour clock at local midnight", () => {
    expect(formatKickoffTime(Date.UTC(2026, 5, 11, 22, 0))).toBe("00:00");
  });
});

describe("formatDayHeading (Europe/Prague default)", () => {
  it("renders the local weekday + date", () => {
    expect(formatDayHeading(Date.UTC(2026, 5, 11, 19, 0))).toBe("Thu 11 Jun");
    // 23:00 UTC is already Friday in Prague.
    expect(formatDayHeading(Date.UTC(2026, 5, 11, 23, 0))).toBe("Fri 12 Jun");
  });
});

describe("formatEdge", () => {
  it("renders signed one-decimal percents", () => {
    expect(formatEdge(0.072)).toBe("+7.2%");
    expect(formatEdge(0.02)).toBe("+2.0%");
    expect(formatEdge(0)).toBe("+0.0%");
  });

  it("uses a true minus sign for negative edges", () => {
    expect(formatEdge(-0.034)).toBe("−3.4%");
  });
});

describe("formatScoreline", () => {
  it("joins goals with an en dash", () => {
    expect(formatScoreline(2, 0)).toBe("2–0");
  });
});

describe("flagEmoji", () => {
  it("maps FIFA trigrams through the ISO override map", () => {
    expect(flagEmoji("MEX")).toBe("🇲🇽");
    expect(flagEmoji("RSA")).toBe("🇿🇦"); // FIFA RSA → ISO ZA
    expect(flagEmoji("GER")).toBe("🇩🇪"); // FIFA GER → ISO DE
    expect(flagEmoji("SUI")).toBe("🇨🇭"); // FIFA SUI → ISO CH
  });

  it("uses tag-sequence flags for UK home nations", () => {
    expect(flagEmoji("ENG")).toBe(
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    );
    expect(flagEmoji("SCO")).toBe(
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
    );
  });

  it("is case-insensitive and falls back to the white flag", () => {
    expect(flagEmoji("mex")).toBe("🇲🇽");
    expect(flagEmoji("XXX")).toBe(FLAG_FALLBACK);
    expect(flagEmoji(undefined)).toBe(FLAG_FALLBACK);
    expect(flagEmoji(null)).toBe(FLAG_FALLBACK);
  });
});

describe("formatPlaceholder", () => {
  it("expands knockout slot codes to readable labels", () => {
    expect(formatPlaceholder("W74")).toBe("Winner match 74");
    expect(formatPlaceholder("L101")).toBe("Loser match 101");
    expect(formatPlaceholder("1A")).toBe("Group A winner");
    expect(formatPlaceholder("2B")).toBe("Group B runner-up");
    expect(formatPlaceholder("3A/B/C/D/F")).toBe("3rd of A/B/C/D/F");
  });

  it("passes unknown shapes through and defaults blanks to TBD", () => {
    expect(formatPlaceholder("1A/2B")).toBe("1A/2B");
    expect(formatPlaceholder(undefined)).toBe("TBD");
    expect(formatPlaceholder(null)).toBe("TBD");
  });
});
