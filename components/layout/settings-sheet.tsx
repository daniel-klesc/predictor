"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { LogOut, RefreshCw, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { en } from "@/lib/strings/en";

function Field({
  label,
  hint,
  comingSoon = false,
  children,
}: {
  label: string;
  hint: string;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {comingSoon && (
          <Badge variant="secondary">{en.settings.comingSoon}</Badge>
        )}
      </div>
      {children}
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

/**
 * Header gear → settings sheet. Bankroll and Kelly multiplier persist to
 * `userSettings` (committed on blur); the bankroll sizes suggested stakes
 * on the Bets tab and the multiplier feeds the next predictions recompute.
 * The inputs are uncontrolled, remounted (via key) once settings load;
 * invalid entries snap back to the persisted value on blur. Refresh stays
 * a stub until a later issue; sign-out is live.
 */
export function SettingsSheet() {
  const { signOut } = useAuthActions();
  const router = useRouter();

  const settings = useQuery(api.bets.getSettings);
  const updateSettings = useMutation(api.bets.updateSettings);
  const loaded = settings !== undefined && settings !== null;

  const commitBankroll = (input: HTMLInputElement) => {
    if (!loaded) return;
    const raw = input.value.trim();
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed) || parsed < 0) {
      input.value = settings.bankroll != null ? String(settings.bankroll) : "";
      return;
    }
    if (parsed !== settings.bankroll) void updateSettings({ bankroll: parsed });
  };

  const commitKelly = (input: HTMLInputElement) => {
    if (!loaded) return;
    const raw = input.value.trim();
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      input.value = String(settings.kellyMultiplier);
      return;
    }
    if (parsed !== settings.kellyMultiplier) {
      void updateSettings({ kellyMultiplier: parsed });
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={en.settings.title}>
          <Settings className="size-5" />
        </Button>
      </SheetTrigger>
      {/* pt/pb-safe: full-height sheet must clear the notch + home indicator
          when the app runs standalone (viewport-fit=cover). */}
      <SheetContent side="right" className="pt-safe pb-safe w-[320px]">
        <SheetHeader>
          <SheetTitle>{en.settings.title}</SheetTitle>
          <SheetDescription>{en.settings.description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
          <Field
            label={en.settings.bankrollLabel}
            hint={en.settings.bankrollHint}
          >
            <Input
              key={loaded ? "bankroll-ready" : "bankroll-loading"}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              disabled={!loaded}
              defaultValue={
                loaded && settings.bankroll != null ? settings.bankroll : ""
              }
              onBlur={(event) => commitBankroll(event.currentTarget)}
            />
          </Field>
          <Field label={en.settings.kellyLabel} hint={en.settings.kellyHint}>
            <Input
              key={loaded ? "kelly-ready" : "kelly-loading"}
              type="number"
              inputMode="decimal"
              min="0"
              max="1"
              step="any"
              placeholder="0.25"
              disabled={!loaded}
              defaultValue={loaded ? settings.kellyMultiplier : ""}
              onBlur={(event) => commitKelly(event.currentTarget)}
            />
          </Field>
          <Field
            label={en.settings.refreshAction}
            hint={en.settings.refreshHint}
            comingSoon
          >
            <Button variant="outline" disabled>
              <RefreshCw data-icon="inline-start" />
              {en.settings.refreshAction}
            </Button>
          </Field>
        </div>
        <SheetFooter>
          <Separator />
          <Button
            variant="destructive"
            onClick={() => {
              void signOut().then(() => router.push("/signin"));
            }}
          >
            <LogOut data-icon="inline-start" />
            {en.settings.signOutAction}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
