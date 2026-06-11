import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.chatThread.title };

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  await params; // thread id consumed by the chat issue
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {en.screens.chatThread.empty}
      </p>
      <Skeleton className="rounded-card h-12 w-3/4" />
      <Skeleton className="rounded-card h-12 w-2/3 self-end" />
    </div>
  );
}
