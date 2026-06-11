/**
 * Derived match markets from the scoreline grid: 1X2, over/under 2.5,
 * BTTS, the most likely scorelines, and knockout qualification (the draw
 * mass split into an extra-time/penalties outcome tilted by Elo).
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { winExpectancy } from "./elo";

/** Over/under markets use this goals line. */
export const OVER_UNDER_LINE = 2.5;

/** How many top scorelines a prediction carries. */
export const TOP_SCORELINES_COUNT = 6;

export interface OneXTwo {
  home: number;
  draw: number;
  away: number;
}

/** Match-odds (1X2) probabilities from the grid. */
export function oneXTwo(grid: number[][]): OneXTwo {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h < grid.length; h += 1) {
    for (let a = 0; a < grid[h].length; a += 1) {
      if (h > a) home += grid[h][a];
      else if (h === a) draw += grid[h][a];
      else away += grid[h][a];
    }
  }
  return { home, draw, away };
}

/** Over/under 2.5 goals probabilities from the grid. */
export function overUnder25(grid: number[][]): { over: number; under: number } {
  let over = 0;
  let under = 0;
  for (let h = 0; h < grid.length; h += 1) {
    for (let a = 0; a < grid[h].length; a += 1) {
      if (h + a > OVER_UNDER_LINE) over += grid[h][a];
      else under += grid[h][a];
    }
  }
  return { over, under };
}

/** Both-teams-to-score probabilities from the grid. */
export function btts(grid: number[][]): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (let h = 0; h < grid.length; h += 1) {
    for (let a = 0; a < grid[h].length; a += 1) {
      if (h > 0 && a > 0) yes += grid[h][a];
      else no += grid[h][a];
    }
  }
  return { yes, no };
}

export interface Scoreline {
  home: number;
  away: number;
  p: number;
}

/**
 * The `count` most likely scorelines, sorted by probability descending
 * (ties broken by home then away goals ascending — deterministic).
 */
export function topScorelines(
  grid: number[][],
  count: number = TOP_SCORELINES_COUNT,
): Scoreline[] {
  const all: Scoreline[] = [];
  for (let h = 0; h < grid.length; h += 1) {
    for (let a = 0; a < grid[h].length; a += 1) {
      all.push({ home: h, away: a, p: grid[h][a] });
    }
  }
  all.sort((x, y) => y.p - x.p || x.home - y.home || x.away - y.away);
  return all.slice(0, count);
}

/**
 * Knockout qualification probabilities: the 90-minute win probabilities
 * plus the draw mass split by a single Elo-tilted Bernoulli modelling
 * extra time + penalties. `eloDiff` is the effective difference
 * (home − away, host advantage applied) used for the tilt.
 */
export function qualifyProbabilities(
  grid: number[][],
  eloDiff: number,
): { home: number; away: number } {
  const { home, draw, away } = oneXTwo(grid);
  const tilt = winExpectancy(eloDiff);
  return { home: home + draw * tilt, away: away + draw * (1 - tilt) };
}
