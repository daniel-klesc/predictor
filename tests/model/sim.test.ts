import { describe, expect, it } from "vitest";

import {
  assignThirdPlaceSlots,
  mulberry32,
  simulateTournament,
} from "@/convex/lib/model/sim";

import {
  finishGroup,
  GROUP_LETTERS,
  makeMatches,
  makeTeams,
  slotCode,
  STRONG_THIRD_RESULTS,
  WEAK_THIRD_RESULTS,
} from "./fixture";

const TEAMS = makeTeams();
const MATCHES = makeMatches();

/** The real 2026 third-place R32 slots (match → allowed groups). */
const THIRD_SLOTS = [
  { matchNumber: 74, allowedGroups: new Set(["A", "B", "C", "D", "F"]) },
  { matchNumber: 77, allowedGroups: new Set(["C", "D", "F", "G", "H"]) },
  { matchNumber: 79, allowedGroups: new Set(["C", "E", "F", "H", "I"]) },
  { matchNumber: 80, allowedGroups: new Set(["E", "H", "I", "J", "K"]) },
  { matchNumber: 81, allowedGroups: new Set(["B", "E", "F", "I", "J"]) },
  { matchNumber: 82, allowedGroups: new Set(["A", "E", "H", "I", "J"]) },
  { matchNumber: 85, allowedGroups: new Set(["E", "F", "G", "I", "J"]) },
  { matchNumber: 87, allowedGroups: new Set(["D", "E", "I", "J", "L"]) },
];

describe("mulberry32", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 1000; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(124)()).not.toBe(mulberry32(123)());
  });
});

describe("assignThirdPlaceSlots", () => {
  it("respects every slot's allowed-group set (incl. single-option K/L)", () => {
    const qualified = ["A", "C", "D", "E", "F", "G", "K", "L"].map((g) => ({
      id: `3${g}`,
      group: g,
    }));
    const assignment = assignThirdPlaceSlots(THIRD_SLOTS, qualified);
    expect(assignment.size).toBe(8);
    expect(assignment.get(80)).toBe("3K"); // K fits only match 80
    expect(assignment.get(87)).toBe("3L"); // L fits only match 87
    const assigned = new Set<string>();
    for (const slot of THIRD_SLOTS) {
      const team = assignment.get(slot.matchNumber)!;
      expect(slot.allowedGroups.has(team.slice(1))).toBe(true);
      assigned.add(team);
    }
    expect(assigned.size).toBe(8); // no team used twice
  });

  it("finds a perfect matching for a tight combination", () => {
    const qualified = ["E", "F", "G", "H", "I", "J", "K", "L"].map((g) => ({
      id: g,
      group: g,
    }));
    const assignment = assignThirdPlaceSlots(THIRD_SLOTS, qualified);
    expect(assignment.size).toBe(8);
    expect(assignment.get(74)).toBe("F"); // only F fits match 74
    for (const slot of THIRD_SLOTS) {
      expect(
        slot.allowedGroups.has(assignment.get(slot.matchNumber) as string),
      ).toBe(true);
    }
  });
});

