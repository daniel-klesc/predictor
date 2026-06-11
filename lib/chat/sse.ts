/**
 * Client-side SSE consumption for /api/chat (chat UI issue #8).
 *
 * Two framework-free pieces, fully unit-testable in node:
 *
 * - `runChatStream` — POSTs `{threadId}` with the Convex JWT, reads the SSE
 *   body, splits `data:` frames (which may arrive split across chunks), and
 *   dispatches each decoded {@link ChatStreamEvent} to `onEvent`. It never
 *   throws: HTTP/transport failures surface as a synthetic `error` event and
 *   an `"error"` result; an abort resolves `"aborted"` silently.
 * - `applyChatEvent` — the pure reducer that folds events into the view the
 *   `useChatStream` hook renders (accumulated text, tool chips, thinking
 *   flag, stop reason, terminal error).
 */
import { en } from "@/lib/strings/en";

import {
  type ChatStopReason,
  type ChatStreamEvent,
  decodeChatEvent,
} from "./protocol";
import { toolChipDetailFromArgs } from "./assistant-blocks";

/** One tool call rendered as a progress chip in the streaming overlay. */
export interface ChatToolChip {
  /** Stable render key (event arrival index). */
  id: number;
  name: string;
  /** Compact arg summary parsed from the tool-start event ("#1", "MEX"…). */
  detail: string;
  status: "running" | "done";
  isError: boolean;
  /** Raw result summary (the proposed-bet card parses propose_bet's). */
  resultSummary?: string;
}

/** Everything the chat UI needs to render an in-flight assistant turn. */
export interface ChatStreamView {
  text: string;
  toolEvents: ChatToolChip[];
  thinking: boolean;
  /** Set by the terminal `done` event. */
  stopReason: ChatStopReason | null;
  /** Terminal failure (server `error` event or transport problem). */
  error: string | null;
}

export const EMPTY_CHAT_STREAM_VIEW: ChatStreamView = {
  text: "",
  toolEvents: [],
  thinking: false,
  stopReason: null,
  error: null,
};

/** Fold one decoded SSE event into the view (immutable). */
export function applyChatEvent(
  view: ChatStreamView,
  event: ChatStreamEvent,
): ChatStreamView {
  switch (event.type) {
    case "text-delta":
      return { ...view, text: view.text + event.text, thinking: false };
    case "thinking":
      return { ...view, thinking: true };
    case "tool-start":
      return {
        ...view,
        thinking: false,
        toolEvents: [
          ...view.toolEvents,
          {
            id: view.toolEvents.length,
            name: event.name,
            detail: toolChipDetailFromArgs(event.name, event.args),
            status: "running",
            isError: false,
          },
        ],
      };
    case "tool-result": {
      const index = view.toolEvents.findIndex(
        (chip) => chip.status === "running" && chip.name === event.name,
      );
      if (index === -1) {
        // Result without a visible start (defensive) — append a done chip.
        return {
          ...view,
          toolEvents: [
            ...view.toolEvents,
            {
              id: view.toolEvents.length,
              name: event.name,
              detail: "",
              status: "done",
              isError: event.isError === true,
              resultSummary: event.summary,
            },
          ],
        };
      }
      const toolEvents = view.toolEvents.slice();
      toolEvents[index] = {
        ...toolEvents[index],
        status: "done",
        isError: event.isError === true,
        resultSummary: event.summary,
      };
      return { ...view, toolEvents };
    }
    case "done":
      return { ...view, thinking: false, stopReason: event.stopReason };
    case "error":
      return { ...view, thinking: false, error: event.message };
  }
}

export type ChatStreamResult = "done" | "error" | "aborted";

export interface RunChatStreamOptions {
  threadId: string;
  /** Convex JWT for the Authorization header (null → request still sent; the route answers 401). */
  token: string | null;
  signal: AbortSignal;
  onEvent(event: ChatStreamEvent): void;
  /** Injected for tests and the e2e mock seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Defaults to "/api/chat". */
  endpoint?: string;
}

const FRAME_SEPARATOR = "\n\n";

/**
 * POST one turn and pump its SSE events to `onEvent` until the stream ends.
 * Resolves with how the stream finished; never rejects.
 */
export async function runChatStream(
  options: RunChatStreamOptions,
): Promise<ChatStreamResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "/api/chat";
  const fail = (message: string): "error" => {
    options.onEvent({ type: "error", message });
    return "error";
  };

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.token === null
          ? {}
          : { Authorization: `Bearer ${options.token}` }),
      },
      body: JSON.stringify({ threadId: options.threadId }),
      signal: options.signal,
    });
  } catch {
    if (options.signal.aborted) return "aborted";
    return fail(en.chat.errors.network);
  }

  if (!response.ok) {
    let message: string = en.chat.errors.network;
    try {
      const data = (await response.json()) as { error?: unknown };
      if (typeof data?.error === "string" && data.error !== "") {
        message = data.error;
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    return fail(message);
  }
  if (!response.body) return fail(en.chat.errors.connectionLost);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal: ChatStreamResult | null = null;

  const drainFrames = (): void => {
    for (;;) {
      const separatorAt = buffer.indexOf(FRAME_SEPARATOR);
      if (separatorAt === -1) return;
      const frame = buffer.slice(0, separatorAt);
      buffer = buffer.slice(separatorAt + FRAME_SEPARATOR.length);
      const event = decodeChatEvent(frame);
      if (!event) continue; // heartbeat / malformed frame
      options.onEvent(event);
      if (event.type === "done") terminal = "done";
      else if (event.type === "error") terminal = "error";
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drainFrames();
    }
    buffer += decoder.decode();
    drainFrames();
  } catch {
    if (options.signal.aborted) return "aborted";
    return terminal ?? fail(en.chat.errors.connectionLost);
  }

  if (options.signal.aborted) return "aborted";
  if (terminal) return terminal;
  // The stream closed without a done/error event — the server went away.
  return fail(en.chat.errors.connectionLost);
}
