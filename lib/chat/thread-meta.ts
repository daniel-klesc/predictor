/**
 * Thread-list display helpers (chat UI issue #8). Pure and unit-tested.
 */
import { dayKeyInZone } from "@/lib/day";
import { formatDayHeading, formatKickoffTime } from "@/lib/format";

/**
 * Display title for a thread row. The backend titles threads from the match
 * pair or the first message; a brand-new thread carries the "" sentinel
 * until then — show the fallback ("New chat").
 */
export function threadDisplayTitle(title: string, fallback: string): string {
  const trimmed = title.trim();
  return trimmed === "" ? fallback : trimmed;
}

/**
 * Activity timestamp for a thread row: "14:32" when the thread was active
 * today (Europe/Prague), otherwise "Wed 10 Jun".
 */
export function formatThreadTime(lastMessageAt: number, now: number): string {
  return dayKeyInZone(lastMessageAt) === dayKeyInZone(now)
    ? formatKickoffTime(lastMessageAt)
    : formatDayHeading(lastMessageAt);
}
