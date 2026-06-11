/**
 * ROI math and stake suggestion for the Bets screen. Pure — unit-tested.
 */

/** Statuses that count toward ROI (the bet has a final result). */
const SETTLED_STATUSES = new Set(["won", "lost", "void"]);

export interface RoiBet {
  status: string;
  stake?: number | null;
  payout?: number | null;
}

export interface RoiSummaryData {
  /** Total stake across settled bets. */
  staked: number;
  /** Total payout across settled bets (void pays the stake back). */
  returned: number;
  /** returned − staked. */
  profit: number;
  /** profit / staked, e.g. 0.21 — null while nothing is staked. */
  yield: number | null;
}

/**
 * Staked / returned / profit / yield across SETTLED bets only (won, lost,
 * void). Proposed and placed bets never count — ROI is honest, not hopeful.
 */
export function computeRoi(bets: readonly RoiBet[]): RoiSummaryData {
  let staked = 0;
  let returned = 0;
  for (const bet of bets) {
    if (!SETTLED_STATUSES.has(bet.status)) continue;
    staked += bet.stake ?? 0;
    returned += bet.payout ?? 0;
  }
  const profit = returned - staked;
  return {
    staked,
    returned,
    profit,
    yield: staked > 0 ? profit / staked : null,
  };
}

/**
 * Suggested stake = kellyFraction × bankroll, rounded to a whole unit.
 * `kellyFraction` is the prediction's stored fraction (already multiplied by
 * the user's Kelly multiplier and capped). Null when either input is
 * missing/non-positive or the rounded suggestion is below 1 unit — the
 * dialog then simply omits the suggestion.
 */
export function suggestedStake(
  kellyFraction: number | null | undefined,
  bankroll: number | null | undefined,
): number | null {
  if (
    kellyFraction == null ||
    bankroll == null ||
    !Number.isFinite(kellyFraction) ||
    !Number.isFinite(bankroll) ||
    kellyFraction <= 0 ||
    bankroll <= 0
  ) {
    return null;
  }
  const rounded = Math.round(kellyFraction * bankroll);
  return rounded >= 1 ? rounded : null;
}
