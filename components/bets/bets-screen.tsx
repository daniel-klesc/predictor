"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { BetCard, betTitle } from "@/components/bets/bet-card";
import {
  ConfirmStakeDialog,
  type StakeDialogState,
} from "@/components/bets/confirm-stake-dialog";
import { RoiSummary } from "@/components/bets/roi-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { computeRoi, suggestedStake } from "@/lib/roi";
import { en } from "@/lib/strings/en";

type BetsData = NonNullable<FunctionReturnType<typeof api.bets.listMine>>;
type EnrichedBet = BetsData["proposed"][number];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display px-1 pt-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
      {children}
    </h2>
  );
}

/**
 * Bets tab: ROI summary header (settled bets only), then the proposed →
 * placed → settled flow. Placing records the stake of a bet Daniel placed
 * manually on his platform; settlement runs automatically off results-sync.
 */
export function BetsScreen() {
  const data = useQuery(api.bets.listMine);
  const place = useMutation(api.bets.place);
  const removeBet = useMutation(api.bets.remove);
  const updateStake = useMutation(api.bets.updateStake);

  const [dialog, setDialog] = useState<StakeDialogState | null>(null);
  const [pending, setPending] = useState(false);

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="rounded-card h-20" />
        <Skeleton className="rounded-card h-16" />
        <Skeleton className="rounded-card h-16" />
      </div>
    );
  }

  if (data === null) {
    return <p className="text-sm text-muted-foreground">{en.bets.empty}</p>;
  }

  const { proposed, placed, settled, bankroll } = data;
  const roi = computeRoi(settled);
  const isEmpty =
    proposed.length === 0 && placed.length === 0 && settled.length === 0;

  const openPlaceDialog = (bet: EnrichedBet) => {
    const suggestion = suggestedStake(bet.kellyFraction, bankroll);
    setDialog({
      betId: bet._id,
      label: betTitle(bet),
      odds: bet.odds,
      mode: "place",
      initialStake: suggestion,
      suggested: suggestion,
    });
  };

  const openUpdateDialog = (bet: EnrichedBet) => {
    setDialog({
      betId: bet._id,
      label: betTitle(bet),
      odds: bet.odds,
      mode: "update",
      initialStake: bet.stake ?? null,
      suggested: null,
    });
  };

  const onConfirmStake = async (stake: number) => {
    if (!dialog) return;
    setPending(true);
    try {
      if (dialog.mode === "place") {
        await place({ betId: dialog.betId, stake });
      } else {
        await updateStake({ betId: dialog.betId, stake });
      }
      setDialog(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-2">
      <RoiSummary roi={roi} />

      {isEmpty && (
        <p className="rounded-card border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {en.bets.empty}
        </p>
      )}

      {proposed.length > 0 && (
        <>
          <SectionHeading>
            {en.bets.sections.proposed(proposed.length)}
          </SectionHeading>
          {proposed.map((bet) => (
            <BetCard
              key={bet._id}
              bet={bet}
              suggestedStake={suggestedStake(bet.kellyFraction, bankroll)}
              onPlace={() => openPlaceDialog(bet)}
              onRemove={() => void removeBet({ betId: bet._id })}
            />
          ))}
        </>
      )}

      {placed.length > 0 && (
        <>
          <SectionHeading>
            {en.bets.sections.placed(placed.length)}
          </SectionHeading>
          {placed.map((bet) => (
            <BetCard
              key={bet._id}
              bet={bet}
              onEditStake={() => openUpdateDialog(bet)}
            />
          ))}
          <p className="px-1 text-xs text-muted-foreground">
            {en.bets.settleNote}
          </p>
        </>
      )}

      {settled.length > 0 && (
        <>
          <SectionHeading>{en.bets.sections.settled}</SectionHeading>
          {settled.map((bet) => (
            <BetCard key={bet._id} bet={bet} />
          ))}
        </>
      )}

      <ConfirmStakeDialog
        state={dialog}
        pending={pending}
        onConfirm={(stake) => void onConfirmStake(stake)}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
