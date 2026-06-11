import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.today.title };

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{en.screens.today.empty}</p>
      <Skeleton className="rounded-card h-24" />
      <Skeleton className="rounded-card h-24" />
      <Skeleton className="rounded-card h-24" />
    </div>
  );
}
