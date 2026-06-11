import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.bets.title };

export default function BetsPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{en.screens.bets.empty}</p>
      <Skeleton className="rounded-card h-20" />
      <Skeleton className="rounded-card h-20" />
    </div>
  );
}
