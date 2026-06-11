/**
 * Monte-Carlo tournament simulation for the 2026 format: 12 groups of 4,
 * group top 2 + the 8 best third-placed teams advance to the round of 32.
 *
 * Pure TypeScript — no Convex imports. Fully deterministic for a fixed
 * seed (mulberry32 PRNG, fixed consumption order).
 *
 * Inputs mirror the seeded schedule: every match carries either resolved
 * team codes or the openfootball knockout placeholders ("1A", "2B",
 * "3A/B/C/D/F", "W74", "L101"). Finished matches are taken as fact
 * (scores for group matches, winnerCode for knockout matches), so the sim
 * automatically conditions on real results as the tournament progresses.
 *
 * Documented simplifications:
 *
 * - Third-place → R32 slot mapping: instead of FIFA's official 495-row
 *   allocation table, the 8 qualified thirds are matched to the 8
 *   third-place R32 slots by deterministic backtracking over each slot's
 *   allowed-group set (slots ordered by fewest options first, candidates
 *   in third-place-ranking order; the first perfect matching wins). The
 *   schedule's sets guarantee a perfect matching exists for every
 *   qualified combination; a ranking-order greedy fallback covers
 *   malformed inputs.
 * - Group tiebreakers: points → goal difference → goals for → team code
 *   (FIFA's head-to-head / fair-play / drawing-of-lots steps are replaced
 *   by the deterministic code fallback). The same order ranks the thirds.
 * - Host advantage (+100 Elo) applies whenever a host nation occupies the
 *   designated home (first) slot of a fixture.
 * - Knockout draws after 90 minutes resolve via a single Elo-tilted
 *   Bernoulli (extra time + penalties combined) — `qualifyProbabilities`.
 * - Live/postponed matches are resampled from the pre-match model
 *   (in-game state is ignored); cancelled matches are skipped (no points).
 * - The third-place play-off is not simulated (it has no bearing on the
 *   per-team advancement probabilities).
 */
import { effectiveEloDiff } from "./elo";
import { expectedGoals } from "./goals";
import { qualifyProbabilities } from "./markets";
import { MAX_GOALS, scorelineGrid } from "./poisson";

/** Default number of Monte-Carlo runs. */
export const DEFAULT_SIM_RUNS = 10_000;

/** Default RNG seed (fixed so repeated runs on the same data agree). */
export const DEFAULT_SIM_SEED = 2026;

/** How many third-placed teams advance to the R32. */
export const THIRD_PLACE_QUALIFIERS = 8;

/** mulberry32 — tiny deterministic PRNG; returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SimStage =
  | "group"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "third"
  | "final";

export type SimMatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export interface SimTeam {
  code: string;
  elo: number;
  /** Group letter "A".."L". */
  group: string;
  isHost: boolean;
}

export interface SimMatch {
  matchNumber: number;
  stage: SimStage;
  group?: string;
  /** Resolved team codes (set once the slot holds a real team). */
  homeCode?: string;
  awayCode?: string;
  /** Knockout slot placeholders, e.g. "1A", "2B", "3A/B/C/D/F", "W74". */
  homePlaceholder?: string;
  awayPlaceholder?: string;
  status?: SimMatchStatus;
  /** Final score (incl. extra time, excl. penalties) when finished. */
  score?: { home: number; away: number };
  /** Winner (incl. penalty shootouts) for finished knockout matches. */
  winnerCode?: string;
}

export interface TeamSimProbabilities {
  teamCode: string;
  pWinGroup: number;
  pR32: number;
  pR16: number;
  pQF: number;
  pSF: number;
  pFinal: number;
  pChampion: number;
}

export interface SimOptions {
  runs?: number;
  seed?: number;
  /** Disable the +100 host Elo bonus (sensitivity testing). */
  hostAdvantage?: boolean;
}

export interface SimResult {
  runs: number;
  seed: number;
  /** Sorted by team code. */
  perTeam: TeamSimProbabilities[];
}

export interface ThirdPlaceSlot {
  /** R32 match whose slot takes a third-placed team. */
  matchNumber: number;
  /** Group letters whose third can fill this slot. */
  allowedGroups: ReadonlySet<string>;
}

/**
 * Assign qualified third-placed teams (in ranking order) to the
 * third-place R32 slots, respecting each slot's allowed-group set.
 * Deterministic backtracking (slots by fewest options then match number,
 * candidates in ranking order); greedy ranking-order fallback when no
 * perfect matching exists.
 */
