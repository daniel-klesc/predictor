"use client";

import { useState } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/bet-display";
import { en } from "@/lib/strings/en";

export interface StakeDialogState {
  betId: Id<"bets">;
  /** Card title, e.g. "🇲🇽 Mexico win @ 1.95". */
  label: string;
  odds: number;
  mode: "place" | "update";
  /** Prefill: Kelly suggestion (place) or the current stake (update). */
  initialStake: number | null;
  /** Kelly suggestion shown as a hint (place mode only). */
  suggested: number | null;
}

function parseStake(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Confirm-stake dialog. Place mode records the manually-placed bet's stake
 * (prefilled with the fractional-Kelly suggestion when bankroll + value
 * context are known); update mode edits the stake of an open bet.
 */
export function ConfirmStakeDialog({
  state,
  pending,
  onConfirm,
  onClose,
}: {
  state: StakeDialogState | null;
  pending: boolean;
  onConfirm: (stake: number) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {state && (
        <StakeForm
          key={`${state.betId}:${state.mode}`}
          state={state}
          pending={pending}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function StakeForm({
  state,
  pending,
  onConfirm,
  onClose,
}: {
  state: StakeDialogState;
  pending: boolean;
  onConfirm: (stake: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(
    state.initialStake != null ? String(state.initialStake) : "",
  );
  const stake = parseStake(value);
  const isPlace = state.mode === "place";

  const submit = () => {
    if (stake === null || pending) return;
    onConfirm(stake);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {isPlace ? en.bets.dialog.placeTitle : en.bets.dialog.updateTitle}
        </DialogTitle>
        <DialogDescription>
          <span className="font-display block font-bold uppercase text-foreground">
            {state.label}
          </span>
          {isPlace
            ? en.bets.dialog.placeDescription
            : en.bets.dialog.updateDescription}
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label
          className="font-display text-xs font-semibold tracking-wider uppercase text-muted-foreground"
          htmlFor="stake-input"
        >
          {en.bets.dialog.stakeLabel}
        </label>
        <Input
          id="stake-input"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {isPlace && state.suggested != null && (
          <p className="text-xs text-muted-foreground">
            {en.bets.dialog.suggested(
              en.bets.amount(formatMoney(state.suggested)),
            )}
          </p>
        )}
        {stake !== null && (
          <p className="text-xs text-muted-foreground">
            {en.bets.dialog.returns(
              en.bets.amount(
                formatMoney(Math.round(stake * state.odds * 100) / 100),
              ),
            )}
          </p>
        )}
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          {en.bets.dialog.cancel}
        </Button>
        <Button onClick={submit} disabled={stake === null || pending}>
          {isPlace ? en.bets.dialog.confirmPlace : en.bets.dialog.confirmUpdate}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
