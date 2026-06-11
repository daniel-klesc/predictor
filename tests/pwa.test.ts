import { describe, expect, it } from "vitest";

import {
  INSTALL_DISMISS_DAYS,
  isInstallPromptSnoozed,
  isIos,
  resolveInstallPromptMode,
} from "@/lib/pwa";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000;

describe("isInstallPromptSnoozed", () => {
  it("never dismissed → not snoozed", () => {
    expect(isInstallPromptSnoozed(null, NOW)).toBe(false);
  });

  it("dismissed just now → snoozed", () => {
    expect(isInstallPromptSnoozed(String(NOW), NOW)).toBe(true);
  });

  it("dismissed inside the window → snoozed", () => {
    const dismissed = NOW - (INSTALL_DISMISS_DAYS - 1) * DAY_MS;
    expect(isInstallPromptSnoozed(String(dismissed), NOW)).toBe(true);
  });

  it("dismissed exactly at the window boundary → no longer snoozed", () => {
    const dismissed = NOW - INSTALL_DISMISS_DAYS * DAY_MS;
    expect(isInstallPromptSnoozed(String(dismissed), NOW)).toBe(false);
  });

  it("dismissed past the window → not snoozed", () => {
    const dismissed = NOW - (INSTALL_DISMISS_DAYS + 1) * DAY_MS;
    expect(isInstallPromptSnoozed(String(dismissed), NOW)).toBe(false);
  });

  it("garbage localStorage value → treated as never dismissed", () => {
    expect(isInstallPromptSnoozed("not-a-number", NOW)).toBe(false);
  });
});

describe("isIos", () => {
  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const IPAD_UA =
    "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
  const MAC_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
  const WINDOWS_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  it("detects iPhone and iPad UAs", () => {
    expect(isIos(IPHONE_UA)).toBe(true);
    expect(isIos(IPAD_UA)).toBe(true);
  });

  it("detects iPadOS 13+ masquerading as macOS via touch points", () => {
    expect(isIos(MAC_UA, "MacIntel", 5)).toBe(true);
  });

  it("desktop macOS without touch is not iOS", () => {
    expect(isIos(MAC_UA, "MacIntel", 0)).toBe(false);
  });

  it("Android and Windows are not iOS", () => {
    expect(isIos(ANDROID_UA, "Linux armv8l", 5)).toBe(false);
    expect(isIos(WINDOWS_UA, "Win32", 0)).toBe(false);
  });
});

describe("resolveInstallPromptMode", () => {
  const base = {
    isStandalone: false,
    installed: false,
    snoozed: false,
    hasBeforeInstallPrompt: false,
    isIos: false,
  };

  it("Chromium with beforeinstallprompt → chrome mode", () => {
    expect(
      resolveInstallPromptMode({ ...base, hasBeforeInstallPrompt: true }),
    ).toBe("chrome");
  });

  it("iOS Safari (no event) → ios instructions", () => {
    expect(resolveInstallPromptMode({ ...base, isIos: true })).toBe("ios");
  });

  it("unsupported browser (no event, not iOS) → hidden", () => {
    expect(resolveInstallPromptMode(base)).toBeNull();
  });

  it("running standalone → hidden even when installable", () => {
    expect(
      resolveInstallPromptMode({
        ...base,
        isStandalone: true,
        hasBeforeInstallPrompt: true,
        isIos: true,
      }),
    ).toBeNull();
  });

  it("already installed → hidden", () => {
    expect(
      resolveInstallPromptMode({
        ...base,
        installed: true,
        hasBeforeInstallPrompt: true,
      }),
    ).toBeNull();
  });

  it("snoozed by a recent dismissal → hidden on both platforms", () => {
    expect(
      resolveInstallPromptMode({
        ...base,
        snoozed: true,
        hasBeforeInstallPrompt: true,
      }),
    ).toBeNull();
    expect(
      resolveInstallPromptMode({ ...base, snoozed: true, isIos: true }),
    ).toBeNull();
  });
});
