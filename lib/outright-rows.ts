/**
 * Row models for the Tournament outrights table (Matches → Tournament view),
 * joining the latest Monte-Carlo sim with the latest outright prices. Pure
 * and unit-tested.
 *
 * Tier semantics mirror the match MarketsTable: a row is highlighted ONLY
 * when the sim flagged it in `valueOutrights` — those entries passed the
 * value gate (edge, min odds; the outright odds ceiling is lifted). Flagged
 * entries take precedence over the latest snapshot price so the displayed
 * odds/implied/edge stay the exact pair the model assessed. Edges shown on
 * non-flagged priced rows are informational (sim pChampion vs best price)
 * and never tinted.
 */
import { en } from "@/lib/strings/en";
import { valueTier, type ValueTier } from "@/lib/value-tier";

/** Per-team advancement probabilities from a `tournamentSims` doc. */
export interface OutrightSimTeam {
  teamCode: string;
  pWinGroup: number;
  pR32: number;
  pR16: number;
  pQF: number;
  pSF: number;
  pFinal: number;
  pChampion: number;
}

/** A sim-flagged outright value entry (`tournamentSims.valueOutrights`). */
export interface OutrightValueFlag {
  teamCode: string;
  pImplied: number;
  edge: number;
  bestOdds: number;
  bookmaker: string;
}

/** Best outright price for one team (`outrightSnapshots.prices`). */
export interface OutrightPrice {
  teamCode: string;
  bestOdds: number;
  bookmaker: string;
}

export interface OutrightRow extends OutrightSimTeam {
  /** Display name (falls back to the trigram for unknown codes). */
  name: string;
  /** Best decimal odds (null while unpriced). */
  odds: number | null;
  bookmaker: string | null;
  /** Probability implied by the best odds (null while unpriced). */
  pImplied: number | null;
  /** pChampion − pImplied (null while unpriced). */
  edge: number | null;
  /** Sim-flagged value entry — drives the highlight. */
  isValue: boolean;
  /** Tier from THE single map; non-null only on flagged rows. */
  tier: ValueTier | null;
}

function byChampion(a: OutrightRow, b: OutrightRow): number {
  return b.pChampion - a.pChampion || a.teamCode.localeCompare(b.teamCode);
}

function byEdge(a: OutrightRow, b: OutrightRow): number {
  if (a.edge === null && b.edge === null) return byChampion(a, b);
  if (a.edge === null) return 1;
  if (b.edge === null) return -1;
  return b.edge - a.edge || byChampion(a, b);
}

/**
 * One row per simulated team, sorted by pChampion descending. Unpriced
 * teams render with null odds/implied/edge ("—" in the UI).
 */
export function outrightRows(
  perTeam: readonly OutrightSimTeam[],
  valueOutrights: readonly OutrightValueFlag[],
  prices: readonly OutrightPrice[],
  teams: ReadonlyArray<{ code: string; name: string }>,
): OutrightRow[] {
  const nameByCode = new Map(teams.map((team) => [team.code, team.name]));
  const flagByCode = new Map(
    valueOutrights.map((flag) => [flag.teamCode, flag]),
  );
  const priceByCode = new Map(prices.map((price) => [price.teamCode, price]));

  return perTeam
    .map((team) => {
      const flagged = flagByCode.get(team.teamCode);
      const price = priceByCode.get(team.teamCode);
      const odds = flagged?.bestOdds ?? price?.bestOdds ?? null;
      const pImplied =
        flagged?.pImplied ?? (odds !== null && odds > 0 ? 1 / odds : null);
      const edge =
        flagged?.edge ?? (pImplied !== null ? team.pChampion - pImplied : null);
      return {
        ...team,
        name: nameByCode.get(team.teamCode) ?? team.teamCode,
        odds,
        bookmaker: flagged?.bookmaker ?? price?.bookmaker ?? null,
        pImplied,
        edge,
        isValue: flagged !== undefined,
        tier: flagged ? valueTier(flagged.edge) : null,
      };
    })
    .sort(byChampion);
}

export type OutrightSort = "champion" | "edge";

/**
 * Re-sort rows without mutating the input: "champion" by pChampion
 * descending; "edge" by edge descending with unpriced (null-edge) rows last.
 */
export function sortOutrightRows(
  rows: readonly OutrightRow[],
  sort: OutrightSort,
): OutrightRow[] {
  return [...rows].sort(sort === "edge" ? byEdge : byChampion);
}

export interface ProgressionStep {
  key: "winGroup" | "r32" | "r16" | "qf" | "sf" | "final" | "champion";
  label: string;
  p: number;
}

/**
 * The seven per-round probabilities of one team in bracket order — feeds
 * the expanded row's mini-bar list. Note pWinGroup (winning the group) can
 * sit below pR32 (reaching the R32 — runners-up and best thirds advance
 * too); the remaining steps are non-increasing.
 */
export function progressionSteps(team: OutrightSimTeam): ProgressionStep[] {
  const rounds = en.outrights.rounds;
  return [
    { key: "winGroup", label: rounds.winGroup, p: team.pWinGroup },
    { key: "r32", label: rounds.r32, p: team.pR32 },
    { key: "r16", label: rounds.r16, p: team.pR16 },
    { key: "qf", label: rounds.qf, p: team.pQF },
    { key: "sf", label: rounds.sf, p: team.pSF },
    { key: "final", label: rounds.final, p: team.pFinal },
    { key: "champion", label: rounds.champion, p: team.pChampion },
  ];
}
