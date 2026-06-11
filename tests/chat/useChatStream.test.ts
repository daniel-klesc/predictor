/**
 * Client-stream tests for the chat UI hook's core (`lib/chat/sse.ts`): the
 * `useChatStream` hook is a thin React binding over `runChatStream` + the
 * `applyChatEvent` reducer, so the scripted-SSE coverage lives here —
 * text/tool/done/error sequences, frames split across chunks, HTTP errors,
 * abort, and streams that die without a terminal event.
 */
import { describe, expect, it } from "vitest";

import { type ChatStreamEvent, encodeChatEvent } from "@/lib/chat/protocol";
import {
  applyChatEvent,
  type ChatStreamView,
  EMPTY_CHAT_STREAM_VIEW,
  runChatStream,
} from "@/lib/chat/sse";
import { en } from "@/lib/strings/en";

const encoder = new TextEncoder();

/** Response whose body delivers `chunks` in order, then closes. */
function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function fetchReturning(response: Response): typeof fetch {
  return async () => response;
}

/** Run a stream built from `chunks`, collecting events + the folded view. */
async function run(chunks: string[]) {
  const events: ChatStreamEvent[] = [];
  let view: ChatStreamView = EMPTY_CHAT_STREAM_VIEW;
  const result = await runChatStream({
    threadId: "thread-1",
    token: "jwt-token",
    signal: new AbortController().signal,
    fetchImpl: fetchReturning(sseResponse(chunks)),
    onEvent: (event) => {
      events.push(event);
      view = applyChatEvent(view, event);
    },
  });
  return { result, events, view };
}

/** Split a string into fixed-size chunks (frames cross chunk boundaries). */
function shred(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

const DONE_EVENT: ChatStreamEvent = {
  type: "done",
  stopReason: "end_turn",
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  },
};

