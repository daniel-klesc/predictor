/** Shared display formatters. Keep pure — they are unit-tested. */
import { DISPLAY_TIME_ZONE } from "@/lib/day";
import { en } from "@/lib/strings/en";

/** 0.575 → "58%" (probability → whole percent by default). */
export function formatPercent(value: number, fractionDigits = 0): string {
  // toPrecision(12) strips float noise (0.575 * 100 === 57.49999999999999)
  // so half-way values round the way humans expect.
  const scaled = Number((value * 100).toPrecision(12));
  return `${scaled.toFixed(fractionDigits)}%`;
}

/** 2.05 → "2.05" — decimal odds always show two decimals. */
export function formatDecimalOdds(odds: number): string {
  return odds.toFixed(2);
}

/** 1234.5 → "€1,234.50" (defaults to EUR, en-GB grouping). */
export function formatCurrency(
  value: number,
  currency = "EUR",
  locale = "en-GB",
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    value,
  );
}

/** Kickoff timestamp → "Sat 13 Jun, 18:00" (24h clock). */
export function formatKickoff(
  date: Date | number,
  timeZone = "UTC",
  locale = "en-GB",
): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
  // en-GB renders "Sat 13 Jun, 18:00" — normalize any locale comma variants.
  return formatted.replace(" at ", ", ");
}

/** Kickoff timestamp → "21:00" in the display timezone (Europe/Prague). */
export function formatKickoffTime(
  date: Date | number,
  timeZone: string = DISPLAY_TIME_ZONE,
  locale = "en-GB",
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
}

/** Timestamp → "Thu 11 Jun" in the display timezone (Europe/Prague). */
export function formatDayHeading(
  date: Date | number,
  timeZone: string = DISPLAY_TIME_ZONE,
  locale = "en-GB",
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

/** Timestamp → "28 Jun" in the display timezone (bracket tiles). */
export function formatShortDate(
  date: Date | number,
  timeZone: string = DISPLAY_TIME_ZONE,
  locale = "en-GB",
): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

/** 0.072 → "+7.2%" · −0.034 → "−3.4%" (signed percent, one decimal). */
export function formatEdge(edge: number): string {
  const sign = edge < 0 ? "−" : "+";
  const scaled = Number((Math.abs(edge) * 100).toPrecision(12));
  return `${sign}${scaled.toFixed(1)}%`;
}

/** (2, 0) → "2–0" (en dash, never a hyphen). */
export function formatScoreline(home: number, away: number): string {
  return `${home}–${away}`;
}

/**
 * FIFA trigram → flag emoji via an explicit code map (FIFA trigrams are not
 * ISO 3166 alpha-3, so the mapping cannot be derived). UK home nations use
 * Unicode tag-sequence flags. Unknown codes fall back to the white flag.
 */
const FIFA_TO_ISO2: Record<string, string> = {
  ALG: "DZ",
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BIH: "BA",
  BRA: "BR",
  CAN: "CA",
  CIV: "CI",
  COD: "CD",
  COL: "CO",
  CPV: "CV",
  CRO: "HR",
  CUW: "CW",
  CZE: "CZ",
  ECU: "EC",
  EGY: "EG",
  ESP: "ES",
  FRA: "FR",
  GER: "DE",
  GHA: "GH",
  HAI: "HT",
  IRN: "IR",
  IRQ: "IQ",
  JOR: "JO",
  JPN: "JP",
  KOR: "KR",
  KSA: "SA",
  MAR: "MA",
  MEX: "MX",
  NED: "NL",
  NOR: "NO",
  NZL: "NZ",
  PAN: "PA",
  PAR: "PY",
  POR: "PT",
  QAT: "QA",
  RSA: "ZA",
  SEN: "SN",
  SUI: "CH",
  SWE: "SE",
  TUN: "TN",
  TUR: "TR",
  URU: "UY",
  USA: "US",
  UZB: "UZ",
};

/** UK home nations (and any other non-ISO flags) as ready-made emoji. */
const FLAG_OVERRIDES: Record<string, string> = {
  ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  SCO: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  WAL: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
};

/** Neutral fallback for unknown codes / unresolved knockout slots. */
export const FLAG_FALLBACK = "\u{1F3F3}\u{FE0F}";

/** "MEX" → 🇲🇽 (regional-indicator pair from the ISO map). */
export function flagEmoji(fifaCode: string | null | undefined): string {
  if (!fifaCode) return FLAG_FALLBACK;
  const code = fifaCode.toUpperCase();
  const override = FLAG_OVERRIDES[code];
  if (override) return override;
  const iso = FIFA_TO_ISO2[code];
  if (!iso) return FLAG_FALLBACK;
  return [...iso]
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join("");
}

/**
 * Knockout slot placeholder → readable label:
 * "W74" → "Winner match 74" · "L101" → "Loser match 101" ·
 * "1A" → "Group A winner" · "2B" → "Group B runner-up" ·
 * "3A/B/C/D/F" → "3rd of A/B/C/D/F". Unknown shapes pass through.
 */
export function formatPlaceholder(slot: string | null | undefined): string {
  if (!slot) return en.placeholders.unknown;
  const trimmed = slot.trim();
  const winner = /^W(\d+)$/i.exec(trimmed);
  if (winner) return en.placeholders.winner(winner[1]);
  const loser = /^L(\d+)$/i.exec(trimmed);
  if (loser) return en.placeholders.loser(loser[1]);
  const seeded = /^([12])([A-L])$/i.exec(trimmed);
  if (seeded) {
    const group = seeded[2].toUpperCase();
    return seeded[1] === "1"
      ? en.placeholders.groupWinner(group)
      : en.placeholders.groupRunnerUp(group);
  }
  const third = /^3([A-L](?:\/[A-L])*)$/i.exec(trimmed);
  if (third) return en.placeholders.bestThird(third[1].toUpperCase());
  return trimmed;
}
