/**
 * SSE protocol tests: frame encoding, decode round-trip, and the stream
 * headers the chat UI depends on.
 */
import { describe, expect, it } from "vitest";

import {
  CHAT_SSE_HEADERS,
  type ChatStreamEvent,
  decodeChatEvent,
  encodeChatEvent,
} from "@/lib/chat/protocol";

describe("chat SSE protocol", () => {
  it("encodes events as single data: frames", () => {
    const frame = encodeChatEvent({ type: "text-delta", text: "Hi" });
    expect(frame).toBe('data: {"type":"text-delta","text":"Hi"}\n\n');
  });

  it("round-trips every event type through encode/decode", () => {
    const events: ChatStreamEvent[] = [
      { type: "text-delta", text: "chunk" },
      { type: "thinking" },
      { type: "tool-start", name: "get_value_bets", args: '{"minEdge":0.03}' },
      { type: "tool-result", name: "get_value_bets", summary: "2 bets" },
      {
        type: "tool-result",
        name: "propose_bet",
        summary: "failed",
        isError: true,
      },
      {
        type: "done",
        stopReason: "end_turn",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheCreationInputTokens: 1,
          cacheReadInputTokens: 2,
        },
      },
      { type: "error", message: "boom" },
    ];
    for (const event of events) {
      expect(decodeChatEvent(encodeChatEvent(event))).toEqual(event);
    }
  });

  it("decodes only well-formed data frames", () => {
    expect(decodeChatEvent("")).toBeNull();
    expect(decodeChatEvent(": heartbeat")).toBeNull();
    expect(decodeChatEvent("data: not-json")).toBeNull();
    expect(decodeChatEvent('data: {"no":"type"}')).toBeNull();
    expect(decodeChatEvent('data: {"type":"text-delta","text":"x"}')).toEqual({
      type: "text-delta",
      text: "x",
    });
  });

  it("uses event-stream headers with buffering disabled", () => {
    expect(CHAT_SSE_HEADERS["Content-Type"]).toContain("text/event-stream");
    expect(CHAT_SSE_HEADERS["Cache-Control"]).toContain("no-cache");
    expect(CHAT_SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});
