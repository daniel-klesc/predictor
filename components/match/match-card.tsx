import Link from "next/link";

import {
  ProbabilityBar,
  type ProbabilityTrio,
} from "@/components/match/probability-bar";
import {
  tierCardBorderClasses,
  tierTextClasses,
  ValueBadge,
} from "@/components/match/value-badge";
import {
  FLAG_FALLBACK,
  flagEmoji,
  formatDecimalOdds,
  formatEdge,
  formatKickoffTime,
  formatPlaceholder,
  formatScoreline,
} from "@/lib/format";
import { valueBetShortLabel } from "@/lib/market-rows";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";
import { topValueBet, valueTier } from "@/lib/value-tier";

export type MatchStage =
  | "group"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "third"
  | "final";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export interface MatchCardTeam {
  code: string;
  name: string;
}

export interface MatchCardValueBet {
  market: string;
  selection?: string;
  edge: number;
  bestOdds: number;
}

/**
 * Structural data contract — both enriched match queries
 * (`matches.listByDayWithData`, `matches.listAllWithTeams`) satisfy it.
 */
export interface MatchCardData {
  _id: string;
  stage: MatchStage;
  group?: string;
  venue?: string;
  city?: string;
  kickoffAt: number;
  status: MatchStatus;
  score?: { home: number; away: number } | null;
  home: MatchCardTeam | null;
  away: MatchCardTeam | null;
  homePlaceholder?: string;
  awayPlaceholder?: string;
  /** Present on the full-data query; compact lists may omit it. */
  prediction?: {
    model: ProbabilityTrioDoc;
    market?: ProbabilityTrioDoc | null;
    valueBets: MatchCardValueBet[];
  } | null;
  odds?: {
    best: { h2h?: { home: number; draw: number; away: number } } | null;
  } | null;
  /** Pre-computed top value bet (compact list query). */
  topValue?: MatchCardValueBet | null;
}

interface ProbabilityTrioDoc {
  pHome: number;
  pDraw: number;
  pAway: number;
}

function toTrio(
  doc: ProbabilityTrioDoc | null | undefined,
): ProbabilityTrio | null {
  if (!doc) return null;
  return { home: doc.pHome, draw: doc.pDraw, away: doc.pAway };
}

/** "Group A" / "Round of 32" / … */
export function stageLabel(stage: MatchStage, group?: string): string {
  if (stage === "group") {
    return group ? `${en.stages.group} ${group}` : en.stages.group;
  }
  return en.stages[stage];
}

function sideName(team: MatchCardTeam | null, placeholder?: string): string {
  return team?.name ?? formatPlaceholder(placeholder);
}

/** Compact rows shorten unresolved slots to the raw code ("W74", "1A"). */
function sideNameCompact(
  team: MatchCardTeam | null,
  placeholder?: string,
): string {
  return team?.name ?? placeholder ?? en.placeholders.unknown;
}

function sideFlag(team: MatchCardTeam | null): string {
  return team ? flagEmoji(team.code) : FLAG_FALLBACK;
}

/** Right side of the meta row: kickoff time or match-state label. */
function MetaState({ match }: { match: MatchCardData }) {
  switch (match.status) {
    case "live":
      return (
        <span className="font-display text-edge-positive inline-flex items-center gap-1.5 text-sm font-bold tracking-wider uppercase">
          <span
            aria-hidden
            className="bg-edge-positive size-1.5 animate-pulse rounded-full"
          />
          {en.match.live}
        </span>
      );
    case "finished":
      return (
        <span className="font-display text-sm font-bold text-muted-foreground">
          {en.match.fullTime}
        </span>
      );
    case "postponed":
    case "cancelled":
      return (
        <span className="font-display text-destructive text-sm font-bold tracking-wider uppercase">
          {match.status === "postponed"
            ? en.match.postponed
            : en.match.cancelled}
        </span>
      );
    default:
      return (
        <span className="font-display text-sm font-bold">
          {formatKickoffTime(match.kickoffAt)}
        </span>
      );
  }
}

/**
 * THE MatchCard — one component for every list (Today, tomorrow preview,
 * Schedule). Status (scheduled/live/finished) and value tier drive a single
 * style map; `variant="compact"` collapses to a one-line row.
 */
