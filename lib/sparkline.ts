/**
 * Sparkline scale/path math. Pure and unit-tested — the SVG component in
 * `components/match/odds-sparkline.tsx` only stringifies what these return.
 */

export interface SparkleSample {
  /** X position source (timestamp in ms — spacing follows real time). */
  t: number;
  /** Y value (e.g. implied probability). */
  v: number;
}

export interface SparklinePoint {
  x: number;
  y: number;
}

/** Decimal odds → implied probability (no de-margin), e.g. 2.0 → 0.5. */
export function impliedProbability(odds: number): number {
  return odds > 0 ? 1 / odds : 0;
}

/**
 * Scale samples into a width×height viewBox (SVG y grows downward, so the
 * max value maps to the top). Degenerate spans (all-equal timestamps or
 * values) center on the axis instead of dividing by zero. Coordinates are
 * rounded to 2 decimals to keep path strings compact.
 */
export function sparklinePoints(
  samples: ReadonlyArray<SparkleSample>,
  width: number,
  height: number,
  padding = 2,
): SparklinePoint[] {
  const innerW = Math.max(width - 2 * padding, 0);
  const innerH = Math.max(height - 2 * padding, 0);
  const ts = samples.map((s) => s.t);
  const vs = samples.map((s) => s.v);
  const tMin = Math.min(...ts);
  const tSpan = Math.max(...ts) - tMin;
  const vMin = Math.min(...vs);
  const vSpan = Math.max(...vs) - vMin;
  const round = (n: number) => Math.round(n * 100) / 100;
  return samples.map((s) => ({
    x: round(
      padding + (tSpan > 0 ? ((s.t - tMin) / tSpan) * innerW : innerW / 2),
    ),
    y: round(
      padding + (vSpan > 0 ? (1 - (s.v - vMin) / vSpan) * innerH : innerH / 2),
    ),
  }));
}

/** Samples → SVG path ("M x y L x y …"); empty input → empty string. */
export function sparklinePath(
  samples: ReadonlyArray<SparkleSample>,
  width: number,
  height: number,
  padding = 2,
): string {
  const points = sparklinePoints(samples, width, height, padding);
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export type SparklineTrend = "up" | "down" | "flat";

/**
 * Opening → current movement. `epsilon` absorbs float noise so tiny
 * wobbles read as flat (default half a percentage point on probabilities).
 */
export function sparklineTrend(
  first: number,
  last: number,
  epsilon = 0.005,
): SparklineTrend {
  const delta = last - first;
  if (delta > epsilon) return "up";
  if (delta < -epsilon) return "down";
  return "flat";
}
