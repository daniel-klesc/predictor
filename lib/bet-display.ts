/**
 * Display helpers for bet cards and the ROI summary. Pure — unit-tested.
 * Money is formatted as a bare grouped number ("2,400" / "437.5"); the
 * strings module wraps it with the currency word where needed.
 */
import { en } from "@/lib/strings/en";

/** 2400 → "2,400" · 437.5 → "437.5" (en-GB grouping, ≤2 decimals). */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(
    value,
  );
}

/** +440 → "+440" · −200 → "−200" (true minus sign) · 0 → "±0". */
export function formatSignedMoney(value: number): string {
  if (value === 0) return `±${formatMoney(0)}`;
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

/** 0.2125 → "+21%" · −0.08 → "−8%" (signed whole percent, for yield). */
export function formatSignedPercent(value: number): string {
  const sign = value < 0 ? "−" : "+";
  const scaled = Number((Math.abs(value) * 100).toPrecision(12));
  return `${sign}${scaled.toFixed(0)}%`;
}

/**
 * Selection label for a bet card, e.g. "Mexico win", "Draw", "Over 2.5",
 * "BTTS yes". Team-name selections fall back to TBD when the match/teams
 * are unknown; unknown markets fall back to the raw "market selection" pair
 * (e.g. outrights proposed from chat) so nothing ever crashes.
 */
export function betSelectionLabel(
  bet: { market: string; selection: string },
  names: { home: string | null; away: string | null },
): string {
  if (bet.market === "h2h") {
    if (bet.selection === "home")
      return en.match.win(names.home ?? en.placeholders.unknown);
    if (bet.selection === "away")
      return en.match.win(names.away ?? en.placeholders.unknown);
    if (bet.selection === "draw") return en.match.draw;
  }
  if (bet.market === "totals25") {
    if (bet.selection === "over") return en.match.over25Short;
    if (bet.selection === "under") return en.match.under25Short;
  }
  if (bet.market === "btts") {
    if (bet.selection === "yes") return en.match.bttsYes;
    if (bet.selection === "no") return en.bets.bttsNo;
  }
  return `${bet.market} ${bet.selection}`;
}
