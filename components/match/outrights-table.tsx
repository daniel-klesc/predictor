"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import {
  tierRowClasses,
  tierTextClasses,
} from "@/components/match/value-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  flagEmoji,
  formatDecimalOdds,
  formatEdge,
  formatKickoffTime,
  formatPercent,
} from "@/lib/format";
import {
  outrightRows,
  type OutrightRow,
  type OutrightSort,
  progressionSteps,
  sortOutrightRows,
} from "@/lib/outright-rows";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

const OUTRIGHTS_GRID =
  "grid grid-cols-[minmax(0,1fr)_4rem_3.25rem_3.5rem] items-center gap-x-1.5 px-3";

const SORTS: OutrightSort[] = ["champion", "edge"];

function SortChip({
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
 * Tournament view (Matches tab): Monte-Carlo sim vs outright odds. Each row
 * compares sim pChampion with the best outright price (sim-flagged value
 * rows tinted by tier); tapping a row expands the per-round progression
 * bars plus the bookmaker/implied-probability detail. Sortable by champion
 * probability (default) or edge once prices exist.
 */
export function OutrightsTable() {
  const sim = useQuery(api.sims.latest, {});
  const outright = useQuery(api.odds.latestOutright, {});
  const teams = useQuery(api.teams.list, {});
  const [sort, setSort] = useState<OutrightSort>("champion");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!sim || !teams) return null;
    return sortOutrightRows(
      outrightRows(
        sim.perTeam,
        sim.valueOutrights,
        outright?.prices ?? [],
        teams,
      ),
      sort,
    );
  }, [sim, teams, outright, sort]);

  if (sim === undefined || teams === undefined || outright === undefined) {
    return <Skeleton className="rounded-card h-96" />;
  }
  if (sim === null || rows === null) {
    return (
      <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {en.tournament.empty}
      </p>
    );
  }

  const hasOdds = rows.some((row) => row.odds !== null);

  return (
    <>
      <p className="px-1 text-xs text-muted-foreground">
        {en.tournament.meta(
          sim.runs.toLocaleString("en-GB"),
          formatKickoffTime(sim.computedAt),
        )}
        {" · "}
        {hasOdds ? en.tournament.oddsNote : en.tournament.noOddsNote}
      </p>
      {hasOdds ? (
        <div
          role="group"
          aria-label={en.outrights.sortAriaLabel}
          className="flex gap-2"
        >
          {SORTS.map((candidate) => (
            <SortChip
              key={candidate}
              active={sort === candidate}
              onClick={() => setSort(candidate)}
            >
              {en.outrights.sort[candidate]}
            </SortChip>
          ))}
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground/80">
          {en.outrights.noOddsHint}
        </p>
      )}
      <div className="rounded-card overflow-hidden border border-border bg-card">
        <div
          className={cn(
            OUTRIGHTS_GRID,
            "font-display border-b border-border bg-muted/60 py-2 text-xs font-bold tracking-wider uppercase text-muted-foreground",
          )}
        >
          <span>{en.tournament.header.team}</span>
          <span className="text-right">{en.tournament.header.champion}</span>
          <span className="text-right">{en.tournament.header.odds}</span>
          <span className="text-right">{en.tournament.header.edge}</span>
        </div>
        {rows.map((row, index) => (
          <OutrightTeamRow
            key={row.teamCode}
            row={row}
            last={index === rows.length - 1}
            expanded={expandedCode === row.teamCode}
            onToggle={() =>
              setExpandedCode((current) =>
                current === row.teamCode ? null : row.teamCode,
              )
            }
          />
        ))}
      </div>
    </>
  );
}

function OutrightTeamRow({
  row,
  last,
  expanded,
  onToggle,
}: {
  row: OutrightRow;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailId = `outright-detail-${row.teamCode}`;
  return (
    <div
      className={cn(
        !last && "border-b border-border",
        row.tier && tierRowClasses[row.tier],
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
        className={cn(
          OUTRIGHTS_GRID,
          "w-full py-2.5 text-left transition-colors hover:bg-muted/40",
        )}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-1 text-sm",
            row.tier ? "font-semibold" : "text-foreground/90",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "shrink-0 text-xs text-muted-foreground/70 transition-transform",
              expanded && "rotate-90",
            )}
          >
            ▸
          </span>
          <span className="min-w-0 truncate">
            <span aria-hidden>{flagEmoji(row.teamCode)}</span> {row.name}
          </span>
        </span>
        <span
          className={cn(
            "font-display text-right text-[15px] font-bold tabular-nums",
            !row.tier && "text-muted-foreground",
          )}
        >
          {formatPercent(row.pChampion, 1)}
        </span>
        <span className="font-display text-right text-sm tabular-nums text-muted-foreground">
          {row.odds !== null ? formatDecimalOdds(row.odds) : en.common.emDash}
        </span>
        <span
          className={cn(
            "font-display text-right text-[15px] font-bold tabular-nums",
            row.tier ? tierTextClasses[row.tier] : "text-muted-foreground",
          )}
        >
          {row.edge !== null ? formatEdge(row.edge) : en.common.emDash}
        </span>
      </button>
      {expanded && (
        <div id={detailId} className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-xs text-muted-foreground">
            {row.odds !== null &&
            row.bookmaker !== null &&
            row.pImplied !== null
              ? en.outrights.detail.oddsLine(
                  formatDecimalOdds(row.odds),
                  row.bookmaker,
                  formatPercent(row.pImplied, 1),
                )
              : en.outrights.detail.noPrice}
          </p>
          <div className="flex flex-col gap-1.5">
            {progressionSteps(row).map((step) => (
              <div key={step.key} className="flex items-center gap-2">
                <span className="font-display w-16 shrink-0 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  {step.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      step.key === "champion" ? "bg-primary" : "bg-secondary",
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(1, step.p)) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-display w-12 shrink-0 text-right text-xs font-bold tabular-nums">
                  {formatPercent(step.p, 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
