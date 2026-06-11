/**
 * Scoreline grid: independent Poisson 0–10 × 0–10, Dixon-Coles low-score
 * correction (ρ = −0.1, touching only the 0-0 / 1-0 / 0-1 / 1-1 cells),
 * then renormalization so the grid sums to exactly 1 (this also absorbs
 * the probability mass truncated beyond 10 goals).
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

/** Scoreline grids cover 0..MAX_GOALS goals per side. */
export const MAX_GOALS = 10;

/** Dixon-Coles low-score correlation parameter ρ. */
export const DIXON_COLES_RHO = -0.1;

/** Poisson probability mass P(X = k) for X ~ Poisson(λ). */
export function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) {
    p *= lambda / i;
  }
  return p;
}

/**
 * Independent-Poisson joint grid, truncated at MAX_GOALS and NOT
 * renormalized. `grid[home][away]` = P(home goals, away goals).
 */
export function independentScorelineGrid(
  lambdaHome: number,
  lambdaAway: number,
): number[][] {
  const homePmf: number[] = [];
  const awayPmf: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k += 1) {
    homePmf.push(poissonPmf(k, lambdaHome));
    awayPmf.push(poissonPmf(k, lambdaAway));
  }
  return homePmf.map((ph) => awayPmf.map((pa) => ph * pa));
}

/**
 * Dixon-Coles τ multiplier for cell (home, away). Equals 1 everywhere
 * except the four low-score cells:
 *
 *   τ(0,0) = 1 − λμρ · τ(0,1) = 1 + λρ · τ(1,0) = 1 + μρ · τ(1,1) = 1 − ρ
 *
 * (λ = home mean, μ = away mean). With ρ < 0 this inflates 0-0 and 1-1
 * and deflates 1-0 and 0-1.
 */
export function dixonColesTau(
  home: number,
  away: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (home === 0 && away === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (home === 0 && away === 1) return 1 + lambdaHome * rho;
  if (home === 1 && away === 0) return 1 + lambdaAway * rho;
  if (home === 1 && away === 1) return 1 - rho;
  return 1;
}

/** DC-adjusted grid BEFORE renormalization (exposed for tests). */
export function dixonColesAdjustedGrid(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DIXON_COLES_RHO,
): number[][] {
  const grid = independentScorelineGrid(lambdaHome, lambdaAway);
  for (const [h, a] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]) {
    grid[h][a] *= dixonColesTau(h, a, lambdaHome, lambdaAway, rho);
  }
  return grid;
}

/** Sum of all grid cells. */
export function gridSum(grid: number[][]): number {
  let total = 0;
  for (const row of grid) {
    for (const p of row) total += p;
  }
  return total;
}

/**
 * The final scoreline grid: independent Poisson → Dixon-Coles correction →
 * renormalized to sum to 1.
 */
export function scorelineGrid(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DIXON_COLES_RHO,
): number[][] {
  const grid = dixonColesAdjustedGrid(lambdaHome, lambdaAway, rho);
  const total = gridSum(grid);
  return grid.map((row) => row.map((p) => p / total));
}
