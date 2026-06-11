/**
 * Pure bet-settlement decision logic — no Convex imports (vitest-tested).
 *
 * Settlement follows standard bookmaker conventions: **1X2, Over/Under 2.5
 * and BTTS all settle on the 90-minute result** (regular time plus stoppage).
 * Knockout extra time and penalty shootouts never count, so a knockout 1X2
 * bet CAN settle as a draw even though the match produced a winner.
 *
 * The schema stores `home`/`away` as the final score INCLUDING extra time
 * (football-data `fullTime` semantics) and keeps the 90-minute score in
 * `regulationHome`/`regulationAway` whenever the match went beyond regular
 * time — so the settlement score is `regulation*` when present, else
 * `home`/`away` (which IS the 90-minute score for matches decided in 90).
 */

/** The score fields settlement reads (subset of the schema score object). */
export interface SettlementScore {
  /** Final score incl. extra time, excl. penalty shootouts. */
  home: number;
  away: number;
  /** 90-minute score, present only when the match went to extra time. */
  regulationHome?: number;
  regulationAway?: number;
}

export type BetOutcome = "won" | "lost";

export interface SettledBetPatch {
  status: BetOutcome | "void";
  /** won → stake × odds · lost → 0 · void → stake returned. */
  payout: number;
}

/** The 90-minute score: regulation when extra time happened, else full. */
export function ninetyMinuteScore(score: SettlementScore): {
  home: number;
  away: number;
} {
  if (score.regulationHome != null && score.regulationAway != null) {
    return { home: score.regulationHome, away: score.regulationAway };
  }
  return { home: score.home, away: score.away };
}

/** Round money to 2 decimals (kills float dust in stake × odds). */
export function roundPayout(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Decide a bet from the 90-minute score. Markets/selections mirror the
 * `lib/market-rows` vocabulary: `h2h` (home/draw/away) · `totals25`
 * (over/under — the 2.5 half-line can never push) · `btts` (yes/no).
 * Unknown markets/selections return null — the caller leaves those bets
 * untouched for manual settlement (e.g. outrights) instead of guessing.
 */
export function decideBet(
  score: SettlementScore,
  market: string,
  selection: string,
): BetOutcome | null {
  const { home, away } = ninetyMinuteScore(score);
  switch (market) {
    case "h2h": {
      const result = home > away ? "home" : home < away ? "away" : "draw";
      if (
        selection !== "home" &&
        selection !== "draw" &&
        selection !== "away"
      ) {
        return null;
      }
      return selection === result ? "won" : "lost";
    }
    case "totals25": {
      const total = home + away;
      if (selection === "over") return total > 2.5 ? "won" : "lost";
      if (selection === "under") return total < 2.5 ? "won" : "lost";
      return null;
    }
    case "btts": {
      const both = home > 0 && away > 0;
      if (selection === "yes") return both ? "won" : "lost";
      if (selection === "no") return both ? "lost" : "won";
      return null;
    }
    default:
      return null;
  }
}

/**
 * Full settlement decision for one placed bet against its match state:
 * postponed/cancelled → void (stake back) · finished with a score → decide
 * won/lost and compute the payout · anything else (still scheduled/live,
 * finished without a score yet, unknown market) → null, meaning "leave the
 * bet placed". Pure — `settleForMatch` in convex/bets.ts applies the patch.
 */
export function settleBet(
  bet: { market: string; selection: string; odds: number; stake?: number },
  match: { status: string; score?: SettlementScore | null },
): SettledBetPatch | null {
  const stake = bet.stake ?? 0;
  if (match.status === "postponed" || match.status === "cancelled") {
    return { status: "void", payout: stake };
  }
  if (match.status !== "finished" || !match.score) return null;
  const outcome = decideBet(match.score, bet.market, bet.selection);
  if (outcome === null) return null;
  return {
    status: outcome,
    payout: outcome === "won" ? roundPayout(stake * bet.odds) : 0,
  };
}
