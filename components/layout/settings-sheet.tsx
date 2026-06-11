"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut, RefreshCw, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

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

function StubField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="secondary">{en.settings.comingSoon}</Badge>
      </div>
      {children}
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

/**
 * Header gear → settings sheet. Bankroll / Kelly / refresh are stubs until
 * later issues wire them; sign-out is live.
 */
export function SettingsSheet() {
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={en.settings.title}>
          <Settings className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px]">
        <SheetHeader>
          <SheetTitle>{en.settings.title}</SheetTitle>
          <SheetDescription>{en.settings.description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
          <StubField
            label={en.settings.bankrollLabel}
            hint={en.settings.bankrollHint}
          >
            <Input type="number" inputMode="decimal" disabled placeholder="0" />
          </StubField>
          <StubField
            label={en.settings.kellyLabel}
            hint={en.settings.kellyHint}
          >
            <Input
              type="number"
              inputMode="decimal"
              disabled
              placeholder="0.5"
            />
          </StubField>
          <StubField
            label={en.settings.refreshAction}
            hint={en.settings.refreshHint}
          >
            <Button variant="outline" disabled>
              <RefreshCw data-icon="inline-start" />
              {en.settings.refreshAction}
            </Button>
          </StubField>
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
