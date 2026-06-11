"use client";

import { Button } from "@/components/ui/button";
import {
  tierRowClasses,
  tierTextClasses,
} from "@/components/match/value-badge";
import { formatDecimalOdds, formatEdge, formatPercent } from "@/lib/format";
import type { MarketRow } from "@/lib/market-rows";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

const GRID =
  "grid grid-cols-[minmax(0,1fr)_3rem_3.25rem_3.5rem_3.75rem] items-center gap-x-1.5 px-3";

/**
 * Markets table: market | model | best odds | edge | + Slip. Value rows are
 * tinted by tier (single map) and get the one-tap propose button; unpriced
 * cells render em dashes.
 */
export function MarketsTable({
  rows,
  proposedKeys,
  pendingKey,
  onPropose,
}: {
  rows: MarketRow[];
  proposedKeys: ReadonlySet<string>;
  pendingKey: string | null;
  onPropose: (row: MarketRow) => void;
}) {
  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div
        className={cn(
          GRID,
          "font-display border-b border-border bg-muted/60 py-2 text-xs font-bold tracking-wider uppercase text-muted-foreground",
        )}
      >
        <span>{en.markets.header.market}</span>
        <span className="text-right">{en.markets.header.model}</span>
        <span className="text-right">{en.markets.header.odds}</span>
        <span className="text-right">{en.markets.header.edge}</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div
          key={row.key}
          className={cn(
            GRID,
            "py-2.5",
            index < rows.length - 1 && "border-b border-border",
            row.tier && tierRowClasses[row.tier],
          )}
        >
          <span
            className={cn(
              "truncate text-sm",
              row.isValue ? "font-semibold" : "text-foreground/90",
            )}
          >
            {row.label}
          </span>
          <Cell value={formatPercent(row.modelP)} emphasized={row.isValue} />
          <Cell
            value={row.odds !== null ? formatDecimalOdds(row.odds) : null}
            emphasized={row.isValue}
          />
          <Cell
            value={row.edge !== null ? formatEdge(row.edge) : null}
            emphasized={row.isValue}
            className={row.tier ? tierTextClasses[row.tier] : undefined}
          />
          <span className="text-right">
            {row.tier && row.odds !== null && (
              <Button
                size="xs"
                variant={row.tier === "slight" ? "outline" : "default"}
                className={cn(
                  "font-display rounded-full font-bold tracking-wide uppercase",
                  row.tier === "slight" &&
                    "border-value-mild/50 bg-value-mild/10 text-value-mild hover:bg-value-mild/20 hover:text-value-mild",
                )}
                disabled={proposedKeys.has(row.key) || pendingKey !== null}
                aria-label={en.markets.addToSlipAria(row.label)}
                onClick={() => onPropose(row)}
              >
                {proposedKeys.has(row.key)
                  ? en.markets.added
                  : en.markets.addToSlip}
              </Button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function Cell({
  value,
  emphasized,
  className,
}: {
  value: string | null;
  emphasized: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display text-right text-[15px] font-bold tabular-nums",
        !emphasized && "text-muted-foreground",
        className,
      )}
    >
      {value ?? en.common.emDash}
    </span>
  );
}
