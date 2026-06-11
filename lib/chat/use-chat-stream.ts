"use client";

/**
 * React binding for one in-flight assistant turn (chat UI issue #8).
 *
 * The hook is a thin shell: all stream mechanics live in `lib/chat/sse.ts`
 * (`runChatStream` + the `applyChatEvent` reducer), which is what the unit
 * tests drive with scripted SSE chunks. The hook owns the AbortController
 * (aborted on unmount/navigation — the server keeps running and persists
 * the turn), the Convex JWT, and the React state snapshots.
 */
import { useAuthToken } from "@convex-dev/auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatStopReason } from "./protocol";
import {
  applyChatEvent,
  type ChatToolChip,
  EMPTY_CHAT_STREAM_VIEW,
  runChatStream,
} from "./sse";

declare global {
  interface Window {
    /**
     * e2e seam: Playwright installs a scripted SSE fetch here to exercise
     * the full streaming UI without an ANTHROPIC_API_KEY. Unset in normal
     * operation (and harmless if set — it only affects this browser's own
     * authed session).
     */
    __chatFetchOverride?: typeof fetch;
  }
}

export interface UseChatStreamResult {
  /** Accumulated assistant text of the in-flight turn. */
  streamingText: string;
  /** Tool progress chips of the in-flight turn. */
  toolEvents: ChatToolChip[];
  /** The model is in a thinking block (content stays redacted). */
  thinking: boolean;
  /** Terminal failure of the last turn (cleared by send/reset). */
  error: string | null;
  /** Stop reason from the `done` event of the last finished turn. */
  stopReason: ChatStopReason | null;
  /** A POST is in flight (composer send stays disabled). */
  isStreaming: boolean;
  /** POST /api/chat for `threadId` (the user message must be persisted first). */
  send(threadId: string): void;
  /** Clear the overlay (called when the persisted message takes over). */
  reset(): void;
}

export function useChatStream(): UseChatStreamResult {
  const token = useAuthToken();
  // Latest-token ref, written in an effect (never during render); send() is
  // only callable from events/effects, which run after the effect commits.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const [view, setView] = useState(EMPTY_CHAT_STREAM_VIEW);
  const [isStreaming, setIsStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback((threadId: string) => {
    if (controllerRef.current !== null) return; // one turn at a time
    const controller = new AbortController();
    controllerRef.current = controller;
    setView(EMPTY_CHAT_STREAM_VIEW);
    setIsStreaming(true);
    const fetchImpl =
      typeof window !== "undefined" ? window.__chatFetchOverride : undefined;
    void runChatStream({
      threadId,
      token: tokenRef.current,
      signal: controller.signal,
      fetchImpl,
      onEvent: (event) => setView((current) => applyChatEvent(current, event)),
    }).finally(() => {
      if (controllerRef.current === controller) controllerRef.current = null;
      setIsStreaming(false);
    });
  }, []);

  const reset = useCallback(() => {
    setView(EMPTY_CHAT_STREAM_VIEW);
  }, []);

  // Abort on unmount/navigation. The route keeps streaming server-side and
  // persists the finished turn, so nothing is lost — the thread shows it on
  // the next visit. The abort is deferred one tick and cancelled when the
  // effect re-arms, so React StrictMode's simulated unmount/remount (dev)
  // does not kill a stream the autostart effect just opened.
  const abortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (abortTimerRef.current !== null) {
      clearTimeout(abortTimerRef.current);
      abortTimerRef.current = null;
    }
    return () => {
      abortTimerRef.current = setTimeout(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
      }, 0);
    };
  }, []);

  return {
    streamingText: view.text,
    toolEvents: view.toolEvents,
    thinking: view.thinking,
    error: view.error,
    stopReason: view.stopReason,
    isStreaming,
    send,
    reset,
  };
}
