/**
 * Synthetic 2026 tournament fixture for sim tests: 12 groups of 4 (48
 * teams, 72 group matches) plus the REAL knockout bracket placeholders as
 * seeded from openfootball (verified against the dev deployment data).
 *
 * Group A's second-strongest team is "MEX" (isHost) so host-advantage
 * effects can be asserted; every group's slot-2 team is the home side in
 * all three of its group matches.
 */
import type { SimMatch, SimTeam } from "@/convex/lib/model/sim";

export const GROUP_LETTERS = [
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
] as const;

/** Elo by group slot (1 = strongest seed, 4 = weakest). */
const SLOT_ELOS = [2080, 1880, 1700, 1520];

/** Team code for a group slot ("MEX" sits in slot A2). */
export function slotCode(letter: string, slot: number): string {
  if (letter === "A" && slot === 2) return "MEX";
  return `${letter}${slot}`;
}

export function makeTeams(): SimTeam[] {
  const teams: SimTeam[] = [];
  GROUP_LETTERS.forEach((letter, groupIndex) => {
    for (let slot = 1; slot <= 4; slot += 1) {
      const code = slotCode(letter, slot);
      teams.push({
        code,
        elo: SLOT_ELOS[slot - 1] - 6 * groupIndex,
        group: letter,
        isHost: code === "MEX",
      });
    }
  });
  return teams;
}

/** Slot pairings (home, away) per group; slot 2 is at home three times. */
const GROUP_PAIRINGS: ReadonlyArray<readonly [number, number]> = [
  [2, 1],
  [2, 3],
  [2, 4],
  [1, 3],
  [4, 1],
  [3, 4],
];

/** [matchNumber, homePlaceholder, awayPlaceholder] — real 2026 bracket. */
const KNOCKOUT: ReadonlyArray<readonly [number, string, string]> = [
  // Round of 32
  [73, "2A", "2B"],
  [74, "1E", "3A/B/C/D/F"],
  [75, "1F", "2C"],
  [76, "1C", "2F"],
  [77, "1I", "3C/D/F/G/H"],
  [78, "2E", "2I"],
  [79, "1A", "3C/E/F/H/I"],
  [80, "1L", "3E/H/I/J/K"],
  [81, "1D", "3B/E/F/I/J"],
  [82, "1G", "3A/E/H/I/J"],
  [83, "2K", "2L"],
  [84, "1H", "2J"],
  [85, "1B", "3E/F/G/I/J"],
  [86, "1J", "2H"],
  [87, "1K", "3D/E/I/J/L"],
  [88, "2D", "2G"],
  // Round of 16
  [89, "W74", "W77"],
  [90, "W73", "W75"],
  [91, "W76", "W78"],
  [92, "W79", "W80"],
  [93, "W83", "W84"],
  [94, "W81", "W82"],
  [95, "W86", "W88"],
  [96, "W85", "W87"],
  // Quarter-finals
  [97, "W89", "W90"],
  [98, "W93", "W94"],
  [99, "W91", "W92"],
  [100, "W95", "W96"],
  // Semi-finals
  [101, "W97", "W98"],
  [102, "W99", "W100"],
];

function stageOf(matchNumber: number): SimMatch["stage"] {
  if (matchNumber <= 72) return "group";
  if (matchNumber <= 88) return "r32";
  if (matchNumber <= 96) return "r16";
  if (matchNumber <= 100) return "qf";
  if (matchNumber <= 102) return "sf";
  if (matchNumber === 103) return "third";
  return "final";
}

export function makeMatches(): SimMatch[] {
  const matches: SimMatch[] = [];
  GROUP_LETTERS.forEach((letter, groupIndex) => {
    GROUP_PAIRINGS.forEach(([homeSlot, awaySlot], pairingIndex) => {
      matches.push({
        matchNumber: groupIndex * 6 + pairingIndex + 1,
        stage: "group",
        group: letter,
        homeCode: slotCode(letter, homeSlot),
        awayCode: slotCode(letter, awaySlot),
        status: "scheduled",
      });
    });
  });
  for (const [matchNumber, home, away] of KNOCKOUT) {
    matches.push({
      matchNumber,
      stage: stageOf(matchNumber),
      homePlaceholder: home,
      awayPlaceholder: away,
      status: "scheduled",
    });
  }
  matches.push({
    matchNumber: 103,
    stage: "third",
    homePlaceholder: "L101",
    awayPlaceholder: "L102",
    status: "scheduled",
  });
  matches.push({
    matchNumber: 104,
    stage: "final",
    homePlaceholder: "W101",
    awayPlaceholder: "W102",
    status: "scheduled",
  });
  return matches;
}

/**
 * Mark a group's six matches finished. `results` is keyed by slot pair
 * "h-a" (e.g. "1-2") with the score from the FIRST slot's perspective;
 * orientation toward the actual fixture is handled here.
 */
export function finishGroup(
  matches: SimMatch[],
  letter: string,
  results: Record<string, readonly [number, number]>,
): SimMatch[] {
  const slotByCode = new Map<string, number>();
  for (let slot = 1; slot <= 4; slot += 1) {
    slotByCode.set(slotCode(letter, slot), slot);
  }
  return matches.map((match) => {
    if (match.stage !== "group" || match.group !== letter) return match;
    const homeSlot = slotByCode.get(match.homeCode!)!;
    const awaySlot = slotByCode.get(match.awayCode!)!;
    const forward = results[`${homeSlot}-${awaySlot}`];
    const backward = results[`${awaySlot}-${homeSlot}`];
    const score = forward
      ? { home: forward[0], away: forward[1] }
      : backward
        ? { home: backward[1], away: backward[0] }
        : undefined;
    if (!score) {
      throw new Error(
        `fixture: no result for group ${letter} slots ${homeSlot}-${awaySlot}`,
      );
    }
    return { ...match, status: "finished" as const, score };
  });
}

/**
 * Finished-group presets: slot 1 takes 9 points, slot 2 takes 6, slot 3
 * takes 3, slot 4 none. The strong variant gives the third-placed team
 * GD +3 (qualifies); the weak variant GD −5 (eliminated).
 */
export const STRONG_THIRD_RESULTS: Record<string, readonly [number, number]> = {
  "1-2": [1, 0],
  "1-3": [1, 0],
  "1-4": [2, 0],
  "2-3": [1, 0],
  "2-4": [2, 0],
  "3-4": [5, 0],
};

export const WEAK_THIRD_RESULTS: Record<string, readonly [number, number]> = {
  "1-2": [1, 0],
  "1-3": [3, 0],
  "1-4": [2, 0],
  "2-3": [3, 0],
  "2-4": [2, 0],
  "3-4": [1, 0],
};
