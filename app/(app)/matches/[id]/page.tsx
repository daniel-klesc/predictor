import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.matchDetail.title };

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params; // match id consumed by the match-detail issue
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {en.screens.matchDetail.empty}
      </p>
      <Skeleton className="rounded-card h-40" />
      <Skeleton className="rounded-card h-24" />
    </div>
  );
}
