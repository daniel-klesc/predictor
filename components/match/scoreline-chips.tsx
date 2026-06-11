import { formatPercent, formatScoreline } from "@/lib/format";

export interface ScorelineChip {
  home: number;
  away: number;
  p: number;
}

/** Top-scoreline chips from the Poisson grid, e.g. "2–0 11%". */
export function ScorelineChips({
  scorelines,
}: {
  scorelines: readonly ScorelineChip[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {scorelines.map((scoreline) => (
        <span
          key={`${scoreline.home}-${scoreline.away}`}
          className="rounded-tile font-display border border-border bg-card px-3 py-1.5 text-sm font-bold"
        >
          {formatScoreline(scoreline.home, scoreline.away)}{" "}
          <span className="font-body font-normal text-muted-foreground">
            {formatPercent(scoreline.p)}
          </span>
        </span>
      ))}
    </div>
  );
}
