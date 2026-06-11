/**
 * The prediction model — single deterministic entry point.
 *
 * `computePrediction` combines elo → goals → poisson → markets → margin →
 * blend → value:
 *
 * - model probabilities always (Dixon-Coles grid; pQualify on knockout
 *   stages);
 * - market probabilities only when 1X2 odds are present (Shin de-margined;
 *   the MEDIAN/consensus line preferred, best prices as fallback);
 * - blend (w·market + (1−w)·model) only when a market section exists;
 * - valueBets only when BEST odds are present (edge measured against the
 *   best price per outcome, stakes via capped fractional Kelly).
 *
 * `inputs` echoes the raw Elo ratings; the host advantage is folded into
 * the lambdas (and the knockout tilt), never into the recorded Elos.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { blendProbabilities, DEFAULT_BLEND_WEIGHT } from "./blend";
import { effectiveEloDiff } from "./elo";
import { expectedGoals } from "./goals";
import { shin } from "./margin";
import {
  btts,
  oneXTwo,
  overUnder25,
  qualifyProbabilities,
  topScorelines,
  type Scoreline,
} from "./markets";
import { DIXON_COLES_RHO, scorelineGrid } from "./poisson";
import { assessValue, DEFAULT_KELLY_MULTIPLIER } from "./value";

export * from "./blend";
export * from "./elo";
export * from "./goals";
export * from "./margin";
export * from "./markets";
export * from "./poisson";
export * from "./sim";
export * from "./value";

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";

export interface BestH2hOdds {
  home: number;
  homeBookmaker: string;
  draw: number;
  drawBookmaker: string;
  away: number;
  awayBookmaker: string;
}

export interface BestTotalsOdds {
  over: number;
  overBookmaker: string;
  under: number;
  underBookmaker: string;
}

export interface PredictionInput {
  homeElo: number;
  awayElo: number;
  /** True when the home side is a host nation (USA/MEX/CAN). */
  hostAdvApplies: boolean;
  stage: Stage;
  /** Best available price per outcome (drives value detection). */
  oddsBest?: {
    h2h?: BestH2hOdds;
    totals25?: BestTotalsOdds;
  };
  /** Median/consensus prices (drive the de-margined market section). */
  oddsMedian?: {
    h2h?: { home: number; draw: number; away: number };
    totals25?: { over: number; under: number };
  };
  /** Market weight in the blend (userSettings.blendWeight). */
  blendWeight?: number;
  /** Fraction of full Kelly to stake (userSettings.kellyMultiplier). */
  kellyMultiplier?: number;
}

export interface ValueBet {
  market: "h2h" | "totals25";
  selection: "home" | "draw" | "away" | "over" | "under";
  pBlend: number;
  pImplied: number;
  edge: number;
  bestOdds: number;
  bookmaker: string;
  kellyFraction: number;
}

export interface PredictionResult {
  inputs: {
    homeElo: number;
    awayElo: number;
    homeLambda: number;
    awayLambda: number;
    rho: number;
  };
  model: {
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25: number;
    pUnder25: number;
    pBttsYes: number;
    pBttsNo: number;
    topScorelines: Scoreline[];
    /** Knockout stages only: win + Elo-tilted ET/pens share of the draw. */
    pQualifyHome?: number;
    pQualifyAway?: number;
  };
  market?: {
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25?: number;
    pUnder25?: number;
    method: string;
  };
  blend?: {
    weight: number;
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25?: number;
    pUnder25?: number;
  };
  valueBets: ValueBet[];
}

