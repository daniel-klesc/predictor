"use client";

import { CalendarDays, MessageCircle, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/today", label: en.nav.today, icon: CalendarDays },
  { href: "/matches", label: en.nav.matches, icon: Trophy },
  { href: "/chat", label: en.nav.chat, icon: MessageCircle },
  { href: "/bets", label: en.nav.bets, icon: Wallet },
] as const;

/** 4-tab bottom nav — active tab gets the volt top indicator. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={en.nav.ariaLabel}
      className="border-border bg-card/95 pb-safe border-t backdrop-blur"
    >
      <ul className="flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-xs font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-6 top-0 h-0.5 rounded-full",
                    active ? "bg-primary" : "bg-transparent",
                  )}
                />
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
