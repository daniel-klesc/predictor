"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import { Composer } from "@/components/chat/composer";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { MatchContextStrip } from "@/components/chat/match-context-strip";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ProposedBetCard } from "@/components/chat/proposed-bet-card";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import { ToolChip } from "@/components/chat/tool-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  parseProposedBet,
  type ProposedBetView,
} from "@/lib/chat/assistant-blocks";
import { peekAutostart, takeAutostart } from "@/lib/chat/autostart";
import { threadDisplayTitle } from "@/lib/chat/thread-meta";
import { useChatStream } from "@/lib/chat/use-chat-stream";
import { en } from "@/lib/strings/en";

const PAGE_SIZE = 50;
/** "Pinned to bottom" tolerance — keep auto-scrolling within this distance. */
const PIN_THRESHOLD_PX = 80;

/**
 * Thread view (mockup step 3): live persisted messages from Convex with a
 * streaming overlay for the in-flight assistant turn (text accumulating into
 * a bubble, tool chips, thinking indicator). The overlay clears only once
 * the persisted assistant message lands in the live query — keyed message
 * docs take over without duplicate or flicker. Errors render as an inline
 * bubble; the retry affordance re-POSTs without re-sending the user message
 * and only shows when no assistant reply was persisted (a re-POST with a
 * trailing assistant message would be rejected by the route).
 */
