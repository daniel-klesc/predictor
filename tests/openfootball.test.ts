import { describe, expect, it } from "vitest";

import {
  OpenfootballParseError,
  isPlaceholder,
  parseKickoff,
  parseOpenfootball,
  stageFromRound,
} from "@/convex/lib/openfootball";

describe("stageFromRound", () => {
  it("maps every 2026 round label", () => {
    expect(stageFromRound("Matchday 1")).toBe("group");
    expect(stageFromRound("Matchday 17")).toBe("group");
    expect(stageFromRound("Round of 32")).toBe("r32");
    expect(stageFromRound("Round of 16")).toBe("r16");
    expect(stageFromRound("Quarter-final")).toBe("qf");
    expect(stageFromRound("Semi-final")).toBe("sf");
    expect(stageFromRound("Match for third place")).toBe("third");
    expect(stageFromRound("Final")).toBe("final");
  });

  it("returns null for unknown rounds", () => {
    expect(stageFromRound("Group Stage Replay")).toBeNull();
  });
});

describe("isPlaceholder", () => {
  it("recognizes knockout slot placeholders", () => {
    for (const p of ["1A", "2L", "3A/B/C/D/F", "W73", "W104", "L101"]) {
      expect(isPlaceholder(p), p).toBe(true);
    }
  });

  it("rejects team names and malformed slots", () => {
    for (const p of ["Mexico", "4A", "3A", "WX", "W", "1AB"]) {
      expect(isPlaceholder(p), p).toBe(false);
    }
  });
});

describe("parseKickoff", () => {
  it("converts local time + UTC offset to UTC ms", () => {
    // Opening match: 2026-06-11 13:00 UTC-6 → 19:00 UTC
    expect(parseKickoff("2026-06-11", "13:00 UTC-6")).toBe(
      Date.UTC(2026, 5, 11, 19, 0, 0),
    );
    expect(parseKickoff("2026-07-19", "15:00 UTC-4")).toBe(
      Date.UTC(2026, 6, 19, 19, 0, 0),
    );
    expect(parseKickoff("2026-06-28", "12:00 UTC-7")).toBe(
      Date.UTC(2026, 5, 28, 19, 0, 0),
    );
  });

  it("returns null for unparseable input", () => {
    expect(parseKickoff("2026-06-11", undefined)).toBeNull();
    expect(parseKickoff("2026-06-11", "13:00")).toBeNull();
    expect(parseKickoff("June 11", "13:00 UTC-6")).toBeNull();
  });
});

const groupMatch = (overrides: Record<string, unknown>) => ({
  round: "Matchday 1",
  date: "2026-06-11",
  time: "13:00 UTC-6",
  team1: "Mexico",
  team2: "South Africa",
  group: "Group A",
  ground: "Mexico City",
  ...overrides,
});

describe("parseOpenfootball", () => {
  it("parses group matches, resolves codes, and assigns chronological numbers", () => {
    const { teams, matches } = parseOpenfootball({
      name: "World Cup 2026",
      matches: [
        // deliberately out of order — numbering must follow kickoff time
        groupMatch({
          round: "Matchday 1",
          date: "2026-06-11",
          time: "20:00 UTC-6",
          team1: "South Korea",
          team2: "Czech Republic",
          ground: "Guadalajara (Zapopan)",
        }),
        groupMatch({}),
      ],
    });

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      matchNumber: 1,
      stage: "group",
      group: "A",
      homeCode: "MEX",
      awayCode: "RSA",
      city: "Mexico City",
      kickoffAt: Date.UTC(2026, 5, 11, 19, 0, 0),
    });
    expect(matches[1]).toMatchObject({
      matchNumber: 2,
      homeCode: "KOR",
      awayCode: "CZE",
    });

    expect(teams.map((t) => t.code).sort()).toEqual([
      "CZE",
      "KOR",
      "MEX",
      "RSA",
    ]);
    expect(teams.find((t) => t.code === "CZE")).toMatchObject({
      name: "Czechia",
      group: "A",
      isHost: false,
      openfootballName: "Czech Republic",
    });
    expect(teams.find((t) => t.code === "MEX")?.isHost).toBe(true);
  });

  it("keeps explicit knockout nums and fixes third place / final to 103/104", () => {
    const { matches } = parseOpenfootball({
      name: "World Cup 2026",
      matches: [
        {
          round: "Round of 32",
          num: 74,
          date: "2026-06-29",
          time: "16:30 UTC-4",
          team1: "1E",
          team2: "3A/B/C/D/F",
          ground: "Boston (Foxborough)",
        },
        {
          round: "Match for third place",
          date: "2026-07-18",
          time: "17:00 UTC-4",
          team1: "L101",
          team2: "L102",
          ground: "Miami (Miami Gardens)",
        },
        {
          round: "Final",
          date: "2026-07-19",
          time: "15:00 UTC-4",
          team1: "W101",
          team2: "W102",
          ground: "New York/New Jersey (East Rutherford)",
        },
      ],
    });

    expect(matches.map((m) => [m.matchNumber, m.stage])).toEqual([
      [74, "r32"],
      [103, "third"],
      [104, "final"],
    ]);
    expect(matches[0]).toMatchObject({
      homePlaceholder: "1E",
      awayPlaceholder: "3A/B/C/D/F",
      homeCode: undefined,
      awayCode: undefined,
    });
  });

  it("resolves knockout slots to codes once the source names real teams", () => {
    const { matches } = parseOpenfootball({
      name: "World Cup 2026",
      matches: [
        {
          round: "Final",
          date: "2026-07-19",
          time: "15:00 UTC-4",
          team1: "France",
          team2: "Brazil",
          ground: "New York/New Jersey (East Rutherford)",
        },
      ],
    });
    expect(matches[0]).toMatchObject({
      matchNumber: 104,
      homeCode: "FRA",
      awayCode: "BRA",
      homePlaceholder: undefined,
    });
  });

  it("fails loudly, listing every unresolved team name", () => {
    let caught: unknown;
    try {
      parseOpenfootball({
        name: "World Cup 2026",
        matches: [
          groupMatch({ team1: "Atlantis", team2: "Mexico" }),
          groupMatch({ team1: "South Africa", team2: "Narnia" }),
        ],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OpenfootballParseError);
    const parseError = caught as OpenfootballParseError;
    expect(parseError.message).toContain("Atlantis");
    expect(parseError.message).toContain("Narnia");
    expect(parseError.problems).toHaveLength(2);
  });

  it("fails loudly on unknown rounds and unparseable kickoffs", () => {
    expect(() =>
      parseOpenfootball({
        name: "World Cup 2026",
        matches: [groupMatch({ round: "Mystery Round" })],
      }),
    ).toThrow(OpenfootballParseError);
    expect(() =>
      parseOpenfootball({
        name: "World Cup 2026",
        matches: [groupMatch({ time: "sometime" })],
      }),
    ).toThrow(/unparseable kickoff/);
  });

  it("fails loudly on duplicate explicit match numbers", () => {
    const ko = (num: number, team1: string, team2: string) => ({
      round: "Round of 16",
      num,
      date: "2026-07-04",
      time: "15:00 UTC-4",
      team1,
      team2,
      ground: "Dallas (Arlington)",
    });
    expect(() =>
      parseOpenfootball({
        name: "World Cup 2026",
        matches: [ko(89, "W74", "W77"), ko(89, "W75", "W76")],
      }),
    ).toThrow(/duplicate match number 89/);
  });
});
