import { describe, expect, it } from "vitest";

import { eloRatingsByTeamCode, parseEloTsv } from "@/convex/lib/eloTsv";

// Mirrors the real eloratings.net formats:
// World.tsv: rank \t rank \t code \t rating \t …
const WORLD_TSV = [
  "1\t1\tES\t2157\t1\t2189\t7\t1946",
  "2\t2\tAR\t2115\t1\t2172\t5\t1987",
  "35\t35\tCZ\t1740\t1\t1850\t10\t1600",
  "39\t39\tUS\t1726\t1\t1800\t12\t1500",
  "91\t91\tCW\t1434\t1\t1500\t20\t1300",
  "100\t100\tXX\tnot-a-number\t",
  "garbage line",
  "",
].join("\r\n");

// en.teams.tsv: code \t primary name [\t alias …]
const TEAMS_TSV = [
  "ES\tSpain",
  "AR\tArgentina",
  "CZ\tCzechia",
  "US\tUnited States\tUSA",
  "CW\tCuraçao",
  "CS\tCzechoslovakia",
  "",
].join("\n");

describe("parseEloTsv", () => {
  it("parses code + rating rows and joins display names", () => {
    const entries = parseEloTsv(WORLD_TSV, TEAMS_TSV);
    expect(entries).toHaveLength(5); // XX (NaN rating) and garbage dropped
    expect(entries[0]).toMatchObject({
      eloCode: "ES",
      name: "Spain",
      rating: 2157,
    });
    const us = entries.find((e) => e.eloCode === "US");
    expect(us?.names).toEqual(["United States", "USA"]);
  });

  it("tolerates \\r\\n line endings and blank lines", () => {
    const entries = parseEloTsv(WORLD_TSV, TEAMS_TSV);
    expect(entries.every((e) => !e.name.includes("\r"))).toBe(true);
  });
});

describe("eloRatingsByTeamCode", () => {
  it("maps elo names to FIFA trigrams via the alias map", () => {
    const ratings = eloRatingsByTeamCode(parseEloTsv(WORLD_TSV, TEAMS_TSV));
    expect(ratings.get("ESP")).toEqual({ rating: 2157, eloName: "Spain" });
    expect(ratings.get("CZE")).toEqual({ rating: 1740, eloName: "Czechia" });
    expect(ratings.get("USA")).toEqual({
      rating: 1726,
      eloName: "United States",
    });
    expect(ratings.get("CUW")).toEqual({ rating: 1434, eloName: "Curaçao" });
  });

  it("ignores nations that are not WC2026 teams (never guesses)", () => {
    const ratings = eloRatingsByTeamCode(parseEloTsv(WORLD_TSV, TEAMS_TSV));
    expect(ratings.size).toBe(5); // ESP ARG CZE USA CUW
    expect([...ratings.keys()].sort()).toEqual([
      "ARG",
      "CUW",
      "CZE",
      "ESP",
      "USA",
    ]);
  });

  it("leaves teams absent when the TSV has no entry (caller decides fatality)", () => {
    const ratings = eloRatingsByTeamCode(parseEloTsv(WORLD_TSV, TEAMS_TSV));
    expect(ratings.has("BRA")).toBe(false);
  });
});
