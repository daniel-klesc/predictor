import { formatPercent } from "@/lib/format";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

/** Home/draw/away probability trio (sums ≈ 1). */
export interface ProbabilityTrio {
  home: number;
  draw: number;
  away: number;
}

type Outcome = keyof ProbabilityTrio;

/** Model's most likely outcome — both rows annotate this selection. */
function leadOutcome(model: ProbabilityTrio): Outcome {
  if (model.home >= model.draw && model.home >= model.away) return "home";
  return model.draw >= model.away ? "draw" : "away";
}

function Segment({ className, p }: { className: string; p: number }) {
  return (
    <div
      className={cn("h-full", className)}
      style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }}
    />
  );
}

function Row({
  label,
  trio,
  lead,
  variant,
  accent,
}: {
  label: string;
  trio: ProbabilityTrio | null;
  lead: Outcome;
  variant: "model" | "market";
  accent: boolean;
}) {
  const muted = variant === "market";
  return (
    <div className="flex items-center gap-2">
      <span className="font-display w-12 shrink-0 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted",
          muted && "opacity-70",
        )}
      >
        {trio && (
          <>
            <Segment
              className={muted ? "bg-primary/60" : "bg-primary"}
              p={trio.home}
            />
            <Segment className="bg-muted-foreground" p={trio.draw} />
            <Segment
              className={muted ? "bg-secondary/60" : "bg-secondary"}
              p={trio.away}
            />
          </>
        )}
      </div>
      <span
        className={cn(
          "font-display w-9 shrink-0 text-right text-xs font-bold",
          muted || !trio
            ? "text-muted-foreground"
            : accent
              ? "text-primary"
              : "text-foreground",
        )}
      >
        {trio ? formatPercent(trio[lead]) : en.common.emDash}
      </span>
    </div>
  );
}

/**
 * Dual stacked H/D/A bar: model row above market row (volt / gray / teal
 * segments). Without odds the market row renders as a muted empty track —
 * same height, so nothing shifts when prices arrive.
 */
export function ProbabilityBar({
  model,
  market,
  accent = false,
}: {
  model: ProbabilityTrio;
  market?: ProbabilityTrio | null;
  accent?: boolean;
}) {
  const lead = leadOutcome(model);
  return (
    <div className="space-y-1">
      <Row
        label={en.match.modelRow}
        trio={model}
        lead={lead}
        variant="model"
        accent={accent}
      />
      <Row
        label={en.match.marketRow}
        trio={market ?? null}
        lead={lead}
        variant="market"
        accent={accent}
      />
    </div>
  );
}
