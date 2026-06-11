"use client";

import { Download, Share, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  INSTALL_DISMISS_KEY,
  INSTALL_DONE_KEY,
  type InstallPromptMode,
  isInstallPromptSnoozed,
  isIos,
  resolveInstallPromptMode,
} from "@/lib/pwa";
import { en } from "@/lib/strings/en";

/** Chromium-only event; not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag when launched from the home screen.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode etc. — the prompt just shows again next session.
  }
}

/**
 * Module-level store consumed via `useSyncExternalStore`. Living at module
 * scope lets us capture `beforeinstallprompt` immediately on load — Chrome
 * often fires it before React hydrates and subscribes.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let mode: InstallPromptMode | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function compute(): void {
  initialized = true;
  mode = resolveInstallPromptMode({
    isStandalone: isStandaloneDisplay(),
    installed: readFlag(INSTALL_DONE_KEY) === "true",
    snoozed: isInstallPromptSnoozed(readFlag(INSTALL_DISMISS_KEY), Date.now()),
    hasBeforeInstallPrompt: deferredPrompt !== null,
    isIos: isIos(
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints,
    ),
  });
}

function emit(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    compute();
    emit();
  });
  window.addEventListener("appinstalled", () => {
    writeFlag(INSTALL_DONE_KEY, "true");
    deferredPrompt = null;
    compute();
    emit();
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): InstallPromptMode | null {
  if (!initialized) compute();
  return mode;
}

function dismiss(): void {
  writeFlag(INSTALL_DISMISS_KEY, String(Date.now()));
  compute();
  emit();
}

async function install(): Promise<void> {
  const event = deferredPrompt;
  if (!event) return;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    writeFlag(INSTALL_DONE_KEY, "true");
  } else {
    // Declined the native dialog — same 14-day snooze as a dismissal.
    writeFlag(INSTALL_DISMISS_KEY, String(Date.now()));
  }
  compute();
  emit();
}

/**
 * Subtle install affordance shown on the Today tab only. Chromium gets the
 * native `beforeinstallprompt` flow; iOS Safari (which never fires it) gets
 * add-to-home-screen instructions. Dismissal is persisted in localStorage
 * and snoozes the prompt for 14 days; running standalone or having
 * installed hides it for good.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const currentMode = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null, // never rendered during SSR
  );

  if (currentMode === null || !pathname.startsWith("/today")) return null;

  return (
    <div
      role="region"
      aria-label={en.pwa.install.title}
      className="border-border bg-card rounded-tile mx-4 mb-2 flex items-start gap-3 border p-3"
    >
      <div className="bg-primary/15 text-primary rounded-tile flex size-9 shrink-0 items-center justify-center">
        {currentMode === "ios" ? (
          <Share className="size-4" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{en.pwa.install.title}</p>
        <p className="text-muted-foreground text-xs">
          {currentMode === "ios"
            ? en.pwa.install.iosBody
            : en.pwa.install.chromeBody}
        </p>
        {currentMode === "chrome" && (
          <Button size="xs" className="mt-2" onClick={() => void install()}>
            <Download data-icon="inline-start" />
            {en.pwa.install.installAction}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground -mt-1 -mr-1 shrink-0"
        aria-label={en.pwa.install.dismissAriaLabel}
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
