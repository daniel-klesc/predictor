import { formatMoney, formatSignedPercent } from "@/lib/bet-display";
import type { RoiSummaryData } from "@/lib/roi";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 px-2">
      <div className="font-display text-xs font-semibold tracking-wider uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-display truncate text-[20px] font-extrabold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Bets-tab header card: staked / returned / yield across settled bets
 * (yield = profit / staked — an em dash until something is settled).
 */
export function RoiSummary({ roi }: { roi: RoiSummaryData }) {
  return (
    <div className="rounded-card grid grid-cols-3 divide-x divide-border border border-border bg-card py-3 text-center">
      <Stat
        label={en.bets.roi.staked}
        value={en.bets.amount(formatMoney(roi.staked))}
      />
      <Stat
        label={en.bets.roi.returned}
        value={en.bets.amount(formatMoney(roi.returned))}
      />
      <Stat
        label={en.bets.roi.yield}
        value={
          roi.yield === null ? en.common.emDash : formatSignedPercent(roi.yield)
        }
        valueClassName={
          roi.yield === null
            ? undefined
            : roi.yield >= 0
              ? "text-primary"
              : "text-destructive"
        }
      />
    </div>
  );
}
