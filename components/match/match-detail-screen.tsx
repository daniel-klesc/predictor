"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { stageLabel } from "@/components/match/match-card";
import { MarketsTable } from "@/components/match/markets-table";
import { ScorelineChips } from "@/components/match/scoreline-chips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FLAG_FALLBACK,
  flagEmoji,
  formatKickoff,
  formatPlaceholder,
} from "@/lib/format";
import { marketRows, type MarketRow } from "@/lib/market-rows";
import { en } from "@/lib/strings/en";
import { DISPLAY_TIME_ZONE } from "@/lib/day";

type MatchDetail = NonNullable<
  FunctionReturnType<typeof api.matches.getWithData>
>;

/** Elo bonus the model grants host nations (mirrors convex/lib/model/elo). */
const HOST_ELO_BONUS = 100;

function TeamHeader({
  team,
  placeholder,
}: {
  team: MatchDetail["home"];
  placeholder?: string;
}) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <div aria-hidden className="text-[34px] leading-none">
        {team ? flagEmoji(team.code) : FLAG_FALLBACK}
      </div>
      <div className="font-display mt-1 truncate text-[19px] font-bold uppercase">
        {team?.name ?? formatPlaceholder(placeholder)}
      </div>
      <div className="text-xs text-muted-foreground">
        {team
          ? `${en.screens.matchDetail.elo(team.elo)}${team.isHost ? ` · ${en.screens.matchDetail.host}` : ""}`
          : en.screens.matchDetail.eloUnknown}
      </div>
    </div>
  );
}

/**
 * Match detail: back header, team header with Elo + context strip, the
 * markets table with one-tap "+ Slip", top scorelines, and the chat CTA.
 */
export function MatchDetailScreen({ matchId }: { matchId: string }) {
  const router = useRouter();
  const match = useQuery(api.matches.getWithData, { id: matchId });

  const propose = useMutation(api.bets.propose);
  const [proposedKeys, setProposedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // "Discuss in chat" (chat UI issue #8): reuse the most recent thread for
  // this match or create one carrying matchId — one tap lands in the thread.
  const convex = useConvex();
  const createThread = useMutation(api.chat.createThread);
  const [chatPending, setChatPending] = useState(false);

  if (match === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-2/3 rounded-lg" />
        <Skeleton className="rounded-card h-28" />
        <Skeleton className="rounded-card h-56" />
        <Skeleton className="rounded-card h-16" />
      </div>
    );
  }

  if (match === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {en.screens.matchDetail.empty}
        </p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ChevronLeft data-icon="inline-start" />
          {en.screens.matchDetail.back}
        </Button>
      </div>
    );
  }

  const onDiscussInChat = async () => {
    if (chatPending) return;
    setChatPending(true);
    try {
      const threads = await convex.query(api.chat.listThreads, {});
      const existing = threads.find((thread) => thread.matchId === match._id);
      const threadId =
        existing?._id ?? (await createThread({ matchId: match._id }));
      router.push(`/chat/${threadId}`);
    } finally {
      setChatPending(false);
    }
  };

  const onPropose = async (row: MarketRow) => {
    if (row.odds === null) return;
    setPendingKey(row.key);
    try {
      await propose({
        matchId: match._id,
        market: row.market,
        selection: row.selection,
        odds: row.odds,
        bookmaker: row.bookmaker ?? undefined,
      });
      setProposedKeys((prev) => new Set(prev).add(row.key));
    } finally {
      setPendingKey(null);
    }
  };

  const meta = [
    stageLabel(match.stage, match.group),
    en.screens.matchDetail.matchNumber(match.matchNumber),
    formatKickoff(match.kickoffAt, DISPLAY_TIME_ZONE),
    match.venue ?? match.city,
  ]
    .filter(Boolean)
    .join(" · ");

  const context = [
    [match.venue, match.city].filter(Boolean).join(", "),
    match.home?.isHost
      ? en.screens.matchDetail.hostAdvantage(HOST_ELO_BONUS)
      : null,
  ].filter(Boolean);

  const rows = match.prediction
    ? marketRows(match.prediction, match.odds?.best, {
        home: match.home?.name ?? formatPlaceholder(match.homePlaceholder),
        away: match.away?.name ?? formatPlaceholder(match.awayPlaceholder),
      })
    : null;
  const hasOdds = Boolean(match.odds?.best?.h2h);

  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="-mx-1 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={en.screens.matchDetail.back}
          onClick={() => router.back()}
        >
          <ChevronLeft />
        </Button>
        <p className="font-display truncate text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          {meta}
        </p>
      </div>

      <div className="flex items-center justify-center gap-4 px-2 py-2">
        <TeamHeader team={match.home} placeholder={match.homePlaceholder} />
        <div className="font-display shrink-0 text-[15px] font-bold text-muted-foreground">
          {en.match.vs}
        </div>
        <TeamHeader team={match.away} placeholder={match.awayPlaceholder} />
      </div>

      {context.length > 0 && (
        <div className="rounded-tile border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {context.join(" · ")}
        </div>
      )}

      {rows ? (
        <>
          <MarketsTable
            rows={rows}
            proposedKeys={proposedKeys}
            pendingKey={pendingKey}
            onPropose={(row) => void onPropose(row)}
          />
          {!hasOdds && (
            <p className="px-1 text-xs text-muted-foreground">
              {en.screens.matchDetail.noOddsNote}
            </p>
          )}
        </>
      ) : (
        <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {en.screens.matchDetail.noPrediction}
        </p>
      )}

      {match.prediction && (
        <>
          <h2 className="font-display px-1 pt-1 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {en.screens.matchDetail.topScorelines}
          </h2>
          <ScorelineChips scorelines={match.prediction.model.topScorelines} />
        </>
      )}

      <Button
        variant="outline"
        size="lg"
        className="rounded-card border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-display mt-2 w-full py-5 text-[15px] font-bold tracking-wider uppercase"
        disabled={chatPending}
        onClick={() => void onDiscussInChat()}
      >
        <MessageCircle data-icon="inline-start" />
        {en.screens.matchDetail.discussInChat}
      </Button>
    </div>
  );
}
