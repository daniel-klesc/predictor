/**
 * THE single value-tier map. Every surface that styles an edge (MatchCard
 * border, ValueBadge, MarketsTable row, compact edge text) derives its tier
 * from here — no parallel threshold tables anywhere.
 */

export type ValueTier = "strong" | "solid" | "slight";

/** Edge thresholds (inclusive lower bounds) per tier. */
export const VALUE_TIER_THRESHOLDS: Record<ValueTier, number> = {
  strong: 0.08,
  solid: 0.04,
  slight: 0.02,
};

/**
 * Tier for a model edge: ≥ 0.08 strong (volt fill) · ≥ 0.04 solid (volt
 * outline) · ≥ 0.02 slight (teal outline) · below → null (no flag).
 */
export function valueTier(edge: number | null | undefined): ValueTier | null {
  if (edge == null || !Number.isFinite(edge)) return null;
  if (edge >= VALUE_TIER_THRESHOLDS.strong) return "strong";
  if (edge >= VALUE_TIER_THRESHOLDS.solid) return "solid";
  if (edge >= VALUE_TIER_THRESHOLDS.slight) return "slight";
  return null;
}

/** The highest-edge entry of a value-bet list (null when empty). */
export function topValueBet<T extends { edge: number }>(
  bets: readonly T[] | null | undefined,
): T | null {
  let top: T | null = null;
  for (const bet of bets ?? []) {
    if (top === null || bet.edge > top.edge) top = bet;
  }
  return top;
}
