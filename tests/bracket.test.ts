import { describe, expect, it } from "vitest";

import {
  type BracketMatchLike,
  bracketSlotCode,
  buildBracket,
  parseBracketSlot,
} from "@/lib/bracket";

/** The real seeded knockout shape (matches 73–104, dev deployment dump). */
const KNOCKOUT: Array<[number, string, string, string]> = [
  [73, "r32", "2A", "2B"],
  [74, "r32", "1E", "3A/B/C/D/F"],
  [75, "r32", "1F", "2C"],
  [76, "r32", "1C", "2F"],
  [77, "r32", "1I", "3C/D/F/G/H"],
  [78, "r32", "2E", "2I"],
  [79, "r32", "1A", "3C/E/F/H/I"],
  [80, "r32", "1L", "3E/H/I/J/K"],
  [81, "r32", "1D", "3B/E/F/I/J"],
  [82, "r32", "1G", "3A/E/H/I/J"],
  [83, "r32", "2K", "2L"],
  [84, "r32", "1H", "2J"],
  [85, "r32", "1B", "3E/F/G/I/J"],
  [86, "r32", "1J", "2H"],
  [87, "r32", "1K", "3D/E/I/J/L"],
  [88, "r32", "2D", "2G"],
  [89, "r16", "W74", "W77"],
  [90, "r16", "W73", "W75"],
  [91, "r16", "W76", "W78"],
  [92, "r16", "W79", "W80"],
  [93, "r16", "W83", "W84"],
  [94, "r16", "W81", "W82"],
  [95, "r16", "W86", "W88"],
  [96, "r16", "W85", "W87"],
  [97, "qf", "W89", "W90"],
  [98, "qf", "W93", "W94"],
  [99, "qf", "W91", "W92"],
  [100, "qf", "W95", "W96"],
  [101, "sf", "W97", "W98"],
  [102, "sf", "W99", "W100"],
  [103, "third", "L101", "L102"],
  [104, "final", "W101", "W102"],
];

function seededMatches(): BracketMatchLike[] {
  return KNOCKOUT.map(([matchNumber, stage, home, away]) => ({
    matchNumber,
    stage,
    homePlaceholder: home,
    awayPlaceholder: away,
  }));
}

describe("parseBracketSlot", () => {
  it("parses winner and loser match refs", () => {
    expect(parseBracketSlot("W74")).toEqual({
      kind: "winner",
      matchNumber: 74,
    });
    expect(parseBracketSlot("L101")).toEqual({
      kind: "loser",
      matchNumber: 101,
    });
    expect(parseBracketSlot("w9")).toEqual({ kind: "winner", matchNumber: 9 });
  });

  it("parses group-position refs", () => {
    expect(parseBracketSlot("1A")).toEqual({
      kind: "groupWinner",
      group: "A",
    });
    expect(parseBracketSlot("2b")).toEqual({
      kind: "groupRunnerUp",
      group: "B",
    });
  });

  it("parses best-third pool refs", () => {
    expect(parseBracketSlot("3A/B/C/D/F")).toEqual({
      kind: "bestThird",
      groups: ["A", "B", "C", "D", "F"],
    });
  });

  it("returns unknown for missing or malformed slots", () => {
    expect(parseBracketSlot(undefined)).toEqual({ kind: "unknown", raw: "" });
    expect(parseBracketSlot("  ")).toEqual({ kind: "unknown", raw: "" });
    expect(parseBracketSlot("3A")).toEqual({ kind: "unknown", raw: "3A" });
    expect(parseBracketSlot("W")).toEqual({ kind: "unknown", raw: "W" });
    expect(parseBracketSlot("4X")).toEqual({ kind: "unknown", raw: "4X" });
  });
});

describe("bracketSlotCode", () => {
  it("prefers the resolved team code over the stored placeholder", () => {
    expect(bracketSlotCode({ code: "CZE" }, "1A", "TBD")).toBe("CZE");
  });

  it("falls back to the placeholder, then the unknown label", () => {
    expect(bracketSlotCode(null, "W74", "TBD")).toBe("W74");
    expect(bracketSlotCode(null, undefined, "TBD")).toBe("TBD");
  });
});

describe("buildBracket", () => {
  it("builds the full 32-slot structure from the seeded data shape", () => {
    const bracket = buildBracket(seededMatches());

    expect(bracket.rounds.map((round) => round.stage)).toEqual([
      "r32",
      "r16",
      "qf",
      "sf",
      "final",
    ]);
    const numbers = (stage: string) =>
      bracket.rounds
        .find((round) => round.stage === stage)!
        .matches.map((match) => match.matchNumber);

    expect(numbers("final")).toEqual([104]);
    expect(numbers("sf")).toEqual([101, 102]);
    expect(numbers("qf")).toEqual([97, 98, 99, 100]);
    // Each match sits between its two feeders in the previous column.
    expect(numbers("r16")).toEqual([89, 90, 93, 94, 91, 92, 95, 96]);
    expect(numbers("r32")).toEqual([
      74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87,
    ]);
    expect(bracket.thirdPlace?.matchNumber).toBe(103);
  });

  it("ignores group matches and keeps the third-place match out of the tree", () => {
    const bracket = buildBracket([
      { matchNumber: 1, stage: "group", homePlaceholder: undefined },
      ...seededMatches(),
    ]);
    const all = bracket.rounds.flatMap((round) => round.matches);
    expect(all).toHaveLength(31); // 16 + 8 + 4 + 2 + 1
    expect(all.some((match) => match.stage === "group")).toBe(false);
    expect(all.some((match) => match.stage === "third")).toBe(false);
  });

  it("keeps the structure when slots resolve to real teams (placeholders persist)", () => {
    const resolved = seededMatches().map((match) => ({
      ...match,
      homeTeamId: "team-home",
      awayTeamId: "team-away",
    }));
    const bracket = buildBracket(resolved);
    expect(
      bracket.rounds
        .find((round) => round.stage === "r32")!
        .matches.map((match) => match.matchNumber),
    ).toEqual([74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87]);
  });

  it("falls back to matchNumber order when winner refs are broken", () => {
    const malformed = seededMatches().map((match) =>
      match.matchNumber === 97 ? { ...match, homePlaceholder: "TBD" } : match,
    );
    const bracket = buildBracket(malformed);
    const numbers = (stage: string) =>
      bracket.rounds
        .find((round) => round.stage === stage)!
        .matches.map((match) => match.matchNumber);

    // The chain above the break still derives…
    expect(numbers("sf")).toEqual([101, 102]);
    // …the broken round and everything below fall back to number order.
    expect(numbers("qf")).toEqual([97, 98, 99, 100]);
    expect(numbers("r16")).toEqual([89, 90, 91, 92, 93, 94, 95, 96]);
    expect(numbers("r32")).toEqual([
      73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
    ]);
  });

  it("renders partial data (missing final) via the fallback", () => {
    const withoutFinal = seededMatches().filter(
      (match) => match.stage !== "final",
    );
    const bracket = buildBracket(withoutFinal);
    expect(bracket.rounds.map((round) => round.stage)).toEqual([
      "r32",
      "r16",
      "qf",
      "sf",
    ]);
    expect(
      bracket.rounds
        .find((round) => round.stage === "sf")!
        .matches.map((match) => match.matchNumber),
    ).toEqual([101, 102]);
  });

  it("returns an empty bracket for group-only data", () => {
    const bracket = buildBracket([
      { matchNumber: 1, stage: "group" },
      { matchNumber: 2, stage: "group" },
    ]);
    expect(bracket.rounds).toEqual([]);
    expect(bracket.thirdPlace).toBeNull();
  });
});
