/**
 * Manual-loop state machine tests with scripted fake streams: the tool_use
 * round trip, pause_turn continuation semantics (no synthetic user message,
 * capped at 5), mid-stream failure persistence, and the exact request params
 * (claude-opus-4-8, adaptive thinking, max_tokens, NO sampling params).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import type { ChatStreamEvent } from "@/lib/chat/protocol";
import {
  type ChatTurnOptions,
  MAX_PAUSE_CONTINUATIONS,
  runChatTurn,
} from "@/lib/chat/stream";
import type { ToolExecutionResult } from "@/lib/chat/tools";

import {
  blockStartEvent,
  failingStream,
  fakeStream,
  makeMessage,
  scriptedModel,
  serverToolUseBlock,
  textBlock,
  textDeltaEvent,
  thinkingBlock,
  toolUseBlock,
  webSearchResultBlock,
} from "./fakes";

const SYSTEM: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: "system prompt",
    cache_control: { type: "ephemeral" },
  },
];
const TOOLS: Anthropic.Messages.ToolUnion[] = [
  {
    name: "get_value_bets",
    description: "test",
    input_schema: { type: "object" },
  },
];
const USER_MESSAGES: Anthropic.MessageParam[] = [
  { role: "user", content: "What are today's value bets?" },
];

function baseOptions(
  model: ChatTurnOptions["model"],
  emit: (event: ChatStreamEvent) => void,
  executeTool?: ChatTurnOptions["executeTool"],
): ChatTurnOptions {
  return {
    model,
    modelId: "claude-opus-4-8",
    maxTokens: 8000,
    system: SYSTEM,
    tools: TOOLS,
    messages: USER_MESSAGES,
    executeTool:
      executeTool ??
      (() =>
        Promise.resolve<ToolExecutionResult>({
          content: '{"ok":true}',
          isError: false,
        })),
    emit,
  };
}

describe("runChatTurn request params", () => {
  it("sends claude-opus-4-8 + adaptive thinking + cached system, no sampling params", async () => {
    const { client, calls } = scriptedModel([
      fakeStream([], makeMessage([textBlock("Hi")], "end_turn")),
    ]);
    await runChatTurn(baseOptions(client, () => {}));
    expect(calls).toHaveLength(1);
    const params = calls[0] as unknown as Record<string, unknown>;
    expect(params.model).toBe("claude-opus-4-8");
    expect(params.max_tokens).toBe(8000);
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
    expect(params).not.toHaveProperty("top_k");
    expect(params.system).toBe(SYSTEM);
    expect(params.tools).toBe(TOOLS);
    expect(params.messages).toEqual(USER_MESSAGES);
  });
});

describe("runChatTurn tool loop", () => {
  it("streams text, executes the tool, and continues to end_turn", async () => {
    const toolUse = toolUseBlock("toolu_1", "get_value_bets", {
      minEdge: 0.03,
    });
    const { client, calls } = scriptedModel([
      fakeStream(
        [textDeltaEvent("Let me "), textDeltaEvent("check.")],
        makeMessage([textBlock("Let me check."), toolUse], "tool_use", {
          input_tokens: 100,
          output_tokens: 20,
        }),
      ),
      fakeStream(
        [textDeltaEvent("Two value bets today.")],
        makeMessage([textBlock("Two value bets today.")], "end_turn", {
          input_tokens: 300,
          output_tokens: 30,
          cache_read_input_tokens: 250,
        }),
      ),
    ]);
    const events: ChatStreamEvent[] = [];
    const executeTool = vi.fn(() =>
      Promise.resolve({ content: '{"count":2}', isError: false }),
    );
    const outcome = await runChatTurn(
      baseOptions(client, (event) => events.push(event), executeTool),
    );

    // Tool executed with the model's input.
    expect(executeTool).toHaveBeenCalledExactlyOnceWith("get_value_bets", {
      minEdge: 0.03,
    });

    // Second request: assistant content + tool_result appended, original
    // user message untouched.
    expect(calls).toHaveLength(2);
    const secondMessages = calls[1].messages;
    expect(secondMessages).toHaveLength(3);
    expect(secondMessages[0]).toEqual(USER_MESSAGES[0]);
    expect(secondMessages[1].role).toBe("assistant");
    expect(secondMessages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: '{"count":2}',
        },
      ],
    });

    // SSE event order: deltas → tool-start → tool-result → deltas.
    expect(events.map((event) => event.type)).toEqual([
      "text-delta",
      "text-delta",
      "tool-start",
      "tool-result",
      "text-delta",
    ]);
    expect(events[2]).toEqual({
      type: "tool-start",
      name: "get_value_bets",
      args: '{"minEdge":0.03}',
    });

    // Outcome: joined text, full block trace, summed usage.
    expect(outcome.stopReason).toBe("end_turn");
    expect(outcome.text).toBe("Let me check.\n\nTwo value bets today.");
    expect(outcome.blocks.map((block) => block.type)).toEqual([
      "text",
      "tool_use",
      "tool_result",
      "text",
    ]);
    expect(outcome.usage).toEqual({
      inputTokens: 400,
      outputTokens: 50,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 250,
    });
    // Caller's message array is never mutated.
    expect(USER_MESSAGES).toHaveLength(1);
  });

  it("feeds tool failures back as is_error tool_results", async () => {
    const toolUse = toolUseBlock("toolu_9", "get_odds", { matchNumber: 999 });
    const { client, calls } = scriptedModel([
      fakeStream([], makeMessage([toolUse], "tool_use")),
      fakeStream([], makeMessage([textBlock("No such match.")], "end_turn")),
    ]);
    const events: ChatStreamEvent[] = [];
    const outcome = await runChatTurn(
      baseOptions(
        client,
        (event) => events.push(event),
        () =>
          Promise.resolve({ content: '{"error":"no match"}', isError: true }),
      ),
    );
    const toolResultMessage = calls[1].messages[2]
      .content as Anthropic.ToolResultBlockParam[];
    expect(toolResultMessage[0].is_error).toBe(true);
    expect(events.find((event) => event.type === "tool-result")).toMatchObject({
      isError: true,
    });
    expect(outcome.blocks).toContainEqual({
      type: "tool_result",
      toolUseId: "toolu_9",
      name: "get_odds",
      content: '{"error":"no match"}',
      isError: true,
    });
  });
});

describe("runChatTurn pause_turn", () => {
  it("re-sends with the paused assistant turn appended — no synthetic user message", async () => {
    const paused = makeMessage(
      [
        textBlock("Searching…"),
        serverToolUseBlock("srvtoolu_1", { query: "MEX injuries" }),
      ],
      "pause_turn",
      { input_tokens: 100, output_tokens: 40 },
    );
    const finished = makeMessage(
      [
        webSearchResultBlock("srvtoolu_1", ["Team news", "Injury report"]),
        textBlock("Here is the news."),
      ],
      "end_turn",
      { input_tokens: 200, output_tokens: 60 },
    );
    const { client, calls } = scriptedModel([
      fakeStream(
        [blockStartEvent(serverToolUseBlock("srvtoolu_1", {}))],
        paused,
      ),
      fakeStream([], finished),
    ]);
    const events: ChatStreamEvent[] = [];
    const outcome = await runChatTurn(
      baseOptions(client, (event) => events.push(event)),
    );

    expect(calls).toHaveLength(2);
    const secondMessages = calls[1].messages;
    // Exactly one message appended: the paused assistant turn.
    expect(secondMessages).toHaveLength(2);
    expect(secondMessages[1]).toEqual({
      role: "assistant",
      content: paused.content,
    });

    // Live tool-start for the server tool + summary after the result block.
    expect(events).toContainEqual({
      type: "tool-start",
      name: "web_search",
      args: "",
    });
    expect(events).toContainEqual({
      type: "tool-result",
      name: "web_search",
      summary: "2 results: Team news; Injury report",
    });

    expect(outcome.stopReason).toBe("end_turn");
    expect(outcome.usage.inputTokens).toBe(300);
    expect(outcome.blocks.map((block) => block.type)).toEqual([
      "text",
      "server_tool_use",
      "web_search_tool_result",
      "text",
    ]);
  });

  it("caps pause_turn continuations at 5 and persists an error marker", async () => {
    const pausedStream = () =>
      fakeStream(
        [],
        makeMessage([serverToolUseBlock("srvtoolu_n", {})], "pause_turn", {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
    // 1 initial call + 5 continuations = 6 streams; a 7th must never happen.
    const { client, calls } = scriptedModel(
      Array.from({ length: 7 }, () => pausedStream()),
    );
    const outcome = await runChatTurn(baseOptions(client, () => {}));
    expect(MAX_PAUSE_CONTINUATIONS).toBe(5);
    expect(calls).toHaveLength(1 + MAX_PAUSE_CONTINUATIONS);
    expect(outcome.stopReason).toBe("pause_limit");
    const lastBlock = outcome.blocks[outcome.blocks.length - 1];
    expect(lastBlock.type).toBe("error");
  });
});

describe("runChatTurn failure handling", () => {
  it("keeps partial text + error marker when the stream dies mid-way", async () => {
    const { client } = scriptedModel([
      failingStream(
        [textDeltaEvent("Partial ans"), textDeltaEvent("wer so far")],
        new Error("socket hang up"),
      ),
    ]);
    const events: ChatStreamEvent[] = [];
    const outcome = await runChatTurn(
      baseOptions(client, (event) => events.push(event)),
    );

    expect(outcome.stopReason).toBe("error");
    expect(outcome.errorMessage).toBeTruthy();
    // Raw error details never leak into the client-safe message.
    expect(outcome.errorMessage).not.toContain("socket hang up");
    expect(outcome.text).toBe("Partial answer so far");
    expect(outcome.blocks).toEqual([
      { type: "text", text: "Partial answer so far" },
      { type: "error", message: outcome.errorMessage },
    ]);
    // The user saw the partial deltas live.
    expect(events.map((event) => event.type)).toEqual([
      "text-delta",
      "text-delta",
    ]);
  });

  it("stops at the iteration safety cap", async () => {
    const toolStream = () =>
      fakeStream(
        [],
        makeMessage(
          [toolUseBlock("toolu_loop", "get_value_bets", {})],
          "tool_use",
        ),
      );
    const { client, calls } = scriptedModel(
      Array.from({ length: 10 }, () => toolStream()),
    );
    const outcome = await runChatTurn({
      ...baseOptions(client, () => {}),
      maxIterations: 3,
    });
    expect(calls).toHaveLength(3);
    expect(outcome.stopReason).toBe("iteration_limit");
  });

  it("emits a thinking indicator and stores a redacted marker", async () => {
    const { client } = scriptedModel([
      fakeStream(
        [blockStartEvent(thinkingBlock()), textDeltaEvent("Answer")],
        makeMessage([thinkingBlock(), textBlock("Answer")], "end_turn"),
      ),
    ]);
    const events: ChatStreamEvent[] = [];
    const outcome = await runChatTurn(
      baseOptions(client, (event) => events.push(event)),
    );
    expect(events[0]).toEqual({ type: "thinking" });
    expect(outcome.blocks[0]).toEqual({ type: "thinking" });
    // Thinking content/signature is never persisted.
    expect(JSON.stringify(outcome.blocks)).not.toContain("sig");
  });
});
