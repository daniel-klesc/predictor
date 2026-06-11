import { describe, expect, it } from "vitest";

import {
  outrightRows,
  progressionSteps,
  sortOutrightRows,
  type OutrightSimTeam,
} from "@/lib/outright-rows";
import { en } from "@/lib/strings/en";

function simTeam(teamCode: string, pChampion: number): OutrightSimTeam {
  return {
    teamCode,
    pWinGroup: Math.min(1, pChampion + 0.4),
    pR32: 0.99,
    pR16: 0.8,
    pQF: 0.55,
    pSF: 0.4,
    pFinal: Math.min(1, pChampion * 1.6),
    pChampion,
  };
}

const PER_TEAM = [
  simTeam("FRA", 0.126),
  simTeam("ESP", 0.317),
  simTeam("ARG", 0.21),
];

const TEAMS = [
  { code: "ESP", name: "Spain" },
  { code: "ARG", name: "Argentina" },
  { code: "FRA", name: "France" },
];

/** ARG flagged by the sim (edge passed the gate, ceiling lifted). */
const FLAGS = [
  {
    teamCode: "ARG",
    pImplied: 0.0909,
    edge: 0.0271,
    bestOdds: 11,
    bookmaker: "bet365",
  },
];

/** Latest snapshot: ESP priced fair-ish, ARG re-priced AFTER the sim ran. */
const PRICES = [
  { teamCode: "ESP", bestOdds: 3, bookmaker: "unibet" },
  { teamCode: "ARG", bestOdds: 11.5, bookmaker: "betfair" },
];

describe("outrightRows", () => {
  it("returns one row per simulated team, sorted by pChampion descending", () => {
    const rows = outrightRows(PER_TEAM, FLAGS, PRICES, TEAMS);
    expect(rows).toHaveLength(PER_TEAM.length);
    expect(rows.map((row) => row.teamCode)).toEqual(["ESP", "ARG", "FRA"]);
    expect(rows.map((row) => row.name)).toEqual([
      "Spain",
      "Argentina",
      "France",
    ]);
  });

  it("prefers the sim's value flag — the exact odds pair the model assessed", () => {
    const rows = outrightRows(PER_TEAM, FLAGS, PRICES, TEAMS);
    const arg = rows.find((row) => row.teamCode === "ARG")!;
    // Flag odds (11, bet365), not the fresher snapshot price (11.5, betfair).
    expect(arg.odds).toBe(11);
    expect(arg.bookmaker).toBe("bet365");
    expect(arg.pImplied).toBe(0.0909);
    expect(arg.edge).toBe(0.0271);
    expect(arg.isValue).toBe(true);
    expect(arg.tier).toBe("slight");
  });

  it("computes an informational edge from the latest price for unflagged teams", () => {
    const rows = outrightRows(PER_TEAM, FLAGS, PRICES, TEAMS);
    const esp = rows.find((row) => row.teamCode === "ESP")!;
    expect(esp.odds).toBe(3);
    expect(esp.bookmaker).toBe("unibet");
    expect(esp.pImplied).toBeCloseTo(1 / 3, 10);
    expect(esp.edge).toBeCloseTo(0.317 - 1 / 3, 10);
    expect(esp.isValue).toBe(false);
    // Informational edges are never tinted, whatever their size.
    expect(esp.tier).toBeNull();
  });

  it("renders unpriced teams with null odds/implied/edge", () => {
    const rows = outrightRows(PER_TEAM, FLAGS, PRICES, TEAMS);
    const fra = rows.find((row) => row.teamCode === "FRA")!;
    expect(fra.odds).toBeNull();
    expect(fra.bookmaker).toBeNull();
    expect(fra.pImplied).toBeNull();
    expect(fra.edge).toBeNull();
    expect(fra.isValue).toBe(false);
    expect(fra.tier).toBeNull();
  });

  it("falls back to the trigram when the team name is unknown", () => {
    const rows = outrightRows(PER_TEAM, [], [], []);
    expect(rows.every((row) => row.name === row.teamCode)).toBe(true);
  });

  it("maps flagged tiers through THE single tier map", () => {
    const flagsFor = (edge: number) => [
      { teamCode: "ESP", pImplied: 0.1, edge, bestOdds: 10, bookmaker: "bk" },
    ];
    const tierOf = (edge: number) =>
      outrightRows(PER_TEAM, flagsFor(edge), [], TEAMS).find(
        (row) => row.teamCode === "ESP",
      )!.tier;
    expect(tierOf(0.09)).toBe("strong");
    expect(tierOf(0.05)).toBe("solid");
    expect(tierOf(0.025)).toBe("slight");
  });
});

describe("sortOutrightRows", () => {
  const rows = outrightRows(PER_TEAM, FLAGS, PRICES, TEAMS);

  it("edge sort puts the highest edge first and unpriced teams last", () => {
    const sorted = sortOutrightRows(rows, "edge");
    // ARG +0.0271 > ESP (negative edge) > FRA (no price → null edge).
    expect(sorted.map((row) => row.teamCode)).toEqual(["ARG", "ESP", "FRA"]);
  });

  it("champion sort restores the default ordering", () => {
    const byEdge = sortOutrightRows(rows, "edge");
    const back = sortOutrightRows(byEdge, "champion");
    expect(back.map((row) => row.teamCode)).toEqual(["ESP", "ARG", "FRA"]);
  });

  it("does not mutate its input", () => {
    const before = rows.map((row) => row.teamCode);
    sortOutrightRows(rows, "edge");
    expect(rows.map((row) => row.teamCode)).toEqual(before);
  });

  it("orders all-unpriced rows by pChampion under edge sort", () => {
    const unpriced = outrightRows(PER_TEAM, [], [], TEAMS);
    const sorted = sortOutrightRows(unpriced, "edge");
    expect(sorted.map((row) => row.teamCode)).toEqual(["ESP", "ARG", "FRA"]);
  });
});

describe("progressionSteps", () => {
  it("maps the seven rounds in bracket order with labels from strings", () => {
    const team = simTeam("ESP", 0.317);
    const steps = progressionSteps(team);
    expect(steps.map((step) => step.key)).toEqual([
      "winGroup",
      "r32",
      "r16",
      "qf",
      "sf",
      "final",
      "champion",
    ]);
    expect(steps.map((step) => step.p)).toEqual([
      team.pWinGroup,
      team.pR32,
      team.pR16,
      team.pQF,
      team.pSF,
      team.pFinal,
      team.pChampion,
    ]);
    expect(steps.map((step) => step.label)).toEqual([
      en.outrights.rounds.winGroup,
      en.outrights.rounds.r32,
      en.outrights.rounds.r16,
      en.outrights.rounds.qf,
      en.outrights.rounds.sf,
      en.outrights.rounds.final,
      en.outrights.rounds.champion,
    ]);
  });
});
