"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import { MatchCard } from "@/components/match/match-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dayRangeInZone } from "@/lib/day";
import { formatDayHeading } from "@/lib/format";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";
import { valueTier } from "@/lib/value-tier";

type EnrichedMatches = FunctionReturnType<typeof api.matches.listByDayWithData>;

/** Flagged value bets across a day's matches (drives the header pill). */
function countValueBets(matches: EnrichedMatches | undefined): number {
  let count = 0;
  for (const match of matches ?? []) {
    if (match.status !== "scheduled") continue;
    for (const bet of match.prediction?.valueBets ?? []) {
      if (valueTier(bet.edge)) count += 1;
    }
  }
  return count;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display px-1 pt-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
      {children}
    </h2>
  );
}

function CardSkeletons({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="rounded-card h-44" />
      ))}
    </>
  );
}

/**
 * Today — the zero-tap value overview. Today's matches (Europe/Prague day,
 * queried by UTC range) with full MatchCards, a tomorrow preview strip, and
 * a jump to the next matchday when today is empty.
 */
export function TodayScreen() {
  const [now] = useState(() => Date.now());
  const todayRange = useMemo(() => dayRangeInZone(now), [now]);
  const tomorrowRange = useMemo(
    () => dayRangeInZone(todayRange.end),
    [todayRange.end],
  );

  const today = useQuery(api.matches.listByDayWithData, {
    start: todayRange.start,
    end: todayRange.end,
  });
  const tomorrow = useQuery(api.matches.listByDayWithData, {
    start: tomorrowRange.start,
    end: tomorrowRange.end,
  });

  const todayIsEmpty = today !== undefined && today.length === 0;
  const nextKickoff = useQuery(
    api.matches.nextKickoffAfter,
    todayIsEmpty ? { after: todayRange.end } : "skip",
  );
  const nextRange = nextKickoff != null ? dayRangeInZone(nextKickoff) : null;
  const nextMatchday = useQuery(
    api.matches.listByDayWithData,
    nextRange ? { start: nextRange.start, end: nextRange.end } : "skip",
  );

  const valueCount = countValueBets(today);

  // Manual refresh (authed action from the odds issue), rate-limited
  // server-side; the returned summary shows transiently under the header.
  const manualRefresh = useAction(api.sync.refresh.manualRefresh);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  useEffect(() => {
    if (refreshNote === null) return;
    const timer = setTimeout(() => setRefreshNote(null), 8000);
    return () => clearTimeout(timer);
  }, [refreshNote]);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setRefreshNote(await manualRefresh());
    } catch (error) {
      setRefreshNote(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{formatDayHeading(now)}</p>
        <span className="flex items-center gap-1.5">
          {valueCount > 0 && (
            <span className="border-value-strong/40 bg-value-strong/10 text-value-strong font-display rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase">
              {en.screens.today.valuePill(valueCount)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={en.screens.today.refresh}
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </span>
      </div>
      {refreshNote && (
        <p className="px-1 text-xs text-muted-foreground">{refreshNote}</p>
      )}

      {today === undefined ? (
        <CardSkeletons />
      ) : (
        <>
          {today.map((match) => (
            <MatchCard key={match._id} match={match} />
          ))}
          {todayIsEmpty && (
            <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              {en.screens.today.empty}
            </p>
          )}
        </>
      )}

      {!todayIsEmpty && tomorrow !== undefined && tomorrow.length > 0 && (
        <>
          <SectionHeading>
            {en.screens.today.tomorrow(tomorrow.length)}
          </SectionHeading>
          {tomorrow.map((match) => (
            <MatchCard key={match._id} match={match} variant="compact" dim />
          ))}
        </>
      )}

      {todayIsEmpty && nextRange && (
        <>
          <SectionHeading>
            {en.screens.today.nextMatchday(formatDayHeading(nextRange.start))}
          </SectionHeading>
          {nextMatchday === undefined ? (
            <CardSkeletons />
          ) : (
            nextMatchday.map((match) => (
              <MatchCard key={match._id} match={match} />
            ))
          )}
        </>
      )}
    </div>
  );
}
