"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { stageLabel } from "@/components/match/match-card";
import { Skeleton } from "@/components/ui/skeleton";
import { bracketSlotCode, buildBracket } from "@/lib/bracket";
import {
  FLAG_FALLBACK,
  flagEmoji,
  formatKickoffTime,
  formatShortDate,
} from "@/lib/format";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

type BracketMatch = FunctionReturnType<
  typeof api.matches.listAllWithTeams
>[number];

/**
 * Column sizing: every round shares one fixed height so `justify-around`
 * lines each match up between its two feeders in the previous column
 * (16 → 8 → 4 → 2 → 1 tiles). ~1.5 columns fit the 480px shell.
 */
const COLUMN_WIDTH = "w-[270px]";
const COLUMN_HEIGHT = "h-[960px]";

/**
 * Bracket view: horizontally scrollable knockout tree (R32 → Final, snap
 * per round) plus the third-place play-off pinned under the final. Slots
 * show placeholder codes ("1A", "W74") until the sync resolves real teams;
 * finished tiles bold the advancing side.
 */
export function BracketView() {
  const matches = useQuery(api.matches.listAllWithTeams, {});

  const bracket = useMemo(
    () => (matches ? buildBracket(matches) : null),
    [matches],
  );

  if (bracket === null) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="rounded-card h-80 w-[270px] shrink-0" />
        ))}
      </div>
    );
  }

  if (bracket.rounds.length === 0) {
    return (
      <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {en.bracket.empty}
      </p>
    );
  }

  return (
    <div
      aria-label={en.bracket.ariaLabel}
      className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2"
    >
      {bracket.rounds.map((round) => (
        <section
          key={round.stage}
          className={cn("shrink-0 snap-start scroll-ml-4", COLUMN_WIDTH)}
        >
          <h3 className="font-display px-1 pb-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {stageLabel(round.stage)}
          </h3>
          <div className={cn("flex flex-col", COLUMN_HEIGHT)}>
            <div className="flex flex-1 flex-col justify-around">
              {round.matches.map((match) => (
                <BracketTile key={match._id} match={match} />
              ))}
            </div>
            {round.stage === "final" && bracket.thirdPlace && (
              <div className="pb-1">
                <h4 className="font-display px-1 pb-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {en.stages.third}
                </h4>
                <BracketTile match={bracket.thirdPlace} />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function BracketTile({ match }: { match: BracketMatch }) {
  const homeCode = bracketSlotCode(
    match.home,
    match.homePlaceholder,
    en.placeholders.unknown,
  );
  const awayCode = bracketSlotCode(
    match.away,
    match.awayPlaceholder,
    en.placeholders.unknown,
  );
  const finished = match.status === "finished";
  const homeWins =
    finished &&
    match.winnerTeamId !== undefined &&
    match.winnerTeamId === match.homeTeamId;
  const awayWins =
    finished &&
    match.winnerTeamId !== undefined &&
    match.winnerTeamId === match.awayTeamId;
  const showScore = match.score && match.status !== "scheduled";

  return (
    <Link
      href={`/matches/${match._id}`}
      aria-label={en.bracket.tileAria(homeCode, awayCode)}
      className={cn(
        "rounded-tile flex items-center gap-2 border bg-card px-2.5 py-1.5",
        match.status === "live" ? "border-edge-positive/50" : "border-border",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <SideRow
          team={match.home}
          code={homeCode}
          score={showScore ? match.score?.home : undefined}
          penalties={showScore ? match.score?.penaltiesHome : undefined}
          wins={homeWins}
          dimmed={finished && !homeWins}
        />
        <SideRow
          team={match.away}
          code={awayCode}
          score={showScore ? match.score?.away : undefined}
          penalties={showScore ? match.score?.penaltiesAway : undefined}
          wins={awayWins}
          dimmed={finished && !awayWins}
        />
      </span>
      {!showScore && (
        <span className="flex shrink-0 flex-col items-end text-xs leading-tight text-muted-foreground">
          {match.status === "live" ? (
            <span className="font-display text-edge-positive font-bold tracking-wider uppercase">
              {en.match.live}
            </span>
          ) : (
            <>
              <span>{formatShortDate(match.kickoffAt)}</span>
              <span className="font-display font-bold text-foreground/80">
                {formatKickoffTime(match.kickoffAt)}
              </span>
            </>
          )}
        </span>
      )}
    </Link>
  );
}

function SideRow({
  team,
  code,
  score,
  penalties,
  wins,
  dimmed,
}: {
  team: { code: string } | null;
  code: string;
  score: number | undefined;
  penalties: number | undefined;
  wins: boolean;
  dimmed: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span aria-hidden className="shrink-0 text-sm leading-none">
        {team ? flagEmoji(team.code) : FLAG_FALLBACK}
      </span>
      <span
        className={cn(
          "font-display min-w-0 truncate text-sm font-bold uppercase",
          wins && "text-primary",
          dimmed && "text-muted-foreground",
          !team && "font-semibold text-muted-foreground",
        )}
      >
        {code}
      </span>
      {score !== undefined && (
        <span
          className={cn(
            "font-display ml-auto shrink-0 text-sm font-bold tabular-nums",
            wins ? "text-primary" : "text-muted-foreground",
          )}
        >
          {score}
          {penalties !== undefined && (
            <span className="text-xs font-semibold"> ({penalties})</span>
          )}
        </span>
      )}
    </span>
  );
}
