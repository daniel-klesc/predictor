import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.chat.title };

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{en.screens.chat.empty}</p>
      <Skeleton className="rounded-card h-12 w-3/4" />
      <Skeleton className="rounded-card h-12 w-2/3 self-end" />
      <Skeleton className="rounded-card h-12 w-3/4" />
    </div>
  );
}