describe("runChatStream + applyChatEvent", () => {
  it("folds a full turn — thinking, tool lifecycle, text, done", async () => {
    const wire = [
      { type: "thinking" } as const,
      {
        type: "tool-start",
        name: "get_match_analysis",
        args: '{"matchNumber":1}',
      } as const,
      {
        type: "tool-result",
        name: "get_match_analysis",
        summary: '{"match":{"matchNumber":1}}',
      } as const,
      { type: "text-delta", text: "Mexico " } as const,
      { type: "text-delta", text: "58%" } as const,
      DONE_EVENT,
    ]
      .map(encodeChatEvent)
      .join("");

    // 7-byte chunks force every frame to span chunk boundaries.
    const { result, events, view } = await run(shred(wire, 7));

    expect(result).toBe("done");
    expect(events).toHaveLength(6);
    expect(view.text).toBe("Mexico 58%");
    expect(view.thinking).toBe(false);
    expect(view.stopReason).toBe("end_turn");
    expect(view.error).toBeNull();
    expect(view.toolEvents).toEqual([
      {
        id: 0,
        name: "get_match_analysis",
        detail: "#1",
        status: "done",
        isError: false,
        resultSummary: '{"match":{"matchNumber":1}}',
      },
    ]);
  });

  it("marks tool chips running until their result arrives", () => {
    let view = applyChatEvent(EMPTY_CHAT_STREAM_VIEW, {
      type: "tool-start",
      name: "get_odds",
      args: '{"matchNumber":9}',
    });
    expect(view.toolEvents[0].status).toBe("running");
    view = applyChatEvent(view, {
      type: "tool-result",
      name: "get_odds",
      summary: "{}",
      isError: true,
    });
    expect(view.toolEvents[0]).toMatchObject({
      status: "done",
      isError: true,
    });
  });

  it("appends a done chip for a result without a visible start", () => {
    const view = applyChatEvent(EMPTY_CHAT_STREAM_VIEW, {
      type: "tool-result",
      name: "web_search",
      summary: "3 results",
    });
    expect(view.toolEvents).toEqual([
      {
        id: 0,
        name: "web_search",
        detail: "",
        status: "done",
        isError: false,
        resultSummary: "3 results",
      },
    ]);
  });

  it("keeps the propose_bet result summary for the bet card", async () => {
    const summary =
      '{"proposed":true,"match":"MEX–RSA (#1)","market":"h2h","selection":"home","odds":1.95}';
    const wire = [
      { type: "tool-start", name: "propose_bet", args: "{}" } as const,
      { type: "tool-result", name: "propose_bet", summary } as const,
      DONE_EVENT,
    ]
      .map(encodeChatEvent)
      .join("");
    const { view } = await run([wire]);
    expect(view.toolEvents[0].resultSummary).toBe(summary);
  });

  it("skips heartbeats and malformed frames", async () => {
    const wire = `: heartbeat\n\ndata: not-json\n\n${encodeChatEvent(DONE_EVENT)}`;
    const { result, events } = await run([wire]);
    expect(result).toBe("done");
    expect(events).toEqual([DONE_EVENT]);
  });

  it("surfaces a server error event after partial text", async () => {
    const wire = [
      { type: "text-delta", text: "Partial" } as const,
      { type: "error", message: "Model request failed (529)." } as const,
    ]
      .map(encodeChatEvent)
      .join("");
    const { result, view } = await run([wire]);
    expect(result).toBe("error");
    expect(view.text).toBe("Partial");
    expect(view.error).toBe("Model request failed (529).");
  });

  it("turns a non-OK JSON response into an error event", async () => {
    const events: ChatStreamEvent[] = [];
    const result = await runChatStream({
      threadId: "thread-1",
      token: null,
      signal: new AbortController().signal,
      fetchImpl: fetchReturning(
        Response.json({ error: "Unauthorized." }, { status: 401 }),
      ),
      onEvent: (event) => events.push(event),
    });
    expect(result).toBe("error");
    expect(events).toEqual([{ type: "error", message: "Unauthorized." }]);
  });

  it("falls back to the generic message for non-JSON error bodies", async () => {
    const events: ChatStreamEvent[] = [];
    const result = await runChatStream({
      threadId: "thread-1",
      token: "jwt",
      signal: new AbortController().signal,
      fetchImpl: fetchReturning(new Response("boom", { status: 500 })),
      onEvent: (event) => events.push(event),
    });
    expect(result).toBe("error");
    expect(events).toEqual([
      { type: "error", message: en.chat.errors.network },
    ]);
  });

  it("reports a network failure without throwing", async () => {
    const events: ChatStreamEvent[] = [];
    const result = await runChatStream({
      threadId: "thread-1",
      token: "jwt",
      signal: new AbortController().signal,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
      onEvent: (event) => events.push(event),
    });
    expect(result).toBe("error");
    expect(events).toEqual([
      { type: "error", message: en.chat.errors.network },
    ]);
  });

  it("flags a stream that closes without done/error", async () => {
    const wire = encodeChatEvent({ type: "text-delta", text: "Hi" });
    const { result, view } = await run([wire]);
    expect(result).toBe("error");
    expect(view.text).toBe("Hi");
    expect(view.error).toBe(en.chat.errors.connectionLost);
  });

  it("resolves 'aborted' silently when the caller aborts mid-stream", async () => {
    const controller = new AbortController();
    let failStream: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(
          encoder.encode(encodeChatEvent({ type: "text-delta", text: "Hi" })),
        );
        failStream = () =>
          streamController.error(
            new DOMException("The operation was aborted.", "AbortError"),
          );
      },
    });
    const fetchImpl: typeof fetch = async (_input, init) => {
      init?.signal?.addEventListener("abort", () => failStream?.());
      return new Response(body, { status: 200 });
    };

    const events: ChatStreamEvent[] = [];
    const result = await runChatStream({
      threadId: "thread-1",
      token: "jwt",
      signal: controller.signal,
      fetchImpl,
      onEvent: (event) => {
        events.push(event);
        controller.abort(); // abort as soon as the first delta lands
      },
    });

    expect(result).toBe("aborted");
    expect(events).toEqual([{ type: "text-delta", text: "Hi" }]);
  });

  it("sends the JWT and threadId on the POST", async () => {
    let captured: { url: string; init: RequestInit | undefined } | null = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      captured = { url: String(input), init };
      return sseResponse([encodeChatEvent(DONE_EVENT)]);
    };
    await runChatStream({
      threadId: "thread-42",
      token: "jwt-token",
      signal: new AbortController().signal,
      fetchImpl,
      onEvent: () => {},
    });
    expect(captured).not.toBeNull();
    const { url, init } = captured!;
    expect(url).toBe("/api/chat");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-token",
    );
    expect(init?.body).toBe('{"threadId":"thread-42"}');
  });
});
