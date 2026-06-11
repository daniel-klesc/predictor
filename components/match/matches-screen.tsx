"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import { MatchCard, type MatchStage } from "@/components/match/match-card";
import {
  tierRowClasses,
  tierTextClasses,
} from "@/components/match/value-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { dayKeyInZone, groupByDay } from "@/lib/day";
import {
  flagEmoji,
  formatDayHeading,
  formatDecimalOdds,
  formatEdge,
  formatKickoffTime,
  formatPercent,
} from "@/lib/format";
import { groupStandings } from "@/lib/standings";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";
import { valueTier } from "@/lib/value-tier";

type View = "schedule" | "tournament" | "groups";
type StageFilter = "all" | "group" | "r32" | "r16" | "qf" | "sf" | "final";

const VIEWS: View[] = ["schedule", "tournament", "groups"];
const STAGE_FILTERS: StageFilter[] = [
  "all",
  "group",
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
];

/** Stages each filter chip admits ("final" includes the 3rd-place match). */
const FILTER_STAGES: Record<Exclude<StageFilter, "all">, MatchStage[]> = {
  group: ["group"],
  r32: ["r32"],
  r16: ["r16"],
  qf: ["qf"],
  sf: ["sf"],
  final: ["third", "final"],
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "font-display shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wider uppercase transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Matches tab: Schedule (day-grouped compact cards + stage filter chips),
 * Tournament (Monte-Carlo sim vs outright odds), Groups (standings).
 */
export function MatchesScreen() {
  const [view, setView] = useState<View>("schedule");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={en.screens.matches.viewsAriaLabel}
        className="flex gap-2"
      >
        {VIEWS.map((candidate) => (
          <Chip
            key={candidate}
            active={view === candidate}
            onClick={() => setView(candidate)}
          >
            {en.screens.matches.views[candidate]}
          </Chip>
        ))}
      </div>
      {view === "schedule" && <ScheduleView />}
      {view === "tournament" && <TournamentView />}
      {view === "groups" && <GroupsView />}
    </div>
  );
}

function ScheduleView() {
  const matches = useQuery(api.matches.listAllWithTeams, {});
  const [filter, setFilter] = useState<StageFilter>("all");
  const [todayKey] = useState(() => dayKeyInZone(Date.now()));

  const days = useMemo(() => {
    if (!matches) return null;
    const filtered =
      filter === "all"
        ? matches
        : matches.filter((match) =>
            FILTER_STAGES[filter].includes(match.stage),
          );
    return groupByDay(filtered, (match) => match.kickoffAt);
  }, [matches, filter]);

  return (
    <>
      <div
        role="group"
        aria-label={en.screens.matches.stageFilterAriaLabel}
        className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {STAGE_FILTERS.map((candidate) => (
          <Chip
            key={candidate}
            active={filter === candidate}
            onClick={() => setFilter(candidate)}
          >
            {en.screens.matches.stageFilters[candidate]}
          </Chip>
        ))}
      </div>

      {days === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="rounded-tile h-11" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {en.screens.matches.emptyFilter}
        </p>
      ) : (
        days.map((day) => (
          <section key={day.key} className="flex flex-col gap-2">
            <h2 className="font-display px-1 pt-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {day.key === todayKey
                ? en.screens.matches.todayHeading(formatDayHeading(day.start))
                : formatDayHeading(day.start)}
            </h2>
            {day.items.map((match) => (
              <MatchCard key={match._id} match={match} variant="compact" />
            ))}
          </section>
        ))
      )}
    </>
  );
}

const TOURNAMENT_GRID =
  "grid grid-cols-[minmax(0,1fr)_4rem_3.25rem_3.5rem] items-center gap-x-1.5 px-3";

