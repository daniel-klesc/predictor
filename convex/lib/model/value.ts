/**
 * Value-bet detection and staking.
 *
 * edge = pBlend − pImplied(bestOdds). A bet is flagged only when
 * edge > MIN_VALUE_EDGE AND the best odds fall inside
 * [MIN_VALUE_ODDS, MAX_VALUE_ODDS]. Stakes use fractional Kelly
 * (userSettings.kellyMultiplier, default 0.25) capped at
 * MAX_KELLY_FRACTION of bankroll, and are zero on non-positive edge.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { impliedProbability } from "./margin";

/** Minimum edge for a value flag (strictly greater than). */
export const MIN_VALUE_EDGE = 0.02;

/** Lowest best odds eligible for a value flag. */
export const MIN_VALUE_ODDS = 1.1;

/** Highest best odds eligible for a value flag. */
export const MAX_VALUE_ODDS = 15;

/** Default fraction of full Kelly to stake. */
export const DEFAULT_KELLY_MULTIPLIER = 0.25;

/** Hard cap on the staked share of bankroll. */
export const MAX_KELLY_FRACTION = 0.05;

/**
 * Fractional Kelly stake as a share of bankroll: full Kelly
 * (p·o − 1)/(o − 1) times `multiplier`, capped at MAX_KELLY_FRACTION.
 * Returns 0 when the edge is non-positive.
 */
export function kellyFraction(
  p: number,
  odds: number,
  multiplier: number = DEFAULT_KELLY_MULTIPLIER,
): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  const fullKelly = (p * odds - 1) / b;
  if (fullKelly <= 0) return 0;
  return Math.min(fullKelly * multiplier, MAX_KELLY_FRACTION);
}

export interface ValueAssessment {
  pImplied: number;
  edge: number;
  isValue: boolean;
  /** Recommended share of bankroll; 0 when not a value bet. */
  kellyFraction: number;
}

export interface ValueOptions {
  kellyMultiplier?: number;
  minEdge?: number;
  minOdds?: number;
  /** Outright (tournament-winner) checks pass Infinity here. */
  maxOdds?: number;
}

/** Assess one outcome's blended probability against the best price. */
export function assessValue(
  pBlend: number,
  bestOdds: number,
  options: ValueOptions = {},
): ValueAssessment {
  const {
    kellyMultiplier = DEFAULT_KELLY_MULTIPLIER,
    minEdge = MIN_VALUE_EDGE,
    minOdds = MIN_VALUE_ODDS,
    maxOdds = MAX_VALUE_ODDS,
  } = options;
  const pImplied = impliedProbability(bestOdds);
  const edge = pBlend - pImplied;
  const isValue = edge > minEdge && bestOdds >= minOdds && bestOdds <= maxOdds;
  return {
    pImplied,
    edge,
    isValue,
    kellyFraction: isValue
      ? kellyFraction(pBlend, bestOdds, kellyMultiplier)
      : 0,
  };
}