export function ThreadView({ threadId }: { threadId: string }) {
  // threadContext tolerates malformed ids (null) and gates everything else.
  const context = useQuery(api.chat.threadContext, { threadId });
  const ready = context !== undefined && context !== null;
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.listMessages,
    ready ? { threadId: context.threadId } : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  // Pages walk backwards from the newest — reverse for display order.
  const messages = useMemo(() => [...results].reverse(), [results]);
  const messagesLoaded = ready && status !== "LoadingFirstPage";
  const lastMessage = messages[messages.length - 1];

  const sendUserMessage = useMutation(api.chat.sendUserMessage);
  const {
    streamingText,
    toolEvents,
    thinking,
    error: streamError,
    stopReason,
    isStreaming,
    send,
    reset,
  } = useChatStream();
  const [sendError, setSendError] = useState<string | null>(null);

  // The user message anchoring the in-flight turn; when an assistant message
  // lands after it, the persisted doc takes over and the overlay clears.
  const anchorRef = useRef<string | null>(null);

  // --- auto-scroll: pin to bottom unless the user scrolled up -------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
  }, []);

  // No setState in here — the autostart effect calls begin directly, and
  // the set-state-in-effect lint (correctly) traces local callbacks.
  const begin = useCallback(
    (anchorId: string) => {
      anchorRef.current = anchorId;
      pinnedRef.current = true;
      send(threadId);
    },
    [send, threadId],
  );

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      if (!ready || isStreaming) return false;
      setSendError(null);
      try {
        const messageId = await sendUserMessage({
          threadId: context.threadId,
          text,
        });
        begin(messageId);
        return true;
      } catch {
        setSendError(en.chat.errors.sendFailed);
        return false;
      }
    },
    [ready, isStreaming, sendUserMessage, context, begin],
  );

  const retry = useCallback(() => {
    setSendError(null);
    const lastUser = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (lastUser) begin(lastUser._id);
  }, [messages, begin]);

  // One-shot autostart: a suggestion chip on the thread list persisted the
  // first user message before navigating here — stream it on arrival.
  // `hadAutostart` is a render-safe peek (suppresses the retry-row flash
  // until the stream opens); the effect consumes the flag exactly once.
  const [hadAutostart] = useState(() => peekAutostart(threadId));
  useEffect(() => {
    if (!messagesLoaded || isStreaming) return;
    if (!takeAutostart(threadId)) return;
    const last = messages[messages.length - 1];
    if (last?.role === "user") begin(last._id);
  }, [messagesLoaded, isStreaming, messages, begin, threadId]);

  const overlayHasContent =
    streamingText !== "" || toolEvents.length > 0 || thinking;

  // Persisted takeover: the route persists the assistant message BEFORE the
  // `done` event, so once the live query delivers an assistant message after
  // our anchor user message, drop the overlay (single source of truth).
  useEffect(() => {
    if (isStreaming || !overlayHasContent) return;
    if (anchorRef.current === null) return;
    if (lastMessage?.role !== "assistant") return;
    const anchorId = anchorRef.current;
    if (!messages.some((message) => message._id === anchorId)) return;
    anchorRef.current = null;
    reset();
  }, [isStreaming, overlayHasContent, lastMessage, messages, reset]);

  // Proposed-bet cards for the in-flight turn (persisted renders re-derive
  // them from blocks).
  const liveBets = useMemo(
    () =>
      toolEvents
        .filter(
          (chip) =>
            chip.name === "propose_bet" &&
            chip.status === "done" &&
            !chip.isError &&
            chip.resultSummary !== undefined,
        )
        .map((chip) => parseProposedBet(chip.resultSummary as string))
        .filter((bet): bet is ProposedBetView => bet !== null),
    [toolEvents],
  );

  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [
    messages.length,
    streamingText,
    toolEvents.length,
    thinking,
    streamError,
    sendError,
    isStreaming,
  ]);

  if (context === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground text-sm">
          {en.chat.thread.notFound}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/chat">
            <ChevronLeft data-icon="inline-start" />
            {en.chat.thread.back}
          </Link>
        </Button>
      </div>
    );
  }

  const isEmpty = messagesLoaded && messages.length === 0 && !overlayHasContent;
  const canRetry = lastMessage?.role === "user";
  // Suppress the retry row while an autostarted first turn is still pending
  // (it would flash between the messages loading and the effect's POST); a
  // finished or failed turn lifts the suppression naturally.
  const autostartPending =
    hadAutostart && stopReason === null && streamError === null;
  const showRetryRow =
    messagesLoaded &&
    !isStreaming &&
    !overlayHasContent &&
    streamError === null &&
    !autostartPending &&
    canRetry;
  const errorMessage = streamError ?? sendError;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="-mx-1 flex items-center gap-1">
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label={en.chat.thread.back}
        >
          <Link href="/chat">
            <ChevronLeft />
          </Link>
        </Button>
        {context === undefined ? (
          <Skeleton className="h-4 w-40 rounded-md" />
        ) : (
          <p className="font-display text-muted-foreground truncate text-xs font-semibold tracking-wider uppercase">
            {threadDisplayTitle(context.title, en.chat.list.untitled)}
          </p>
        )}
      </div>

      {context?.match && <MatchContextStrip match={context.match} />}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-1"
      >
        {!messagesLoaded && (
          <>
            <Skeleton className="rounded-card h-12 w-3/4" />
            <Skeleton className="rounded-card h-12 w-2/3 self-end" />
            <Skeleton className="rounded-card h-12 w-3/4" />
          </>
        )}

        {messagesLoaded && status === "CanLoadMore" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground self-center"
            onClick={() => loadMore(PAGE_SIZE)}
          >
            {en.chat.thread.loadEarlier}
          </Button>
        )}

        {messages.map((message) => (
          <MessageBubble key={message._id} message={message} />
        ))}

        {isEmpty && !isStreaming && (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            {en.chat.thread.empty}
          </p>
        )}

        {(isStreaming || overlayHasContent) && (
          <div
            className="flex flex-col gap-2"
            aria-live="polite"
            aria-label={en.chat.streaming.aria}
          >
            {toolEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {toolEvents.map((chip) => (
                  <ToolChip
                    key={chip.id}
                    name={chip.name}
                    detail={chip.detail}
                    status={chip.status}
                    isError={chip.isError}
                  />
                ))}
              </div>
            )}
            {streamingText === "" &&
              (thinking || (isStreaming && toolEvents.length === 0)) && (
                <span className="text-muted-foreground animate-pulse px-1 text-xs">
                  {thinking
                    ? en.chat.streaming.thinking
                    : en.chat.streaming.waiting}
                </span>
              )}
            {(streamingText !== "" || liveBets.length > 0) && (
              <div className="rounded-card rounded-bl-sm border-border bg-card mr-6 space-y-2 border px-3.5 py-2.5 text-sm leading-relaxed">
                <MarkdownLite text={streamingText} />
                {liveBets.map((bet, index) => (
                  <ProposedBetCard key={index} bet={bet} />
                ))}
              </div>
            )}
          </div>
        )}

        {errorMessage !== null && (
          <div className="rounded-card rounded-bl-sm border-destructive/40 bg-destructive/10 mr-6 border px-3.5 py-2.5 text-sm">
            <p className="text-destructive">{errorMessage}</p>
            {streamError !== null && canRetry && !isStreaming && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={retry}
              >
                {en.chat.errors.retry}
              </Button>
            )}
          </div>
        )}

        {showRetryRow && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-muted-foreground text-xs">
              {en.chat.thread.noReply}
            </span>
            <Button variant="outline" size="xs" onClick={retry}>
              {en.chat.errors.retry}
            </Button>
          </div>
        )}
      </div>

      {isEmpty && !isStreaming && (
        <SuggestionChips
          onPick={(text) => void handleSend(text)}
          disabled={!ready || isStreaming}
        />
      )}
      <Composer onSend={handleSend} disabled={!ready || isStreaming} />
    </div>
  );
}
