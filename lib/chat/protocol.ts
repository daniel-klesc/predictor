/**
 * SSE wire protocol between /api/chat and the chat UI, plus the persisted
 * assistant block shapes. Pure types + encode/decode helpers — shared by the
 * route (encoder) and the future chat-UI issue (decoder), and unit-tested.
 */

/** Token usage summed across every model call of one assistant turn. */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export const EMPTY_USAGE: ChatUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

/** Why the assistant turn ended (persisted + sent in the `done` event). */
export type ChatStopReason =
  | "end_turn"
  | "max_tokens"
  | "refusal"
  | "stop_sequence"
  | "pause_limit"
  | "iteration_limit"
  | "error";

/** One server-sent event on the chat stream. */
export type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  /** The model started a thinking block (content stays redacted). */
  | { type: "thinking" }
  /** A tool call started; `args` is a compact JSON summary for the chip. */
  | { type: "tool-start"; name: string; args: string }
  | { type: "tool-result"; name: string; summary: string; isError?: boolean }
  | { type: "done"; stopReason: ChatStopReason; usage: ChatUsage }
  /** Terminal failure; any partial text was persisted with an error marker. */
  | { type: "error"; message: string };

/**
 * Assistant content trace persisted on `chatMessages.blocks` — the model's
 * blocks across all loop iterations, in order, interleaved with the tool
 * results the server fed back. Thinking content is never persisted (marker
 * only); signatures are dropped because history replays as plain text.
 */
export type StoredAssistantBlock =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "server_tool_use"; id: string; name: string; input: unknown }
  | { type: "web_search_tool_result"; toolUseId: string; summary: string }
  | {
      type: "tool_result";
      toolUseId: string;
      name: string;
      content: string;
      isError?: boolean;
    }
  | { type: "error"; message: string };

/** Encode one event as an SSE `data:` frame. */
export function encodeChatEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Decode one SSE frame produced by {@link encodeChatEvent} (UI + tests).
 * Returns null for heartbeats, blank lines, or malformed payloads.
 */
export function decodeChatEvent(frame: string): ChatStreamEvent | null {
  const line = frame.trim();
  if (!line.startsWith("data:")) return null;
  try {
    const parsed: unknown = JSON.parse(line.slice("data:".length).trim());
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      return parsed as ChatStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Response headers for the chat SSE stream. */
export const CHAT_SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering so deltas reach the client immediately.
  "X-Accel-Buffering": "no",
};
