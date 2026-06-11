/**
 * Pure guard predicate for the results-sync cron.
 *
 * The cron runs every 10 minutes, but the football-data.org API must only be
 * called when results could actually change. Pure TS — no Convex imports
 * (unit-tested with vitest).
 */

/** A match still counts as pollable for 3.5h after kickoff (90' + ET + pens + stoppages). */
export const KICKED_OFF_WINDOW_MS = 3.5 * 60 * 60 * 1000;

/** Start polling 15 minutes before kickoff (lineups / early status flips). */
export const UPCOMING_WINDOW_MS = 15 * 60 * 1000;

export interface ResultsGuardMatch {
  status: string;
  /** Kickoff in UTC milliseconds. */
  kickoffAt: number;
}

/** Statuses that can never produce new results — polling them is wasted API budget. */
const TERMINAL_STATUSES = new Set(["finished", "cancelled", "postponed"]);

/**
 * True only if any match is live, kicked off less than 3.5h ago, or kicks
 * off in less than 15 minutes. Matches already in a terminal state
 * (finished/cancelled/postponed) never trigger polling.
 *
 * When this returns false the results-sync makes ZERO API calls.
 */
export function shouldPollResults(
  matches: ResultsGuardMatch[],
  now: number,
): boolean {
  return matches.some((match) => {
    if (match.status === "live") return true;
    if (TERMINAL_STATUSES.has(match.status)) return false;
    const sinceKickoff = now - match.kickoffAt;
    if (sinceKickoff >= 0 && sinceKickoff < KICKED_OFF_WINDOW_MS) return true;
    const untilKickoff = match.kickoffAt - now;
    return untilKickoff > 0 && untilKickoff < UPCOMING_WINDOW_MS;
  });
}
