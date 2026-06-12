"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPercent } from "@/lib/format";
import {
  impliedProbability,
  type SparkleSample,
  sparklinePath,
  sparklineTrend,
} from "@/lib/sparkline";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

const WIDTH = 96;
const HEIGHT = 24;

const OUTCOMES = ["home", "draw", "away"] as const;
type Outcome = (typeof OUTCOMES)[number];

/** Trend → text token. Shortening (probability up) flashes volt. */
const trendTextClasses = {
  up: "text-value-strong",
  down: "text-value-mild",
  flat: "text-muted-foreground",
} as const;

/** Trend → SVG stroke token (same mapping, stroke side). */
const trendStrokeClasses = {
  up: "stroke-value-strong",
  down: "stroke-value-mild",
  flat: "stroke-muted-foreground",
} as const;

/**
 * Odds-movement sparklines: one row per 1X2 outcome plotting the implied
 * probability of the consensus (median) price across snapshots, with an
 * opening → current delta chip. Renders nothing until at least two
 * snapshots exist, so unpriced matches stay clean.
 */
export function OddsSparkline({
  matchId,
  homeLabel,
  awayLabel,
}: {
  matchId: Id<"matches">;
  homeLabel?: string;
  awayLabel?: string;
}) {
  const history = useQuery(api.odds.historyForMatch, { matchId });

  if (!history || history.length < 2) return null;

  const labels: Record<Outcome, string> = {
    home: homeLabel ?? en.oddsHistory.outcomes.home,
    draw: en.oddsHistory.outcomes.draw,
    away: awayLabel ?? en.oddsHistory.outcomes.away,
  };

  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <div className="font-display flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2 text-xs font-bold tracking-wider uppercase text-muted-foreground">
        <span>{en.oddsHistory.heading}</span>
        <span>{en.oddsHistory.snapshots(history.length)}</span>
      </div>
      {OUTCOMES.map((outcome, index) => {
        const samples: SparkleSample[] = history.map((point) => ({
          t: point.fetchedAt,
          v: impliedProbability(point.h2h[outcome]),
        }));
        const opening = samples[0].v;
        const current = samples[samples.length - 1].v;
        const trend = sparklineTrend(opening, current);
        return (
          <div
            key={outcome}
            aria-label={en.oddsHistory.rowAria(labels[outcome])}
            className={cn(
              "flex items-center gap-3 px-3 py-2",
              index < OUTCOMES.length - 1 && "border-b border-border",
            )}
          >
            <span className="font-display min-w-0 flex-1 truncate text-sm font-bold uppercase">
              {labels[outcome]}
            </span>
            <svg
              aria-hidden
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-6 w-24 shrink-0"
            >
              <path
                d={sparklinePath(samples, WIDTH, HEIGHT)}
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={trendStrokeClasses[trend]}
              />
            </svg>
            <span
              className={cn(
                "font-display shrink-0 text-right text-sm font-bold tabular-nums",
                trendTextClasses[trend],
              )}
            >
              {en.oddsHistory.delta(
                formatPercent(opening),
                formatPercent(current),
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
