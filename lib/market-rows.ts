/**
 * Row models for the match-detail MarketsTable, built from a prediction doc
 * and the latest best odds. Pure and unit-tested.
 *
 * Tier semantics: a row is highlighted (and gets a "+ Slip" button) ONLY
 * when the model flagged it in `valueBets` — those entries passed the full
 * value gate (edge, odds bounds). Edges shown on non-flagged rows are
 * informational (blend probability vs best price) and never tinted.
 */
import { en } from "@/lib/strings/en";
import { valueTier, type ValueTier } from "@/lib/value-tier";

export interface MarketRowsPrediction {
  model: {
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25: number;
    pUnder25: number;
    pBttsYes: number;
  };
  blend?: {
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25?: number;
    pUnder25?: number;
  } | null;
  valueBets: Array<{
    market: string;
    selection?: string;
    edge: number;
    bestOdds: number;
    bookmaker: string;
  }>;
}

export interface MarketRowsBestOdds {
  h2h?: {
    home: number;
    homeBookmaker: string;
    draw: number;
    drawBookmaker: string;
    away: number;
    awayBookmaker: string;
  };
  totals25?: {
    over: number;
    overBookmaker: string;
    under: number;
    underBookmaker: string;
  };
}

export interface MarketRow {
  /** Stable key, e.g. "h2h:home". */
  key: string;
  /** Display label, e.g. "Mexico win". */
  label: string;
  market: "h2h" | "totals25" | "btts";
  selection: "home" | "draw" | "away" | "over" | "under" | "yes";
  /** Pure model probability. */
  modelP: number;
  /** Best available decimal odds (null while unpriced). */
  odds: number | null;
  bookmaker: string | null;
  /** Blend-vs-best-price edge (null without odds or blend). */
  edge: number | null;
  /** Model-flagged value bet — drives highlight + "+ Slip". */
  isValue: boolean;
  /** Tier from THE single map; non-null only on flagged rows. */
  tier: ValueTier | null;
}

interface RowSpec {
  market: MarketRow["market"];
  selection: MarketRow["selection"];
  label: string;
  modelP: number;
  blendP: number | null;
  odds: number | null;
  bookmaker: string | null;
}

/**
 * The six markets shown on match detail: 1X2, over/under 2.5, BTTS yes.
 * BTTS is never priced (the odds feed covers h2h + totals only).
 */
export function marketRows(
  prediction: MarketRowsPrediction,
  oddsBest: MarketRowsBestOdds | null | undefined,
  names: { home: string; away: string },
): MarketRow[] {
  const { model, blend, valueBets } = prediction;
  const h2h = oddsBest?.h2h;
  const totals = oddsBest?.totals25;

  const specs: RowSpec[] = [
    {
      market: "h2h",
      selection: "home",
      label: en.match.win(names.home),
      modelP: model.pHome,
      blendP: blend?.pHome ?? null,
      odds: h2h?.home ?? null,
      bookmaker: h2h?.homeBookmaker ?? null,
    },
    {
      market: "h2h",
      selection: "draw",
      label: en.match.draw,
      modelP: model.pDraw,
      blendP: blend?.pDraw ?? null,
      odds: h2h?.draw ?? null,
      bookmaker: h2h?.drawBookmaker ?? null,
    },
    {
      market: "h2h",
      selection: "away",
      label: en.match.win(names.away),
      modelP: model.pAway,
      blendP: blend?.pAway ?? null,
      odds: h2h?.away ?? null,
      bookmaker: h2h?.awayBookmaker ?? null,
    },
    {
      market: "totals25",
      selection: "over",
      label: en.match.over25,
      modelP: model.pOver25,
      blendP: blend?.pOver25 ?? null,
      odds: totals?.over ?? null,
      bookmaker: totals?.overBookmaker ?? null,
    },
    {
      market: "totals25",
      selection: "under",
      label: en.match.under25,
      modelP: model.pUnder25,
      blendP: blend?.pUnder25 ?? null,
      odds: totals?.under ?? null,
      bookmaker: totals?.underBookmaker ?? null,
    },
    {
      market: "btts",
      selection: "yes",
      label: en.match.bttsYes,
      modelP: model.pBttsYes,
      blendP: null,
      odds: null,
      bookmaker: null,
    },
  ];

  return specs.map((spec) => {
    const flagged = valueBets.find(
      (bet) =>
        bet.market === spec.market && (bet.selection ?? "") === spec.selection,
    );
    const odds = flagged?.bestOdds ?? spec.odds;
    const edge =
      flagged?.edge ??
      (spec.blendP !== null && odds !== null && odds > 0
        ? spec.blendP - 1 / odds
        : null);
    return {
      key: `${spec.market}:${spec.selection}`,
      label: spec.label,
      market: spec.market,
      selection: spec.selection,
      modelP: spec.modelP,
      odds,
      bookmaker: flagged?.bookmaker ?? spec.bookmaker,
      edge,
      isValue: flagged !== undefined,
      tier: flagged ? valueTier(flagged.edge) : null,
    };
  });
}

/**
 * Short label for a flagged selection, e.g. "MEX win", "Draw", "Over 2.5" —
 * used by the MatchCard ValueBadge.
 */
export function valueBetShortLabel(
  bet: { market: string; selection?: string },
  codes: { home: string | null; away: string | null },
): string {
  switch (bet.selection) {
    case "home":
      return en.match.win(codes.home ?? en.placeholders.unknown);
    case "away":
      return en.match.win(codes.away ?? en.placeholders.unknown);
    case "draw":
      return en.match.draw;
    case "over":
      return en.match.over25Short;
    case "under":
      return en.match.under25Short;
    default:
      return bet.market;
  }
}
