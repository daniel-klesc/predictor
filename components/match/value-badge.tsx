import { formatEdge } from "@/lib/format";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";
import { valueTier, type ValueTier } from "@/lib/value-tier";

/**
 * Style maps keyed by THE single tier map (lib/value-tier). Strong = volt
 * fill · solid = volt outline · slight = teal outline. Reused by the badge,
 * MatchCard borders, MarketsTable rows, and compact edge text.
 */
export const tierBadgeClasses: Record<ValueTier, string> = {
  strong: "border-transparent bg-value-strong text-primary-foreground",
  solid: "border-value-strong/60 bg-value-strong/10 text-value-strong",
  slight: "border-value-mild/60 bg-value-mild/10 text-value-mild",
};

export const tierTextClasses: Record<ValueTier, string> = {
  strong: "text-value-strong",
  solid: "text-value-strong",
  slight: "text-value-mild",
};

export const tierCardBorderClasses: Record<ValueTier, string> = {
  strong: "border-value-strong/40",
  solid: "border-value-strong/25",
  slight: "border-value-mild/30",
};

export const tierRowClasses: Record<ValueTier, string> = {
  strong: "bg-value-strong/10",
  solid: "bg-value-strong/5",
  slight: "bg-value-mild/5",
};

/**
 * Value pill, e.g. "▲ Value · MEX win +7.2%". Renders nothing below the
 * slight threshold. `label` names the flagged selection ("MEX win").
 */
export function ValueBadge({
  edge,
  label,
  className,
}: {
  edge: number;
  label?: string;
  className?: string;
}) {
  const tier = valueTier(edge);
  if (!tier) return null;
  return (
    <span
      className={cn(
        "font-display inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap uppercase",
        tierBadgeClasses[tier],
        className,
      )}
    >
      <span aria-hidden>▲</span>
      {en.match.valueWord}
      {label ? ` · ${label}` : null} {formatEdge(edge)}
    </span>
  );
}
