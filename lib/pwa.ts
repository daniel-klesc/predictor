/**
 * Pure helpers for the PWA install prompt. The browser glue (event
 * listeners, localStorage access) lives in `components/pwa/`; everything
 * here is side-effect-free so it can be unit-tested in node.
 */

/** localStorage key holding the epoch-ms timestamp of the last dismissal. */
export const INSTALL_DISMISS_KEY = "predictor.installPromptDismissedAt";

/** localStorage key set once the app has been installed (hides forever). */
export const INSTALL_DONE_KEY = "predictor.installed";

/** After a dismissal, stay quiet for this many days. */
export const INSTALL_DISMISS_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True while a previous dismissal is still in its quiet window.
 * Unparseable / missing values count as "never dismissed".
 */
export function isInstallPromptSnoozed(
  dismissedAt: string | null,
  now: number,
): boolean {
  if (dismissedAt === null) return false;
  const ts = Number(dismissedAt);
  if (!Number.isFinite(ts)) return false;
  return now - ts < INSTALL_DISMISS_DAYS * DAY_MS;
}

/**
 * iOS / iPadOS detection from UA-ish inputs. iPadOS 13+ masquerades as
 * macOS, so a Mac platform with real touch points also counts.
 */
export function isIos(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /mac/i.test(platform) && maxTouchPoints > 1;
}

/** Which install affordance to show, if any. */
export type InstallPromptMode = "chrome" | "ios";

/**
 * Decide what to render. `hasBeforeInstallPrompt` means the browser fired
 * the event (Chromium); iOS never fires it, so Safari users get manual
 * add-to-home-screen instructions instead.
 */
export function resolveInstallPromptMode(options: {
  isStandalone: boolean;
  installed: boolean;
  snoozed: boolean;
  hasBeforeInstallPrompt: boolean;
  isIos: boolean;
}): InstallPromptMode | null {
  if (options.isStandalone || options.installed || options.snoozed) {
    return null;
  }
  if (options.hasBeforeInstallPrompt) return "chrome";
  if (options.isIos) return "ios";
  return null;
}
