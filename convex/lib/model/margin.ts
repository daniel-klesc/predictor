/**
 * De-margining of bookmaker decimal odds.
 *
 * - `proportional` divides each raw implied probability by the booksum.
 * - `shin` inverts Shin's (1992) insider-trading model by solving for the
 *   insider proportion z with a fixed-point iteration; it reallocates more
 *   of the margin to longshots (the favourite-longshot bias), so longshots
 *   come out with a lower probability than under the proportional method.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

/** Raw implied probability of decimal odds (still contains the margin). */
export function impliedProbability(odds: number): number {
  return 1 / odds;
}

/** Proportional (multiplicative) de-margining; result sums to 1. */
export function proportional(odds: number[]): number[] {
  const raw = odds.map(impliedProbability);
  const booksum = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / booksum);
}

/** Maximum fixed-point iterations when solving for Shin's z. */
export const SHIN_MAX_ITERATIONS = 1000;

/** Convergence threshold on z between iterations. */
export const SHIN_CONVERGENCE_EPSILON = 1e-12;

/**
 * Shin probability of one outcome given z, its raw implied probability and
 * the booksum: p = (√(z² + 4(1−z)π²/B) − z) / (2(1−z)).
 */
function shinProbability(z: number, pi: number, booksum: number): number {
  return (
    (Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / booksum) - z) / (2 * (1 - z))
  );
}

/**
 * Shin de-margining; result sums to 1.
 *
 * For n ≥ 3 outcomes z is found by the standard fixed-point iteration
 * z ← (Σ√(z² + 4(1−z)πᵢ²/B) − 2) / (n − 2); for n = 2 that update is
 * degenerate and the closed-form solution is used instead. Books with no
 * overround (booksum ≤ 1) fall back to proportional normalization.
 */
export function shin(odds: number[]): number[] {
  const raw = odds.map(impliedProbability);
  const booksum = raw.reduce((a, b) => a + b, 0);
  const n = raw.length;
  if (n < 2 || booksum <= 1 + 1e-9) {
    return raw.map((p) => p / booksum);
  }

  let z: number;
  if (n === 2) {
    // Closed form: with D = (π₁² − π₂²)/B, solving Σp = 1 for w = 1 − z
    // gives w = (4π₁²/B − 2D − 2) / (D² − 1).
    const [a, b] = raw;
    const d = (a * a - b * b) / booksum;
    const w = ((4 * a * a) / booksum - 2 * d - 2) / (d * d - 1);
    z = 1 - w;
  } else {
    z = 0;
    for (let i = 0; i < SHIN_MAX_ITERATIONS; i += 1) {
      const sumRoots = raw.reduce(
        (acc, pi) => acc + Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / booksum),
        0,
      );
      const next = (sumRoots - 2) / (n - 2);
      const converged = Math.abs(next - z) < SHIN_CONVERGENCE_EPSILON;
      z = next;
      if (converged) break;
    }
  }
  z = Math.min(Math.max(z, 0), 0.999);

  const probs = raw.map((pi) => shinProbability(z, pi, booksum));
  const total = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => p / total);
}