export function assignThirdPlaceSlots<T>(
  slots: ReadonlyArray<ThirdPlaceSlot>,
  thirds: ReadonlyArray<{ id: T; group: string }>,
): Map<number, T> {
  const ordered = [...slots].sort(
    (a, b) =>
      a.allowedGroups.size - b.allowedGroups.size ||
      a.matchNumber - b.matchNumber,
  );
  const used = thirds.map(() => false);
  const assignment = new Map<number, T>();

  const backtrack = (position: number): boolean => {
    if (position === ordered.length) return true;
    const slot = ordered[position];
    for (let i = 0; i < thirds.length; i += 1) {
      if (used[i] || !slot.allowedGroups.has(thirds[i].group)) continue;
      used[i] = true;
      assignment.set(slot.matchNumber, thirds[i].id);
      if (backtrack(position + 1)) return true;
      used[i] = false;
      assignment.delete(slot.matchNumber);
    }
    return false;
  };

  if (backtrack(0)) return assignment;

  // Fallback for inputs the official constraint sets do not cover: greedy
  // in ranking order, preferring an allowed slot, else any open slot.
  assignment.clear();
  used.fill(false);
  for (const slot of ordered) {
    let pick = thirds.findIndex(
      (t, i) => !used[i] && slot.allowedGroups.has(t.group),
    );
    if (pick === -1) pick = used.findIndex((u) => !u);
    if (pick === -1) break;
    used[pick] = true;
    assignment.set(slot.matchNumber, thirds[pick].id);
  }
  return assignment;
}

type SlotRef =
  | { kind: "team"; teamIdx: number }
  | { kind: "groupWinner"; groupIdx: number }
  | { kind: "groupRunnerUp"; groupIdx: number }
  | { kind: "third"; matchNumber: number }
  | { kind: "matchWinner"; matchNumber: number }
  | { kind: "matchLoser"; matchNumber: number };

interface GroupMatchPlan {
  homeIdx: number;
  awayIdx: number;
  fixedHome?: number;
  fixedAway?: number;
  /** Cumulative scoreline distribution when the match is sampled. */
  cdf?: Float64Array;
}

interface KnockoutPlan {
  matchNumber: number;
  stage: SimStage;
  home: SlotRef;
  away: SlotRef;
  /** Actual winner for finished knockout matches. */
  fixedWinnerIdx?: number;
}

const GRID_SIZE = MAX_GOALS + 1;

