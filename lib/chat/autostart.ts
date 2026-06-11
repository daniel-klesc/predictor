/**
 * One-shot autostart handoff between the thread list and the thread view
 * (chat UI issue #8). When a suggestion chip creates a thread AND persists
 * the first user message before navigating, the thread view must POST
 * /api/chat exactly once on arrival. sessionStorage (vs a query param)
 * survives the router.push without polluting the URL or re-triggering on
 * reload — a reload intentionally lands on the retry affordance instead.
 */
const AUTOSTART_PREFIX = "predictor:chat:autostart:";

/** Mark `threadId` to auto-stream on the next thread-view mount. */
export function markAutostart(threadId: string): void {
  try {
    sessionStorage.setItem(`${AUTOSTART_PREFIX}${threadId}`, "1");
  } catch {
    // Storage unavailable (private mode) — the retry affordance covers it.
  }
}

/** Read the flag WITHOUT consuming it (render-safe suppression checks). */
export function peekAutostart(threadId: string): boolean {
  try {
    return sessionStorage.getItem(`${AUTOSTART_PREFIX}${threadId}`) === "1";
  } catch {
    return false;
  }
}

/** Consume the one-shot autostart flag for `threadId`. */
export function takeAutostart(threadId: string): boolean {
  try {
    const key = `${AUTOSTART_PREFIX}${threadId}`;
    const value = sessionStorage.getItem(key);
    if (value !== null) sessionStorage.removeItem(key);
    return value === "1";
  } catch {
    return false;
  }
}
