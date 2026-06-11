/**
 * Market/model blend: p = w·market + (1−w)·model with w defaulting to 0.7
 * (userSettings.blendWeight).
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

/** Default market weight w in the blend. */
export const DEFAULT_BLEND_WEIGHT = 0.7;

/** Blend a single probability: w·market + (1−w)·model. */
export function blendProbability(
  market: number,
  model: number,
  weight: number = DEFAULT_BLEND_WEIGHT,
): number {
  return weight * market + (1 - weight) * model;
}

/**
 * Blend two aligned probability vectors and renormalize (a no-op when both
 * inputs already sum to 1, exact otherwise).
 */
export function blendProbabilities(
  market: number[],
  model: number[],
  weight: number = DEFAULT_BLEND_WEIGHT,
): number[] {
  if (market.length !== model.length) {
    throw new Error(
      `blendProbabilities: length mismatch (${market.length} vs ${model.length})`,
    );
  }
  const blended = market.map((m, i) => blendProbability(m, model[i], weight));
  const total = blended.reduce((a, b) => a + b, 0);
  return blended.map((p) => p / total);
}
