import { describe, expect, it } from "vitest";

import { groupStandings } from "@/lib/standings";

const TEAMS = [
  { code: "MEX", name: "Mexico", group: "A" },
  { code: "RSA", name: "South Africa", group: "A" },
  { code: "KOR", name: "Korea Republic", group: "A" },
  { code: "TUN", name: "Tunisia", group: "A" },
  { code: "CAN", name: "Canada", group: "B" },
  { code: "QAT", name: "Qatar", group: "B" },
];

describe("groupStandings", () => {
  it("zeroes every team before any results", () => {
    const standings = groupStandings(TEAMS, []);
    expect(standings.map((entry) => entry.group)).toEqual(["A", "B"]);
    expect(standings[0].rows).toHaveLength(4);
    for (const row of standings[0].rows) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
    }
    // Pointless rows order alphabetically by name.
    expect(standings[0].rows[0].name).toBe("Korea Republic");
  });

  it("applies wins/draws and sorts by points then goal difference", () => {
    const standings = groupStandings(TEAMS, [
      {
        stage: "group",
        status: "finished",
        homeCode: "MEX",
        awayCode: "RSA",
        score: { home: 3, away: 0 },
      },
      {
        stage: "group",
        status: "finished",
        homeCode: "KOR",
        awayCode: "TUN",
        score: { home: 1, away: 1 },
      },
      {
        stage: "group",
        status: "finished",
        homeCode: "RSA",
        awayCode: "KOR",
        score: { home: 2, away: 1 },
      },
    ]);
    const groupA = standings[0].rows;
    // Equal points break on goal difference: TUN (0) over KOR (−1).
    expect(groupA.map((row) => row.code)).toEqual(["MEX", "RSA", "TUN", "KOR"]);
    expect(groupA[0]).toMatchObject({
      played: 1,
      won: 1,
      points: 3,
      goalDiff: 3,
    });
    expect(groupA[1]).toMatchObject({
      played: 2,
      won: 1,
      lost: 1,
      points: 3,
      goalDiff: -2,
    });
    expect(groupA[2]).toMatchObject({
      played: 1,
      drawn: 1,
      points: 1,
      goalDiff: 0,
    });
    expect(groupA[3]).toMatchObject({
      played: 2,
      drawn: 1,
      lost: 1,
      points: 1,
      goalDiff: -1,
    });
  });

  it("ignores scheduled, knockout, and unresolved matches", () => {
    const standings = groupStandings(TEAMS, [
      {
        stage: "group",
        status: "scheduled",
        homeCode: "MEX",
        awayCode: "RSA",
        score: null,
      },
      {
        stage: "r32",
        status: "finished",
        homeCode: "MEX",
        awayCode: "CAN",
        score: { home: 2, away: 1 },
      },
      {
        stage: "group",
        status: "finished",
        homeCode: null,
        awayCode: "QAT",
        score: { home: 1, away: 0 },
      },
    ]);
    for (const entry of standings) {
      for (const row of entry.rows) {
        expect(row.played).toBe(0);
      }
    }
  });
});
