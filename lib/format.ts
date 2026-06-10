/** Shared display formatters. Keep pure — they are unit-tested. */

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