function TournamentView() {
  const sim = useQuery(api.sims.latest, {});
  const outright = useQuery(api.odds.latestOutright, {});
  const teams = useQuery(api.teams.list, {});

  if (sim === undefined || teams === undefined || outright === undefined) {
    return <Skeleton className="rounded-card h-96" />;
  }
  if (sim === null) {
    return (
      <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {en.tournament.empty}
      </p>
    );
  }

  const nameByCode = new Map(teams.map((team) => [team.code, team.name]));
  const priceByCode = new Map(
    (outright?.prices ?? []).map((price) => [price.teamCode, price]),
  );
  const valueByCode = new Map(
    sim.valueOutrights.map((value) => [value.teamCode, value]),
  );
  const rows = [...sim.perTeam].sort((a, b) => b.pChampion - a.pChampion);

  return (
    <>
      <p className="px-1 text-xs text-muted-foreground">
        {en.tournament.meta(
          sim.runs.toLocaleString("en-GB"),
          formatKickoffTime(sim.computedAt),
        )}
        {" · "}
        {outright ? en.tournament.oddsNote : en.tournament.noOddsNote}
      </p>
      <div className="rounded-card overflow-hidden border border-border bg-card">
        <div
          className={cn(
            TOURNAMENT_GRID,
            "font-display border-b border-border bg-muted/60 py-2 text-xs font-bold tracking-wider uppercase text-muted-foreground",
          )}
        >
          <span>{en.tournament.header.team}</span>
          <span className="text-right">{en.tournament.header.champion}</span>
          <span className="text-right">{en.tournament.header.odds}</span>
          <span className="text-right">{en.tournament.header.edge}</span>
        </div>
        {rows.map((row, index) => {
          const price = priceByCode.get(row.teamCode);
          const flagged = valueByCode.get(row.teamCode);
          const edge =
            flagged?.edge ??
            (price ? row.pChampion - 1 / price.bestOdds : null);
          const tier = flagged ? valueTier(flagged.edge) : null;
          return (
            <div
              key={row.teamCode}
              className={cn(
                TOURNAMENT_GRID,
                "py-2.5",
                index < rows.length - 1 && "border-b border-border",
                tier && tierRowClasses[tier],
              )}
            >
              <span
                className={cn(
                  "truncate text-sm",
                  tier ? "font-semibold" : "text-foreground/90",
                )}
              >
                <span aria-hidden>{flagEmoji(row.teamCode)}</span>{" "}
                {nameByCode.get(row.teamCode) ?? row.teamCode}
              </span>
              <span
                className={cn(
                  "font-display text-right text-[15px] font-bold tabular-nums",
                  !tier && "text-muted-foreground",
                )}
              >
                {formatPercent(row.pChampion, 1)}
              </span>
              <span className="font-display text-right text-sm tabular-nums text-muted-foreground">
                {price ? formatDecimalOdds(price.bestOdds) : en.common.emDash}
              </span>
              <span
                className={cn(
                  "font-display text-right text-[15px] font-bold tabular-nums",
                  tier ? tierTextClasses[tier] : "text-muted-foreground",
                )}
              >
                {edge !== null ? formatEdge(edge) : en.common.emDash}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const GROUPS_GRID =
  "grid grid-cols-[minmax(0,1fr)_2rem_2.5rem_2.5rem] items-center gap-x-1.5 px-3";

function GroupsView() {
  const teams = useQuery(api.teams.list, {});
  const matches = useQuery(api.matches.listAllWithTeams, {});

  if (teams === undefined || matches === undefined) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="rounded-card h-40" />
        ))}
      </div>
    );
  }

  const standings = groupStandings(
    teams,
    matches.map((match) => ({
      stage: match.stage,
      status: match.status,
      homeCode: match.home?.code ?? null,
      awayCode: match.away?.code ?? null,
      score: match.score
        ? { home: match.score.home, away: match.score.away }
        : null,
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      {standings.map(({ group, rows }) => (
        <div
          key={group}
          className="rounded-card overflow-hidden border border-border bg-card"
        >
          <div
            className={cn(
              GROUPS_GRID,
              "font-display border-b border-border bg-muted/60 py-2 text-xs font-bold tracking-wider uppercase text-muted-foreground",
            )}
          >
            <span>{en.groups.title(group)}</span>
            <span className="text-right">{en.groups.header.played}</span>
            <span className="text-right">{en.groups.header.goalDiff}</span>
            <span className="text-right">{en.groups.header.points}</span>
          </div>
          {rows.map((row, index) => (
            <div
              key={row.code}
              className={cn(
                GROUPS_GRID,
                "py-2",
                index < rows.length - 1 && "border-b border-border",
              )}
            >
              <span className="truncate text-sm">
                <span aria-hidden>{flagEmoji(row.code)}</span> {row.name}
              </span>
              <span className="text-right text-sm tabular-nums text-muted-foreground">
                {row.played}
              </span>
              <span className="text-right text-sm tabular-nums text-muted-foreground">
                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
              </span>
              <span className="font-display text-right text-[15px] font-bold tabular-nums">
                {row.points}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
