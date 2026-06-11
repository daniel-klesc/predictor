/**
 * /api/chat handler tests with injected deps: the 401 auth gate fires BEFORE
 * any Anthropic client is constructed, ownership failures 404, and the happy
 * path streams SSE deltas, persists the assistant message with usage, and
 * keeps the volatile context out of the cached system prompt.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { type ChatRouteDeps, handleChatRequest } from "@/lib/chat/handler";
import { type ChatStreamEvent, decodeChatEvent } from "@/lib/chat/protocol";
import type { ChatModelClient } from "@/lib/chat/stream";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";

import {
  fakeConvex,
  fakeStream,
  makeMessage,
  readSseFrames,
  scriptedModel,
  textBlock,
  textDeltaEvent,
} from "./fakes";

const THREAD_ID = "th_123";
// 2026-06-11 12:00 UTC.
const NOW = Date.UTC(2026, 5, 11, 12, 0, 0);

function chatRequest(options?: {
  token?: string | null;
  body?: unknown;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  const token = options?.token === undefined ? "valid-jwt" : options.token;
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(
      options?.body === undefined ? { threadId: THREAD_ID } : options.body,
    ),
  });
}

function defaultHandlers(): Record<
  string,
  (args: Record<string, unknown>) => unknown
> {
  return {
    "chat:threadContext": () => ({
      threadId: THREAD_ID,
      title: "Value bets",
      match: null,
    }),
    "chat:recentMessages": () => [
      { role: "user", text: "What are today's value bets?" },
    ],
    "chat:appendAssistantMessage": () => "msg_assistant_1",
  };
}

function makeDeps(options?: {
  handlers?: Record<string, (args: Record<string, unknown>) => unknown>;
  model?: ChatModelClient;
  anthropicApiKey?: string | undefined;
}): {
  deps: ChatRouteDeps;
  convex: ReturnType<typeof fakeConvex>;
  createModelClient: ReturnType<typeof vi.fn>;
  createConvexClient: ReturnType<typeof vi.fn>;
} {
  const convex = fakeConvex(options?.handlers ?? defaultHandlers());
  const model =
    options?.model ??
    scriptedModel([fakeStream([], makeMessage([textBlock("Hi")], "end_turn"))])
      .client;
  const createConvexClient = vi.fn(() => convex.client);
  const createModelClient = vi.fn(() => model);
  return {
    convex,
    createConvexClient,
    createModelClient,
    deps: {
      convexUrl: "https://test.convex.cloud",
      anthropicApiKey:
        "anthropicApiKey" in (options ?? {})
          ? options?.anthropicApiKey
          : "sk-ant-test",
      chatModel: "claude-opus-4-8",
      createConvexClient,
      createModelClient,
      now: () => NOW,
    },
  };
}

describe("auth gate", () => {
  it("401s without a bearer token — no Convex or Anthropic client created", async () => {
    const { deps, createConvexClient, createModelClient } = makeDeps();
    const response = await handleChatRequest(
      chatRequest({ token: null }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(createConvexClient).not.toHaveBeenCalled();
    expect(createModelClient).not.toHaveBeenCalled();
  });

  it("401s when the token fails Convex auth — before any Anthropic call", async () => {
    const { deps, createModelClient } = makeDeps({
      handlers: {
        "chat:threadContext": () => {
          throw new Error("Unauthenticated");
        },
      },
    });
    const response = await handleChatRequest(chatRequest(), deps);
    expect(response.status).toBe(401);
    expect(createModelClient).not.toHaveBeenCalled();
  });

  it("404s for a thread the user does not own", async () => {
    const { deps, createModelClient } = makeDeps({
      handlers: { "chat:threadContext": () => null },
    });
    const response = await handleChatRequest(chatRequest(), deps);
    expect(response.status).toBe(404);
    expect(createModelClient).not.toHaveBeenCalled();
  });

  it("400s for a body without threadId", async () => {
    const { deps, createConvexClient } = makeDeps();
    const response = await handleChatRequest(
      chatRequest({ body: { nope: 1 } }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(createConvexClient).not.toHaveBeenCalled();
  });

  it("500s without ANTHROPIC_API_KEY — after auth, before the SDK", async () => {
    const { deps, createModelClient } = makeDeps({
      anthropicApiKey: undefined,
    });
    const response = await handleChatRequest(chatRequest(), deps);
    expect(response.status).toBe(500);
    expect(createModelClient).not.toHaveBeenCalled();
  });

  it("400s when there is no pending user message", async () => {
    const { deps, createModelClient } = makeDeps({
      handlers: {
        ...defaultHandlers(),
        "chat:recentMessages": () => [
          { role: "user", text: "q" },
          { role: "assistant", text: "a" },
        ],
      },
    });
    const response = await handleChatRequest(chatRequest(), deps);
    expect(response.status).toBe(400);
    expect(createModelClient).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  it("streams SSE deltas, persists the assistant message, and reports usage", async () => {
    const scripted = scriptedModel([
      fakeStream(
        [textDeltaEvent("Two "), textDeltaEvent("value bets.")],
        makeMessage([textBlock("Two value bets.")], "end_turn", {
          input_tokens: 1200,
          output_tokens: 40,
          cache_read_input_tokens: 1100,
        }),
      ),
    ]);
    const { deps, convex } = makeDeps({ model: scripted.client });

    const response = await handleChatRequest(chatRequest(), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = (await readSseFrames(response))
      .map((frame) => decodeChatEvent(frame))
      .filter((event): event is ChatStreamEvent => event !== null);
    expect(events.map((event) => event.type)).toEqual([
      "text-delta",
      "text-delta",
      "done",
    ]);
    expect(events[2]).toEqual({
      type: "done",
      stopReason: "end_turn",
      usage: {
        inputTokens: 1200,
        outputTokens: 40,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 1100,
      },
    });

    // Assistant message persisted via the user-authed Convex client.
    expect(convex.mutations).toHaveLength(1);
    expect(convex.mutations[0].name).toBe("chat:appendAssistantMessage");
    expect(convex.mutations[0].args).toMatchObject({
      threadId: THREAD_ID,
      text: "Two value bets.",
      blocks: [{ type: "text", text: "Two value bets." }],
      usage: { inputTokens: 1200, cacheReadInputTokens: 1100 },
    });

    // History replay window requested with the documented limit.
    const historyCall = convex.queries.find(
      (call) => call.name === "chat:recentMessages",
    );
    expect(historyCall?.args).toEqual({ threadId: THREAD_ID, limit: 30 });

    // Cached prefix: frozen system prompt with the ephemeral breakpoint;
    // volatile context rides on the last user turn instead.
    const params = scripted.calls[0];
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system[0].text).toBe(SYSTEM_PROMPT);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    const lastMessage = params.messages[params.messages.length - 1];
    const blocks = lastMessage.content as Array<{ type: string; text: string }>;
    expect(blocks[blocks.length - 1].text).toContain("<context>");
    expect(blocks[blocks.length - 1].text).toContain("2026-06-11");
  });

  it("sends an error event and persists the partial turn when the model dies", async () => {
    const scripted = scriptedModel([
      {
        async *[Symbol.asyncIterator]() {
          yield textDeltaEvent("Half an ans");
          throw new Error("boom");
        },
        finalMessage: () => Promise.reject(new Error("boom")),
      },
    ]);
    const { deps, convex } = makeDeps({ model: scripted.client });
    const response = await handleChatRequest(chatRequest(), deps);
    const events = (await readSseFrames(response))
      .map((frame) => decodeChatEvent(frame))
      .filter((event): event is ChatStreamEvent => event !== null);

    expect(events[0]).toEqual({ type: "text-delta", text: "Half an ans" });
    const last = events[events.length - 1];
    expect(last.type).toBe("error");
    if (last.type === "error") {
      expect(last.message).not.toContain("boom");
    }

    expect(convex.mutations).toHaveLength(1);
    expect(convex.mutations[0].args).toMatchObject({
      text: "Half an ans",
    });
    const blocks = convex.mutations[0].args.blocks as Array<{ type: string }>;
    expect(blocks[blocks.length - 1].type).toBe("error");
  });
});
