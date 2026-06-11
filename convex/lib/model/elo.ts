/**
 * Elo primitives for the prediction model.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

/**
 * Elo bonus applied to a host nation (USA/MEX/CAN) when it is the
 * designated home side of a fixture.
 */
export const HOST_ELO_BONUS = 100;

/** The three 2026 host nations (FIFA trigrams). */
export const HOST_TEAM_CODES = ["USA", "MEX", "CAN"] as const;

/**
 * Win expectancy of the side that is `eloDiff` Elo points stronger:
 * `1 / (1 + 10^(-d/400))`.
 */
export function winExpectancy(eloDiff: number): number {
  return 1 / (1 + Math.pow(10, -eloDiff / 400));
}

/**
 * Effective Elo difference (home − away) with the host-advantage bonus
 * added to the home side when it applies.
 */
export function effectiveEloDiff(
  homeElo: number,
  awayElo: number,
  hostAdvApplies: boolean,
): number {
  return homeElo + (hostAdvApplies ? HOST_ELO_BONUS : 0) - awayElo;
}