/** Compute the full prediction for one match. Deterministic. */
export function computePrediction(input: PredictionInput): PredictionResult {
  const blendWeight = input.blendWeight ?? DEFAULT_BLEND_WEIGHT;
  const kellyMultiplier = input.kellyMultiplier ?? DEFAULT_KELLY_MULTIPLIER;

  // elo → goals → poisson → markets
  const eloDiff = effectiveEloDiff(
    input.homeElo,
    input.awayElo,
    input.hostAdvApplies,
  );
  const lambdas = expectedGoals(eloDiff);
  const grid = scorelineGrid(lambdas.home, lambdas.away);
  const model1x2 = oneXTwo(grid);
  const modelTotals = overUnder25(grid);
  const modelBtts = btts(grid);
  const isKnockout = input.stage !== "group";
  const qualify = isKnockout ? qualifyProbabilities(grid, eloDiff) : undefined;

  const result: PredictionResult = {
    inputs: {
      homeElo: input.homeElo,
      awayElo: input.awayElo,
      homeLambda: lambdas.home,
      awayLambda: lambdas.away,
      rho: DIXON_COLES_RHO,
    },
    model: {
      pHome: model1x2.home,
      pDraw: model1x2.draw,
      pAway: model1x2.away,
      pOver25: modelTotals.over,
      pUnder25: modelTotals.under,
      pBttsYes: modelBtts.yes,
      pBttsNo: modelBtts.no,
      topScorelines: topScorelines(grid),
      ...(qualify
        ? { pQualifyHome: qualify.home, pQualifyAway: qualify.away }
        : {}),
    },
    valueBets: [],
  };

  // margin: market section requires a 1X2 line (median preferred).
  const h2hLine = input.oddsMedian?.h2h ?? input.oddsBest?.h2h;
  if (!h2hLine) return result;
  const market1x2 = shin([h2hLine.home, h2hLine.draw, h2hLine.away]);
  const totalsLine = input.oddsMedian?.totals25 ?? input.oddsBest?.totals25;
  const marketTotals = totalsLine
    ? shin([totalsLine.over, totalsLine.under])
    : undefined;
  result.market = {
    pHome: market1x2[0],
    pDraw: market1x2[1],
    pAway: market1x2[2],
    ...(marketTotals
      ? { pOver25: marketTotals[0], pUnder25: marketTotals[1] }
      : {}),
    method: "shin",
  };

  // blend
  const blend1x2 = blendProbabilities(
    market1x2,
    [model1x2.home, model1x2.draw, model1x2.away],
    blendWeight,
  );
  const blendTotals = marketTotals
    ? blendProbabilities(
        marketTotals,
        [modelTotals.over, modelTotals.under],
        blendWeight,
      )
    : undefined;
  result.blend = {
    weight: blendWeight,
    pHome: blend1x2[0],
    pDraw: blend1x2[1],
    pAway: blend1x2[2],
    ...(blendTotals
      ? { pOver25: blendTotals[0], pUnder25: blendTotals[1] }
      : {}),
  };

  // value: edges vs the BEST price per outcome.
  const pushValueBet = (
    market: ValueBet["market"],
    selection: ValueBet["selection"],
    pBlend: number,
    bestOdds: number,
    bookmaker: string,
  ): void => {
    const assessed = assessValue(pBlend, bestOdds, { kellyMultiplier });
    if (!assessed.isValue) return;
    result.valueBets.push({
      market,
      selection,
      pBlend,
      pImplied: assessed.pImplied,
      edge: assessed.edge,
      bestOdds,
      bookmaker,
      kellyFraction: assessed.kellyFraction,
    });
  };

  const bestH2h = input.oddsBest?.h2h;
  if (bestH2h) {
    pushValueBet(
      "h2h",
      "home",
      blend1x2[0],
      bestH2h.home,
      bestH2h.homeBookmaker,
    );
    pushValueBet(
      "h2h",
      "draw",
      blend1x2[1],
      bestH2h.draw,
      bestH2h.drawBookmaker,
    );
    pushValueBet(
      "h2h",
      "away",
      blend1x2[2],
      bestH2h.away,
      bestH2h.awayBookmaker,
    );
  }
  const bestTotals = input.oddsBest?.totals25;
  if (bestTotals && blendTotals) {
    pushValueBet(
      "totals25",
      "over",
      blendTotals[0],
      bestTotals.over,
      bestTotals.overBookmaker,
    );
    pushValueBet(
      "totals25",
      "under",
      blendTotals[1],
      bestTotals.under,
      bestTotals.underBookmaker,
    );
  }

  return result;
}