export function MatchCard({
  match,
  variant = "full",
  dim = false,
}: {
  match: MatchCardData;
  variant?: "full" | "compact";
  dim?: boolean;
}) {
  const topValue = match.topValue ?? topValueBet(match.prediction?.valueBets);
  const tier = match.status === "scheduled" ? valueTier(topValue?.edge) : null;
  const borderClass =
    match.status === "live"
      ? "border-edge-positive/50"
      : tier
        ? tierCardBorderClasses[tier]
        : "border-border";
  const codes = {
    home: match.home?.code ?? null,
    away: match.away?.code ?? null,
  };
  const score =
    match.score && match.status !== "scheduled"
      ? formatScoreline(match.score.home, match.score.away)
      : null;

  if (variant === "compact") {
    return (
      <Link
        href={`/matches/${match._id}`}
        className={cn(
          "rounded-tile flex items-center justify-between gap-3 border bg-card px-3 py-2.5",
          borderClass,
          dim && "opacity-70",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="text-lg leading-none">
            {sideFlag(match.home)}
          </span>
          <span className="font-display truncate text-[15px] font-bold uppercase">
            {sideNameCompact(match.home, match.homePlaceholder)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground lowercase">
            {en.match.vs.toLowerCase()}
          </span>
          <span className="font-display truncate text-[15px] font-bold uppercase">
            {sideNameCompact(match.away, match.awayPlaceholder)}
          </span>
          <span aria-hidden className="text-lg leading-none">
            {sideFlag(match.away)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {tier && topValue && (
            <span
              className={cn(
                "font-display text-xs font-bold",
                tierTextClasses[tier],
              )}
            >
              {formatEdge(topValue.edge)}
            </span>
          )}
          {score ? (
            <span className="font-display text-sm font-bold">{score}</span>
          ) : (
            <MetaState match={match} />
          )}
        </span>
      </Link>
    );
  }

  const model = toTrio(match.prediction?.model);
  const market = toTrio(match.prediction?.market);
  const hasOdds = Boolean(match.odds?.best?.h2h);
  const bestOdds = footerBestOdds(match, topValue, model);

  return (
    <Link
      href={`/matches/${match._id}`}
      className={cn(
        "rounded-card block overflow-hidden border bg-card",
        borderClass,
        dim && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="font-display truncate text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          {[stageLabel(match.stage, match.group), match.venue ?? match.city]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <MetaState match={match} />
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span aria-hidden className="text-xl leading-none">
            {sideFlag(match.home)}
          </span>
          <span className="font-display truncate text-[17px] font-bold uppercase">
            {sideName(match.home, match.homePlaceholder)}
          </span>
        </span>
        {score ? (
          <span className="font-display shrink-0 text-[17px] font-bold">
            {score}
          </span>
        ) : (
          <span className="font-display shrink-0 text-xs text-muted-foreground">
            {en.match.vs}
          </span>
        )}
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="font-display truncate text-right text-[17px] font-bold uppercase">
            {sideName(match.away, match.awayPlaceholder)}
          </span>
          <span aria-hidden className="text-xl leading-none">
            {sideFlag(match.away)}
          </span>
        </span>
      </div>

      {model && (
        <div className="px-4 pb-1">
          <ProbabilityBar
            model={model}
            market={market}
            accent={tier !== null}
          />
        </div>
      )}

      <div className="flex min-h-11 items-center justify-between gap-2 px-4 py-2.5">
        <FooterLeft
          match={match}
          topValue={topValue}
          hasOdds={hasOdds}
          codes={codes}
        />
        {bestOdds !== null && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {en.match.bestOddsLabel}{" "}
            <strong className="font-display text-[15px] text-foreground">
              {formatDecimalOdds(bestOdds)}
            </strong>
          </span>
        )}
      </div>
    </Link>
  );
}

function footerBestOdds(
  match: MatchCardData,
  topValue: MatchCardValueBet | null | undefined,
  model: ProbabilityTrio | null,
): number | null {
  if (match.status !== "scheduled") return null;
  if (topValue) return topValue.bestOdds;
  const h2h = match.odds?.best?.h2h;
  if (!h2h || !model) return null;
  // No flagged value — quote the model favorite's best price.
  if (model.home >= model.draw && model.home >= model.away) return h2h.home;
  return model.draw >= model.away ? h2h.draw : h2h.away;
}

function FooterLeft({
  match,
  topValue,
  hasOdds,
  codes,
}: {
  match: MatchCardData;
  topValue: MatchCardValueBet | null | undefined;
  hasOdds: boolean;
  codes: { home: string | null; away: string | null };
}) {
  if (match.status === "finished" || match.status === "live") {
    const score = match.score
      ? formatScoreline(match.score.home, match.score.away)
      : null;
    return (
      <span className="font-display text-sm font-bold text-muted-foreground">
        {match.status === "finished" ? en.match.fullTime : en.match.live}
        {score ? ` ${score}` : null}
      </span>
    );
  }
  if (match.status === "postponed" || match.status === "cancelled") {
    return (
      <span className="text-sm text-muted-foreground">
        {match.status === "postponed" ? en.match.postponed : en.match.cancelled}
      </span>
    );
  }
  if (topValue && valueTier(topValue.edge)) {
    return (
      <ValueBadge
        edge={topValue.edge}
        label={valueBetShortLabel(topValue, codes)}
      />
    );
  }
  return (
    <span className="text-sm text-muted-foreground">
      {hasOdds ? en.match.fairNoEdge : en.match.noOddsYet}
    </span>
  );
}
