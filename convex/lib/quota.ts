/**
 * The Odds API quota guard — pure helpers.
 *
 * Every Odds API response carries `x-requests-remaining` / `x-requests-used`
 * headers (string values). The latest parsed remaining value is persisted to
 * `syncAudit.creditsRemaining` on every call; BEFORE any new API call the
 * guard checks the last known value and HARD-STOPS the run (zero API calls,
 * "skipped: credits low" audit row) when fewer than QUOTA_MIN_CREDITS remain.
 *
 * The free-tier quota resets monthly, so a last-known value recorded in a
 * previous UTC month is stale and treated as unknown (otherwise a hard-stop
 * would outlive the reset and odds would silently stop forever).
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

/** Hard-stop threshold: skip the run when fewer credits than this remain. */
export const QUOTA_MIN_CREDITS = 30;

/**
 * Parse a quota header value ("412", "411.0") into a number.
 * Undefined when the header is absent or not numeric — never guessed.
 */
export function parseCreditsHeader(
  value: string | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * HARD-STOP predicate: true → skip the run entirely (make no API call).
 * Unknown remaining (no odds call recorded yet, or stale value) never blocks.
 */
export function shouldSkipForQuota(
  lastKnownRemaining: number | null | undefined,
  minCredits: number = QUOTA_MIN_CREDITS,
): boolean {
  if (lastKnownRemaining == null) return false;
  return lastKnownRemaining < minCredits;
}

/**
 * Start (UTC ms) of the calendar month containing `now`. The Odds API quota
 * resets monthly — credits recorded before this boundary are stale.
 */
export function startOfUtcMonth(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}