/** Run the Monte-Carlo tournament simulation. */
export function simulateTournament(
  teams: ReadonlyArray<SimTeam>,
  matches: ReadonlyArray<SimMatch>,
  options: SimOptions = {},
): SimResult {
  const runs = options.runs ?? DEFAULT_SIM_RUNS;
  const seed = options.seed ?? DEFAULT_SIM_SEED;
  const hostAdvantage = options.hostAdvantage ?? true;
  const rng = mulberry32(seed);

  const teamCount = teams.length;
  const idxByCode = new Map(teams.map((team, i) => [team.code, i]));
  const groupLetters = [...new Set(teams.map((team) => team.group))].sort();
  const groupIdxByLetter = new Map(groupLetters.map((g, i) => [g, i]));
  const groupMembers: number[][] = groupLetters.map(() => []);
  teams.forEach((team, i) => {
    groupMembers[groupIdxByLetter.get(team.group)!].push(i);
  });
  for (const members of groupMembers) {
    members.sort((a, b) => teams[a].code.localeCompare(teams[b].code));
  }

  const requireTeamIdx = (code: string, context: string): number => {
    const idx = idxByCode.get(code);
    if (idx === undefined) {
      throw new Error(`sim: unknown team code "${code}" (${context})`);
    }
    return idx;
  };

  const effDiff = (homeIdx: number, awayIdx: number): number =>
    effectiveEloDiff(
      teams[homeIdx].elo,
      teams[awayIdx].elo,
      hostAdvantage && teams[homeIdx].isHost,
    );

  const sorted = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);

  // ---- plan group matches ----
  const groupPlans: GroupMatchPlan[] = [];
  for (const match of sorted) {
    if (match.stage !== "group" || match.status === "cancelled") continue;
    if (!match.homeCode || !match.awayCode) continue;
    const homeIdx = requireTeamIdx(
      match.homeCode,
      `match ${match.matchNumber}`,
    );
    const awayIdx = requireTeamIdx(
      match.awayCode,
      `match ${match.matchNumber}`,
    );
    if (match.status === "finished" && match.score) {
      groupPlans.push({
        homeIdx,
        awayIdx,
        fixedHome: match.score.home,
        fixedAway: match.score.away,
      });
      continue;
    }
    const lambdas = expectedGoals(effDiff(homeIdx, awayIdx));
    const grid = scorelineGrid(lambdas.home, lambdas.away);
    const cdf = new Float64Array(GRID_SIZE * GRID_SIZE);
    let acc = 0;
    let cell = 0;
    for (let h = 0; h < GRID_SIZE; h += 1) {
      for (let a = 0; a < GRID_SIZE; a += 1) {
        acc += grid[h][a];
        cdf[cell] = acc;
        cell += 1;
      }
    }
    groupPlans.push({ homeIdx, awayIdx, cdf });
  }

  // ---- plan knockout matches ----
  const thirdSlots: ThirdPlaceSlot[] = [];
  const parseSlot = (
    code: string | undefined,
    placeholder: string | undefined,
    matchNumber: number,
  ): SlotRef => {
    if (code) {
      return {
        kind: "team",
        teamIdx: requireTeamIdx(code, `match ${matchNumber}`),
      };
    }
    const raw = (placeholder ?? "").trim();
    let m = /^([12])([A-L])$/.exec(raw);
    if (m) {
      const groupIdx = groupIdxByLetter.get(m[2]);
      if (groupIdx === undefined) {
        throw new Error(`sim: match ${matchNumber}: unknown group "${m[2]}"`);
      }
      return m[1] === "1"
        ? { kind: "groupWinner", groupIdx }
        : { kind: "groupRunnerUp", groupIdx };
    }
    m = /^3([A-L](?:\/[A-L])+)$/.exec(raw);
    if (m) {
      thirdSlots.push({
        matchNumber,
        allowedGroups: new Set(m[1].split("/")),
      });
      return { kind: "third", matchNumber };
    }
    m = /^([WL])(\d{1,3})$/.exec(raw);
    if (m) {
      return m[1] === "W"
        ? { kind: "matchWinner", matchNumber: Number(m[2]) }
        : { kind: "matchLoser", matchNumber: Number(m[2]) };
    }
    throw new Error(
      `sim: match ${matchNumber}: unresolvable slot (placeholder "${raw}")`,
    );
  };

  const knockoutPlans: KnockoutPlan[] = [];
  for (const match of sorted) {
    if (match.stage === "group" || match.stage === "third") continue;
    const fixedWinnerIdx =
      match.status === "finished" && match.winnerCode
        ? requireTeamIdx(match.winnerCode, `match ${match.matchNumber}`)
        : undefined;
    knockoutPlans.push({
      matchNumber: match.matchNumber,
      stage: match.stage,
      home: parseSlot(match.homeCode, match.homePlaceholder, match.matchNumber),
      away: parseSlot(match.awayCode, match.awayPlaceholder, match.matchNumber),
      fixedWinnerIdx,
    });
  }

  // ---- knockout advance probabilities, memoized per pairing ----
  const qualifyMemo = new Map<number, number>();
  const pHomeAdvances = (homeIdx: number, awayIdx: number): number => {
    const key = homeIdx * 64 + awayIdx;
    const cached = qualifyMemo.get(key);
    if (cached !== undefined) return cached;
    const diff = effDiff(homeIdx, awayIdx);
    const lambdas = expectedGoals(diff);
    const grid = scorelineGrid(lambdas.home, lambdas.away);
    const q = qualifyProbabilities(grid, diff).home;
    qualifyMemo.set(key, q);
    return q;
  };

  // ---- counters ----
  const winGroupCount = new Float64Array(teamCount);
  const reachedCount: Record<string, Float64Array> = {
    r32: new Float64Array(teamCount),
    r16: new Float64Array(teamCount),
    qf: new Float64Array(teamCount),
    sf: new Float64Array(teamCount),
    final: new Float64Array(teamCount),
  };
  const championCount = new Float64Array(teamCount);

  // ---- run loop ----
  const pts = new Int32Array(teamCount);
  const goalsFor = new Int32Array(teamCount);
  const goalsAgainst = new Int32Array(teamCount);

  for (let run = 0; run < runs; run += 1) {
    pts.fill(0);
    goalsFor.fill(0);
    goalsAgainst.fill(0);

    for (const plan of groupPlans) {
      let homeGoals: number;
      let awayGoals: number;
      if (plan.cdf === undefined) {
        homeGoals = plan.fixedHome!;
        awayGoals = plan.fixedAway!;
      } else {
        const u = rng();
        let cell = 0;
        const last = plan.cdf.length - 1;
        while (cell < last && plan.cdf[cell] < u) cell += 1;
        homeGoals = Math.floor(cell / GRID_SIZE);
        awayGoals = cell % GRID_SIZE;
      }
      goalsFor[plan.homeIdx] += homeGoals;
      goalsAgainst[plan.homeIdx] += awayGoals;
      goalsFor[plan.awayIdx] += awayGoals;
      goalsAgainst[plan.awayIdx] += homeGoals;
      if (homeGoals > awayGoals) pts[plan.homeIdx] += 3;
      else if (homeGoals < awayGoals) pts[plan.awayIdx] += 3;
      else {
        pts[plan.homeIdx] += 1;
        pts[plan.awayIdx] += 1;
      }
    }

    // Standings: points → goal difference → goals for → team code.
    const standingsCompare = (x: number, y: number): number =>
      pts[y] - pts[x] ||
      goalsFor[y] - goalsAgainst[y] - (goalsFor[x] - goalsAgainst[x]) ||
      goalsFor[y] - goalsFor[x] ||
      teams[x].code.localeCompare(teams[y].code);

    const groupWinner: number[] = [];
    const groupRunnerUp: number[] = [];
    const thirds: number[] = [];
    for (let g = 0; g < groupMembers.length; g += 1) {
      const order = [...groupMembers[g]].sort(standingsCompare);
      groupWinner[g] = order[0];
      groupRunnerUp[g] = order[1];
      if (order.length > 2) thirds.push(order[2]);
      winGroupCount[order[0]] += 1;
    }
    thirds.sort(standingsCompare);
    const qualifiedThirds = thirds.slice(0, THIRD_PLACE_QUALIFIERS);
    const thirdAssignment = assignThirdPlaceSlots(
      thirdSlots,
      qualifiedThirds.map((teamIdx) => ({
        id: teamIdx,
        group: teams[teamIdx].group,
      })),
    );

    // Knockout bracket.
    const winnerOf = new Map<number, number>();
    const loserOf = new Map<number, number>();
    const resolveSlot = (ref: SlotRef): number => {
      switch (ref.kind) {
        case "team":
          return ref.teamIdx;
        case "groupWinner":
          return groupWinner[ref.groupIdx];
        case "groupRunnerUp":
          return groupRunnerUp[ref.groupIdx];
        case "third": {
          const teamIdx = thirdAssignment.get(ref.matchNumber);
          if (teamIdx === undefined) {
            throw new Error(
              `sim: no third-place team assigned to match ${ref.matchNumber}`,
            );
          }
          return teamIdx;
        }
        case "matchWinner": {
          const teamIdx = winnerOf.get(ref.matchNumber);
          if (teamIdx === undefined) {
            throw new Error(
              `sim: winner of match ${ref.matchNumber} not yet resolved`,
            );
          }
          return teamIdx;
        }
        case "matchLoser": {
          const teamIdx = loserOf.get(ref.matchNumber);
          if (teamIdx === undefined) {
            throw new Error(
              `sim: loser of match ${ref.matchNumber} not yet resolved`,
            );
          }
          return teamIdx;
        }
      }
    };

    for (const plan of knockoutPlans) {
      const homeIdx = resolveSlot(plan.home);
      const awayIdx = resolveSlot(plan.away);
      const reached = reachedCount[plan.stage];
      if (reached) {
        reached[homeIdx] += 1;
        reached[awayIdx] += 1;
      }
      let winnerIdx: number;
      if (
        plan.fixedWinnerIdx !== undefined &&
        (plan.fixedWinnerIdx === homeIdx || plan.fixedWinnerIdx === awayIdx)
      ) {
        winnerIdx = plan.fixedWinnerIdx;
      } else {
        winnerIdx = rng() < pHomeAdvances(homeIdx, awayIdx) ? homeIdx : awayIdx;
      }
      winnerOf.set(plan.matchNumber, winnerIdx);
      loserOf.set(plan.matchNumber, winnerIdx === homeIdx ? awayIdx : homeIdx);
      if (plan.stage === "final") championCount[winnerIdx] += 1;
    }
  }

  const perTeam: TeamSimProbabilities[] = teams
    .map((team, i) => ({
      teamCode: team.code,
      pWinGroup: winGroupCount[i] / runs,
      pR32: reachedCount.r32[i] / runs,
      pR16: reachedCount.r16[i] / runs,
      pQF: reachedCount.qf[i] / runs,
      pSF: reachedCount.sf[i] / runs,
      pFinal: reachedCount.final[i] / runs,
      pChampion: championCount[i] / runs,
    }))
    .sort((a, b) => a.teamCode.localeCompare(b.teamCode));

  return { runs, seed, perTeam };
}