describe("simulateTournament", () => {
  const result = simulateTournament(TEAMS, MATCHES, { runs: 5000, seed: 42 });
  const byCode = new Map(result.perTeam.map((t) => [t.teamCode, t]));

  it("covers all 48 teams and Σ pChampion ≈ 1", () => {
    expect(result.perTeam).toHaveLength(48);
    const sums = result.perTeam.reduce(
      (acc, t) => ({
        champion: acc.champion + t.pChampion,
        final: acc.final + t.pFinal,
        r32: acc.r32 + t.pR32,
        winGroup: acc.winGroup + t.pWinGroup,
      }),
      { champion: 0, final: 0, r32: 0, winGroup: 0 },
    );
    expect(sums.champion).toBeCloseTo(1, 9);
    expect(sums.final).toBeCloseTo(2, 9); // two finalists per run
    expect(sums.r32).toBeCloseTo(32, 9); // 24 direct + 8 best thirds
    expect(sums.winGroup).toBeCloseTo(12, 9); // one winner per group
  });

  it("per-team advancement probabilities are monotonically non-increasing", () => {
    for (const t of result.perTeam) {
      expect(t.pWinGroup).toBeLessThanOrEqual(t.pR32);
      expect(t.pR32).toBeGreaterThanOrEqual(t.pR16);
      expect(t.pR16).toBeGreaterThanOrEqual(t.pQF);
      expect(t.pQF).toBeGreaterThanOrEqual(t.pSF);
      expect(t.pSF).toBeGreaterThanOrEqual(t.pFinal);
      expect(t.pFinal).toBeGreaterThanOrEqual(t.pChampion);
      for (const p of Object.values(t)) {
        if (typeof p !== "number") continue;
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stronger seeds beat weaker seeds within a group", () => {
    expect(byCode.get("B1")!.pWinGroup).toBeGreaterThan(
      byCode.get("B4")!.pWinGroup,
    );
    expect(byCode.get("B1")!.pChampion).toBeGreaterThan(
      byCode.get("B4")!.pChampion,
    );
  });

  it("same inputs + same seed → identical outputs; other seed differs", () => {
    const again = simulateTournament(TEAMS, MATCHES, {
      runs: 1500,
      seed: 7,
    });
    const twin = simulateTournament(TEAMS, MATCHES, { runs: 1500, seed: 7 });
    expect(twin).toEqual(again);
    const other = simulateTournament(TEAMS, MATCHES, {
      runs: 1500,
      seed: 8,
    });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(again));
  });

  it("host advantage lifts MEX's championship probability", () => {
    const withHost = simulateTournament(TEAMS, MATCHES, {
      runs: 10_000,
      seed: 11,
      hostAdvantage: true,
    });
    const withoutHost = simulateTournament(TEAMS, MATCHES, {
      runs: 10_000,
      seed: 11,
      hostAdvantage: false,
    });
    const mexWith = withHost.perTeam.find((t) => t.teamCode === "MEX")!;
    const mexWithout = withoutHost.perTeam.find((t) => t.teamCode === "MEX")!;
    expect(mexWith.pChampion).toBeGreaterThan(mexWithout.pChampion);
    expect(mexWith.pWinGroup).toBeGreaterThan(mexWithout.pWinGroup);
  });
});

describe("simulateTournament conditioning on real results", () => {
  it("a decided group propagates with certainty", () => {
    // A4 wins all three group-A matches; the rest of the group draws.
    const matches = finishGroup(makeMatches(), "A", {
      "1-4": [0, 1],
      "2-4": [0, 1],
      "3-4": [0, 1],
      "1-2": [1, 1],
      "1-3": [1, 1],
      "2-3": [1, 1],
    });
    const result = simulateTournament(TEAMS, matches, {
      runs: 300,
      seed: 5,
    });
    const byCode = new Map(result.perTeam.map((t) => [t.teamCode, t]));
    expect(byCode.get("A4")!.pWinGroup).toBe(1);
    expect(byCode.get("A4")!.pR32).toBe(1);
    expect(byCode.get("MEX")!.pWinGroup).toBe(0);
    expect(byCode.get("B1")!.pWinGroup).toBeGreaterThan(0); // others unaffected
  });

  it("fully played group stage fixes exactly the 8 best thirds", () => {
    const strongThirdGroups = new Set(["A", "C", "D", "E", "F", "G", "K", "L"]);
    let matches = makeMatches();
    for (const letter of GROUP_LETTERS) {
      matches = finishGroup(
        matches,
        letter,
        strongThirdGroups.has(letter)
          ? STRONG_THIRD_RESULTS
          : WEAK_THIRD_RESULTS,
      );
    }
    const result = simulateTournament(TEAMS, matches, { runs: 200, seed: 9 });
    const byCode = new Map(result.perTeam.map((t) => [t.teamCode, t]));
    for (const letter of GROUP_LETTERS) {
      const third = byCode.get(slotCode(letter, 3))!;
      expect(third.pR32).toBe(strongThirdGroups.has(letter) ? 1 : 0);
      // winners and runners-up always advance
      expect(byCode.get(slotCode(letter, 1))!.pR32).toBe(1);
      expect(byCode.get(slotCode(letter, 1))!.pWinGroup).toBe(1);
      expect(byCode.get(slotCode(letter, 2))!.pR32).toBe(1);
      expect(byCode.get(slotCode(letter, 4))!.pR32).toBe(0);
    }
  });
});
