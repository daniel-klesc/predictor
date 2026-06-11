/**
 * Timezone-aware day utilities. Convex stores kickoffs as UTC ms; the UI
 * displays and buckets days in Europe/Prague. All helpers are pure and
 * DST-correct (computed via Intl, never by slicing ISO strings).
 */

/** The display timezone for the whole app. */
export const DISPLAY_TIME_ZONE = "Europe/Prague";

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** en-CA renders dates as YYYY-MM-DD — a ready-made sortable day key. */
function keyFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = keyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    keyFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Local-calendar day key ("2026-06-11") of a UTC instant. */
export function dayKeyInZone(
  ms: number,
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  return keyFormatter(timeZone).format(ms);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    offsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** UTC offset of `timeZone` at the given instant, in milliseconds. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  // Some ICU builds render midnight as "24" with hour12: false.
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return wallClockAsUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant at which the local day `key` ("2026-06-11") starts. */
export function startOfDayKey(
  key: string,
  timeZone: string = DISPLAY_TIME_ZONE,
): number {
  const [year, month, day] = key.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  // Two passes pin the offset that is actually in force at local midnight
  // (handles days around DST transitions).
  const start = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(start, timeZone);
}

/** Day key of the calendar day after `key` (pure UTC date math). */
export function nextDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

export interface DayRange {
  /** Inclusive UTC ms start of the local day. */
  start: number;
  /** Exclusive UTC ms end (start of the next local day). */
  end: number;
}

/** UTC range [start, end) of the local day containing `ms`. */
export function dayRangeInZone(
  ms: number,
  timeZone: string = DISPLAY_TIME_ZONE,
): DayRange {
  const key = dayKeyInZone(ms, timeZone);
  return {
    start: startOfDayKey(key, timeZone),
    end: startOfDayKey(nextDayKey(key), timeZone),
  };
}

export interface DayGroup<T> {
  /** Local day key, e.g. "2026-06-11". */
  key: string;
  /** UTC ms at which this local day starts (for headings). */
  start: number;
  items: T[];
}

/** Bucket items into local-calendar days, ordered chronologically. */
export function groupByDay<T>(
  items: readonly T[],
  getMs: (item: T) => number,
  timeZone: string = DISPLAY_TIME_ZONE,
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  const sorted = [...items].sort((a, b) => getMs(a) - getMs(b));
  for (const item of sorted) {
    const key = dayKeyInZone(getMs(item), timeZone);
    let group = groups.get(key);
    if (!group) {
      group = { key, start: startOfDayKey(key, timeZone), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
