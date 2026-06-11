"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

import { en } from "@/lib/strings/en";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Thin status bar shown under the header while the device is offline.
 * The Convex client reconnects on its own — this just tells the user why
 * the data stopped moving instead of letting the app feel frozen.
 */
export function OfflineIndicator() {
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false, // assume online during SSR
  );

  if (!offline) return null;

  return (
    <div
      role="status"
      className="bg-secondary text-secondary-foreground flex items-center justify-center gap-1.5 px-4 py-1 text-xs"
    >
      <WifiOff className="size-3.5" aria-hidden />
      {en.pwa.offline}
    </div>
  );
}
