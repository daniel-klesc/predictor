"use client";

import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  betSelectionLabel,
  formatMoney,
  formatSignedMoney,
} from "@/lib/bet-display";
import {
  flagEmoji,
  formatDecimalOdds,
  formatEdge,
  formatPlaceholder,
} from "@/lib/format";
import { en } from "@/lib/strings/en";
import { cn } from "@/lib/utils";

/** Enriched bet shape from `api.bets.listMine` (structural contract). */
export interface BetCardBet {
  _id: string;
  market: string;
  selection: string;
  odds: number;
  stake?: number | null;
  status: "proposed" | "placed" | "won" | "lost" | "void";
  source: "analysis" | "chat" | "manual";
  payout?: number | null;
  match: {
    home: { code: string; name: string } | null;
    away: { code: string; name: string } | null;
    homePlaceholder?: string;
    awayPlaceholder?: string;
  } | null;
  edge: number | null;
}

const PILL_BASE =
  "font-display inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap uppercase tabular-nums";

const SETTLED_PILL_CLASSES: Record<"won" | "lost" | "void", string> = {
  won: "border-edge-positive/30 bg-edge-positive/10 text-edge-positive",
  lost: "border-destructive/30 bg-destructive/10 text-destructive",
  void: "border-border bg-muted text-muted-foreground",
};

/** "🇲🇽 Mexico win @ 1.95" — flag only for home/away team selections. */
export function betTitle(bet: BetCardBet): string {
  const names = {
    home: bet.match?.home?.name ?? null,
    away: bet.match?.away?.name ?? null,
  };
  const label = betSelectionLabel(bet, names);
  const flagCode =
    bet.market === "h2h" && bet.selection === "home"
      ? bet.match?.home?.code
      : bet.market === "h2h" && bet.selection === "away"
        ? bet.match?.away?.code
        : null;
  const text = en.bets.card.selectionAtOdds(label, formatDecimalOdds(bet.odds));
  return flagCode ? `${flagEmoji(flagCode)} ${text}` : text;
}

/** "vs South Africa" for team picks, "ESP – MEX" otherwise. */
function matchupLine(bet: BetCardBet): string | null {
  const match = bet.match;
  if (!match) return null;
  if (bet.market === "h2h" && bet.selection === "home") {
    return en.bets.card.vs(
      match.away?.name ?? formatPlaceholder(match.awayPlaceholder),
    );
  }
  if (bet.market === "h2h" && bet.selection === "away") {
    return en.bets.card.vs(
      match.home?.name ?? formatPlaceholder(match.homePlaceholder),
    );
  }
  const home = match.home?.code ?? en.placeholders.unknown;
  const away = match.away?.code ?? en.placeholders.unknown;
  return `${home} – ${away}`;
}

function settledPill(bet: BetCardBet): { text: string; className: string } {
  const stake = bet.stake ?? 0;
  if (bet.status === "won") {
    const net = (bet.payout ?? 0) - stake;
    return {
      text: en.bets.pills.won(formatSignedMoney(net)),
      className: SETTLED_PILL_CLASSES.won,
    };
  }
  if (bet.status === "lost") {
    return {
      text: en.bets.pills.lost(formatSignedMoney(-stake)),
      className: SETTLED_PILL_CLASSES.lost,
    };
  }
  return { text: en.bets.pills.void, className: SETTLED_PILL_CLASSES.void };
}

/**
 * One bet card for all three Bets-tab sections. Proposed cards get the
 * Place CTA (suggested stake baked into the label when known) and a
 * dismiss button; placed cards show an "Awaiting" pill plus a stake-edit
 * button; settled cards show the won/lost/void pill with the net result.
 */
export function BetCard({
  bet,
  suggestedStake,
  onPlace,
  onRemove,
  onEditStake,
}: {
  bet: BetCardBet;
  /** Whole-unit stake suggestion for the Place CTA (proposed only). */
  suggestedStake?: number | null;
  onPlace?: () => void;
  onRemove?: () => void;
  onEditStake?: () => void;
}) {
  const title = betTitle(bet);
  const isProposed = bet.status === "proposed";
  const isPlaced = bet.status === "placed";
  const isSettled =
    bet.status === "won" || bet.status === "lost" || bet.status === "void";

  const meta: string[] = [];
  const matchup = matchupLine(bet);
  if (matchup) meta.push(matchup);
  if (isProposed) {
    if (bet.edge !== null) meta.push(en.bets.card.edge(formatEdge(bet.edge)));
    meta.push(en.bets.card.source[bet.source]);
  } else if (bet.stake != null) {
    meta.push(en.bets.amount(formatMoney(bet.stake)));
  }

  return (
    <div
      className={cn(
        "rounded-card flex items-center justify-between gap-3 border bg-card px-4 py-3",
        isProposed ? "border-primary/40" : "border-border",
        bet.status === "lost" && "opacity-80",
      )}
    >
      <div className="min-w-0">
        <div className="font-display truncate text-[15px] font-bold uppercase">
          {title}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {meta.join(" · ")}
        </div>
      </div>

      {isProposed && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            className="font-display rounded-full font-bold tracking-wide uppercase"
            onClick={onPlace}
          >
            {suggestedStake != null
              ? en.bets.placeWith(en.bets.amount(formatMoney(suggestedStake)))
              : en.bets.place}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={en.bets.card.removeAria(title)}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      )}

      {isPlaced && (
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(PILL_BASE, "border-border text-muted-foreground")}
          >
            {en.bets.awaiting}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={en.bets.card.editStakeAria(title)}
            onClick={onEditStake}
          >
            <Pencil />
          </Button>
        </div>
      )}

      {isSettled &&
        (() => {
          const pill = settledPill(bet);
          return (
            <span className={cn(PILL_BASE, pill.className)}>{pill.text}</span>
          );
        })()}
    </div>
  );
}
