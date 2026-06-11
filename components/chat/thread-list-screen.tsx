"use client";

import { useMutation, useQuery } from "convex/react";
import { MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { markAutostart } from "@/lib/chat/autostart";
import { formatThreadTime, threadDisplayTitle } from "@/lib/chat/thread-meta";
import { en } from "@/lib/strings/en";

/**
 * Chat tab: threads newest-activity first (the by_user index already orders
 * by lastMessageAt), a new-thread button, and an empty state whose
 * suggestion chips START a chat — create thread, persist the prompt, mark
 * autostart, navigate; the thread view streams the reply on arrival.
 */
export function ThreadListScreen() {
  const threads = useQuery(api.chat.listThreads);
  const createThread = useMutation(api.chat.createThread);
  const sendUserMessage = useMutation(api.chat.sendUserMessage);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [now] = useState(() => Date.now());

  const startChat = async (text?: string) => {
    if (pending) return;
    setPending(true);
    try {
      const threadId = await createThread({});
      if (text !== undefined) {
        await sendUserMessage({ threadId, text });
        markAutostart(threadId);
      }
      router.push(`/chat/${threadId}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        className="rounded-card border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-display w-full py-5 text-sm font-bold tracking-wider uppercase"
        disabled={pending}
        onClick={() => void startChat()}
      >
        <Plus data-icon="inline-start" />
        {en.chat.list.newChat}
      </Button>

      {threads === undefined ? (
        <>
          <Skeleton className="rounded-card h-14" />
          <Skeleton className="rounded-card h-14" />
          <Skeleton className="rounded-card h-14" />
        </>
      ) : threads.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-card border-border bg-card text-muted-foreground border px-4 py-6 text-center text-sm">
            {en.chat.list.empty}
          </p>
          <SuggestionChips
            onPick={(text) => void startChat(text)}
            disabled={pending}
          />
        </div>
      ) : (
        threads.map((thread) => (
          <Link
            key={thread._id}
            href={`/chat/${thread._id}`}
            className="rounded-card border-border bg-card hover:bg-muted/50 flex items-center justify-between gap-3 border px-4 py-3 transition-colors"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {threadDisplayTitle(thread.title, en.chat.list.untitled)}
              </div>
              {thread.matchId !== undefined && (
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                  <MessageCircle className="size-3" aria-hidden />
                  {en.chat.list.matchThread}
                </div>
              )}
            </div>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatThreadTime(thread.lastMessageAt, now)}
            </span>
          </Link>
        ))
      )}
    </div>
  );
}
