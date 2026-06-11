/**
 * Pure helpers for the football-data.org v4 API
 * (GET /v4/competitions/WC/matches with header X-Auth-Token).
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { resolveTeamName } from "./teamNameMap";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export interface FdTeam {
  id: number | null;
  name: string | null;
  shortName?: string | null;
  /** Three-letter abbreviation — usually equals the FIFA trigram. */
  tla?: string | null;
}

export interface FdScorePart {
  home: number | null;
  away: number | null;
}

export interface FdScore {
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | string;
  /** Final score incl. extra time, excl. penalty shootouts. */
  fullTime: FdScorePart;
  halfTime?: FdScorePart;
  /** 90-minute score (present when the match went to extra time). */
  regularTime?: FdScorePart;
  extraTime?: FdScorePart;
  penalties?: FdScorePart;
}

export interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  stage?: string;
  group?: string | null;
  venue?: string | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: FdScore;
}

export interface FdMatchesResponse {
  matches: FdMatch[];
}

/** Map football-data statuses onto our normalized status vocabulary. */
export function normalizeFdStatus(status: string): MatchStatus {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    case "IN_PLAY":
    case "PAUSED":
    case "SUSPENDED":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "scheduled";
  }
}

export interface NormalizedScore {
  home: number;
  away: number;
  regulationHome?: number;
  regulationAway?: number;
  extraTimeHome?: number;
  extraTimeAway?: number;
  penaltiesHome?: number;
  penaltiesAway?: number;
  duration?: "regular" | "extraTime" | "penalties";
}

/** Extract a normalized score; undefined while no goals data exists yet. */
export function fdScoreToScore(
  score: FdScore | undefined,
): NormalizedScore | undefined {
  if (!score) return undefined;
  const { fullTime } = score;
  if (fullTime?.home == null || fullTime?.away == null) return undefined;
  const result: NormalizedScore = { home: fullTime.home, away: fullTime.away };
  if (score.regularTime?.home != null && score.regularTime?.away != null) {
    result.regulationHome = score.regularTime.home;
    result.regulationAway = score.regularTime.away;
  }
  if (score.extraTime?.home != null && score.extraTime?.away != null) {
    result.extraTimeHome = score.extraTime.home;
    result.extraTimeAway = score.extraTime.away;
  }
  if (score.penalties?.home != null && score.penalties?.away != null) {
    result.penaltiesHome = score.penalties.home;
    result.penaltiesAway = score.penalties.away;
  }
  switch (score.duration) {
    case "REGULAR":
      result.duration = "regular";
      break;
    case "EXTRA_TIME":
      result.duration = "extraTime";
      break;
    case "PENALTY_SHOOTOUT":
      result.duration = "penalties";
      break;
  }
  return result;
}

/**
 * Resolve a football-data team object to a FIFA trigram.
 * Tries tla (often the FIFA code itself), then name, then shortName via the
 * alias map. Null for TBD slots or unresolvable names (caller logs + skips).
 */
export function resolveFdTeamCode(team: FdTeam | undefined): string | null {
  if (!team) return null;
  for (const candidate of [team.tla, team.name, team.shortName]) {
    if (!candidate) continue;
    const entry = resolveTeamName(candidate);
    if (entry) return entry.code;
  }
  return null;
}

/** UTC calendar day ("YYYY-MM-DD") of a UTC-ms timestamp. */
export function utcDayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Cross-source pairing key: UTC kickoff day + both team codes
 * (order-independent). Used to capture footballDataId per match when no id
 * link exists yet.
 */
export function pairingKey(
  kickoffMs: number,
  codeA: string,
  codeB: string,
): string {
  const [first, second] = [codeA, codeB].sort();
  return `${utcDayOf(kickoffMs)}:${first}:${second}`;
}
