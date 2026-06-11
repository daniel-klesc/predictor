import type { Metadata } from "next";

import { ThreadView } from "@/components/chat/thread-view";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.chatThread.title };

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  // Keyed remount per thread: switching /chat/[a] → /chat/[b] re-renders the
  // same page component, and the key makes the previous view unmount (which
  // aborts its in-flight stream) instead of leaking state across threads.
  return <ThreadView key={threadId} threadId={threadId} />;
}
