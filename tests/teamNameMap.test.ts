import { describe, expect, it } from "vitest";

import {
  TEAM_NAME_MAP,
  allTeamCodes,
  normalizeTeamName,
  resolveTeamName,
} from "@/convex/lib/teamNameMap";

describe("TEAM_NAME_MAP", () => {
  it("contains exactly the 48 qualified teams", () => {
    expect(allTeamCodes()).toHaveLength(48);
  });

  it("uses the entry key as the FIFA code", () => {
    for (const [key, entry] of Object.entries(TEAM_NAME_MAP)) {
      expect(entry.code).toBe(key);
      expect(key).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("fills every group A–L with exactly 4 teams", () => {
    const byGroup = new Map<string, number>();
    for (const entry of Object.values(TEAM_NAME_MAP)) {
      byGroup.set(entry.group, (byGroup.get(entry.group) ?? 0) + 1);
    }
    expect([...byGroup.keys()].sort()).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
    ]);
    for (const count of byGroup.values()) expect(count).toBe(4);
  });

  it("marks exactly the three hosts", () => {
    const hosts = Object.values(TEAM_NAME_MAP)
      .filter((entry) => entry.isHost)
      .map((entry) => entry.code)
      .sort();
    expect(hosts).toEqual(["CAN", "MEX", "USA"]);
  });

  it("has no alias that resolves to two different teams", () => {
    const owner = new Map<string, string>();
    for (const entry of Object.values(TEAM_NAME_MAP)) {
      const aliases = [
        entry.code,
        entry.name,
        entry.openfootball,
        ...entry.footballData,
        ...entry.oddsApi,
        ...entry.elo,
      ];
      for (const alias of aliases) {
        const normalized = normalizeTeamName(alias);
        const existing = owner.get(normalized);
        expect(
          existing === undefined || existing === entry.code,
          `alias "${alias}" claimed by both ${existing} and ${entry.code}`,
        ).toBe(true);
        owner.set(normalized, entry.code);
      }
    }
  });
});

describe("resolveTeamName — exact path", () => {
  it("resolves exact source spellings", () => {
    expect(resolveTeamName("South Korea")?.code).toBe("KOR");
    expect(resolveTeamName("Korea Republic")?.code).toBe("KOR");
    expect(resolveTeamName("Czech Republic")?.code).toBe("CZE");
    expect(resolveTeamName("Czechia")?.code).toBe("CZE");
    expect(resolveTeamName("USA")?.code).toBe("USA");
    expect(resolveTeamName("United States")?.code).toBe("USA");
    expect(resolveTeamName("Bosnia & Herzegovina")?.code).toBe("BIH");
    expect(resolveTeamName("Türkiye")?.code).toBe("TUR");
    expect(resolveTeamName("Côte d'Ivoire")?.code).toBe("CIV");
    expect(resolveTeamName("DR Congo")?.code).toBe("COD");
  });

  it("resolves FIFA trigrams directly (football-data tla)", () => {
    expect(resolveTeamName("CZE")?.code).toBe("CZE");
    expect(resolveTeamName("KSA")?.code).toBe("KSA");
    expect(resolveTeamName("RSA")?.code).toBe("RSA");
  });
});

describe("resolveTeamName — normalized path", () => {
  it("ignores case, diacritics, and punctuation", () => {
    expect(resolveTeamName("curacao")?.code).toBe("CUW");
    expect(resolveTeamName("CURAÇAO")?.code).toBe("CUW");
    expect(resolveTeamName("cote d'ivoire")?.code).toBe("CIV");
    expect(resolveTeamName("turkiye")?.code).toBe("TUR");
    expect(resolveTeamName("  south   korea  ")?.code).toBe("KOR");
    expect(resolveTeamName("U.S.A.")?.code).toBe("USA");
    expect(resolveTeamName("bosnia-and-herzegovina")?.code).toBe("BIH");
  });
});

describe("resolveTeamName — miss path (log and skip, never guess)", () => {
  it("returns null for unknown teams", () => {
    expect(resolveTeamName("Atlantis")).toBeNull();
    expect(resolveTeamName("Italy")).toBeNull(); // did not qualify
    expect(resolveTeamName("Korea")).toBeNull(); // ambiguous — never guess
    expect(resolveTeamName("Congo")).toBeNull(); // Congo-Brazzaville is not COD
  });

  it("returns null for empty input", () => {
    expect(resolveTeamName("")).toBeNull();
    expect(resolveTeamName("   ")).toBeNull();
  });

  it("returns null for knockout placeholders", () => {
    expect(resolveTeamName("1A")).toBeNull();
    expect(resolveTeamName("W74")).toBeNull();
    expect(resolveTeamName("3A/B/C/D/F")).toBeNull();
  });
});

describe("normalizeTeamName", () => {
  it("lowercases, strips diacritics, collapses punctuation", () => {
    expect(normalizeTeamName("Curaçao")).toBe("curacao");
    expect(normalizeTeamName("Côte d'Ivoire")).toBe("cote d ivoire");
    expect(normalizeTeamName("  Bosnia & Herzegovina ")).toBe(
      "bosnia herzegovina",
    );
    expect(normalizeTeamName("Türkiye")).toBe("turkiye");
  });
});
