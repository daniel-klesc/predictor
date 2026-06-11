"use client";

import { usePathname } from "next/navigation";

import { SettingsSheet } from "@/components/layout/settings-sheet";
import { en } from "@/lib/strings/en";

function screenTitle(pathname: string): string {
  if (pathname.startsWith("/today")) return en.screens.today.title;
  if (pathname.startsWith("/matches/")) return en.screens.matchDetail.title;
  if (pathname.startsWith("/matches")) return en.screens.matches.title;
  if (pathname.startsWith("/chat/")) return en.screens.chatThread.title;
  if (pathname.startsWith("/chat")) return en.screens.chat.title;
  if (pathname.startsWith("/bets")) return en.screens.bets.title;
  return en.app.name;
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="pt-safe px-4">
      <div className="flex items-center justify-between gap-2 pt-3 pb-2">
        <h1 className="font-display text-2xl font-semibold tracking-wide uppercase">
          {screenTitle(pathname)}
        </h1>
        <SettingsSheet />
      </div>
    </header>
  );
}
