import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.matches.title };

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {en.screens.matches.empty}
      </p>
      <Skeleton className="rounded-tile h-16" />
      <Skeleton className="rounded-tile h-16" />
      <Skeleton className="rounded-tile h-16" />
      <Skeleton className="rounded-tile h-16" />
    </div>
  );
}
