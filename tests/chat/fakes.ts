/**
 * Shared fakes for the chat backend tests: scripted Anthropic message
 * streams, message/usage factories, and a name-dispatched fake Convex
 * client (same `getFunctionName` pattern as tests/refresh.test.ts).
 * No live API anywhere — everything is dependency-injected.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { type FunctionReference, getFunctionName } from "convex/server";

import type { ChatMessageStreamLike, ChatModelClient } from "@/lib/chat/stream";
import type { ConvexToolClient } from "@/lib/chat/tools";

export const nameOf = (ref: unknown): string =>
  getFunctionName(ref as FunctionReference<"query">);

// ---------------------------------------------------------------------------
// Anthropic message factories
// ---------------------------------------------------------------------------

export function makeUsage(partial?: Partial<Anthropic.Usage>): Anthropic.Usage {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    server_tool_use: null,
    service_tier: null,
    ...partial,
  } as Anthropic.Usage;
}

export function makeMessage(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.StopReason,
  usage?: Partial<Anthropic.Usage>,
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: makeUsage(usage),
  } as Anthropic.Message;
}

export function textBlock(text: string): Anthropic.ContentBlock {
  return { type: "text", text, citations: null } as Anthropic.ContentBlock;
}

export function toolUseBlock(
  id: string,
  name: string,
  input: unknown,
): Anthropic.ToolUseBlock {
  return {
    type: "tool_use",
    id,
    name,
    input,
    caller: { type: "direct" },
  } as Anthropic.ToolUseBlock;
}

export function serverToolUseBlock(
  id: string,
  input: unknown,
): Anthropic.ContentBlock {
  return {
    type: "server_tool_use",
    id,
    name: "web_search",
    input,
    caller: { type: "direct" },
  } as Anthropic.ContentBlock;
}

export function webSearchResultBlock(
  toolUseId: string,
  titles: string[],
): Anthropic.ContentBlock {
  return {
    type: "web_search_tool_result",
    tool_use_id: toolUseId,
    caller: { type: "direct" },
    content: titles.map((title) => ({
      type: "web_search_result",
      title,
      url: `https://example.com/${encodeURIComponent(title)}`,
      encrypted_content: "x",
      page_age: null,
    })),
  } as Anthropic.ContentBlock;
}

export function thinkingBlock(): Anthropic.ContentBlock {
  return {
    type: "thinking",
    thinking: "",
    signature: "sig",
  } as Anthropic.ContentBlock;
}

// ---------------------------------------------------------------------------
// Stream event factories
// ---------------------------------------------------------------------------

export function textDeltaEvent(text: string): Anthropic.MessageStreamEvent {
  return {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  } as Anthropic.MessageStreamEvent;
}

export function blockStartEvent(
  contentBlock: Anthropic.ContentBlock,
): Anthropic.MessageStreamEvent {
  return {
    type: "content_block_start",
    index: 0,
    content_block: contentBlock,
  } as Anthropic.MessageStreamEvent;
}

// ---------------------------------------------------------------------------
// Scripted model client
// ---------------------------------------------------------------------------

/** A stream that replays `events` and resolves `finalMessage` with `final`. */
export function fakeStream(
  events: Anthropic.MessageStreamEvent[],
  final: Anthropic.Message,
): ChatMessageStreamLike {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    finalMessage: () => Promise.resolve(final),
  };
}

/** A stream that emits `events` and then dies with `error` mid-iteration. */
export function failingStream(
  events: Anthropic.MessageStreamEvent[],
  error: Error,
): ChatMessageStreamLike {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
      throw error;
    },
    finalMessage: () => Promise.reject(error),
  };
}

/** Model client that returns the scripted streams in order. */
export function scriptedModel(streams: ChatMessageStreamLike[]): {
  client: ChatModelClient;
  calls: Anthropic.MessageStreamParams[];
} {
  const calls: Anthropic.MessageStreamParams[] = [];
  return {
    calls,
    client: {
      stream(params) {
        calls.push(params);
        const next = streams[calls.length - 1];
        if (!next) throw new Error("scripted model ran out of streams");
        return next;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fake Convex client
// ---------------------------------------------------------------------------

export interface RecordedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Name-dispatched fake ConvexToolClient. Handlers are keyed by the Convex
 * function name (e.g. "chat:toolFixtures", "bets:propose"); unknown names
 * throw so executor→function mapping regressions fail loudly.
 */
export function fakeConvex(
  handlers: Record<string, (args: Record<string, unknown>) => unknown>,
): {
  client: ConvexToolClient;
  queries: RecordedCall[];
  mutations: RecordedCall[];
} {
  const queries: RecordedCall[] = [];
  const mutations: RecordedCall[] = [];
  const dispatch = async (
    kind: "query" | "mutation",
    log: RecordedCall[],
    ref: unknown,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const name = nameOf(ref);
    log.push({ name, args });
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected ${kind}: ${name}`);
    return handler(args);
  };
  return {
    queries,
    mutations,
    client: {
      query: (ref, args) => dispatch("query", queries, ref, args),
      mutation: (ref, args) => dispatch("mutation", mutations, ref, args),
    },
  };
}

/** Collect a full SSE Response body into decoded frames. */
export async function readSseFrames(response: Response): Promise<string[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame !== "");
}
