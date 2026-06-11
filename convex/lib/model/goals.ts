/**
 * Elo difference → expected goals (Poisson lambdas).
 *
 * Calibration (named exports; re-fit vs the Kaggle martj42 results dataset
 * is an optional Phase 3):
 *
 * - `BASE_TOTAL_GOALS` (μ ≈ 2.6) is the World Cup total-goals baseline; an
 *   even match produces λ = μ/2 per side.
 * - The Elo difference splits the goals multiplicatively and symmetrically:
 *   λhome = (μ/2)·e^(δ·d), λaway = (μ/2)·e^(−δ·d) with δ =
 *   `ELO_TO_GOALS_SCALE`. δ = 0.002 (1/500) makes the resulting
 *   Dixon-Coles grid's implied win expectancy track the Elo win expectancy
 *   for |d| ≲ 400 (e.g. d = 300 → λ 2.37/0.71, grid expectancy ≈ 0.82 vs
 *   Elo 0.85) and lets totals grow mildly with mismatch size (blowouts
 *   really do produce more goals).
 * - Lambdas are clamped to [`MIN_LAMBDA`, `MAX_LAMBDA`] so extreme Elo gaps
 *   (Spain vs the weakest qualifiers, |d| ≳ 620) stay inside the 0–10
 *   scoreline grid's range of validity.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

/** Total-goals baseline μ for an even match. */
export const BASE_TOTAL_GOALS = 2.6;

/** Exponential rate δ converting Elo difference into a goals split. */
export const ELO_TO_GOALS_SCALE = 0.002;

/** Lower clamp for either side's expected goals. */
export const MIN_LAMBDA = 0.2;

/** Upper clamp for either side's expected goals. */
export const MAX_LAMBDA = 4.5;

export interface ExpectedGoals {
  home: number;
  away: number;
}

function clampLambda(lambda: number): number {
  return Math.min(MAX_LAMBDA, Math.max(MIN_LAMBDA, lambda));
}

/**
 * Expected goals for both sides given the effective Elo difference
 * (home − away, host advantage already applied).
 */
export function expectedGoals(eloDiff: number): ExpectedGoals {
  const half = BASE_TOTAL_GOALS / 2;
  const factor = Math.exp(eloDiff * ELO_TO_GOALS_SCALE);
  return {
    home: clampLambda(half * factor),
    away: clampLambda(half / factor),
  };
}
