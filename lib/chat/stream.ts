/**
 * The manual streaming tool loop for one assistant turn (chat backend #7).
 *
 * State machine per model call:
 * - stream text deltas / thinking indicators / server-tool progress to the
 *   client as SSE events while the response streams;
 * - `stop_reason === "tool_use"` → execute the custom tools against Convex,
 *   append the assistant content + tool_result blocks, loop;
 * - `stop_reason === "pause_turn"` (server-side web_search hit its iteration
 *   limit) → re-send with the paused assistant turn appended — NO synthetic
 *   user message — capped at MAX_PAUSE_CONTINUATIONS;
 * - any other stop reason → terminal.
 *
 * The engine never throws for stream failures: it returns the partial text
 * plus an error marker block so the route can persist what the user already
 * saw. Dependency-injected model client + tool executor keep it fully
 * testable without the live API.
 */
import Anthropic from "@anthropic-ai/sdk";

import { en } from "@/lib/strings/en";

import {
  type ChatStopReason,
  type ChatStreamEvent,
  type ChatUsage,
  EMPTY_USAGE,
  type StoredAssistantBlock,
} from "./protocol";
import type { ToolExecutionResult } from "./tools";

/** Anthropic MessageStream surface the engine needs (fakeable in tests). */
export interface ChatMessageStreamLike extends AsyncIterable<Anthropic.MessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Message>;
}

/** `client.messages` surface the engine needs (fakeable in tests). */
export interface ChatModelClient {
  stream(params: Anthropic.MessageStreamParams): ChatMessageStreamLike;
}

export interface ChatTurnOptions {
  model: ChatModelClient;
  modelId: string;
  maxTokens: number;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Messages.ToolUnion[];
  messages: Anthropic.MessageParam[];
  executeTool(name: string, input: unknown): Promise<ToolExecutionResult>;
  emit(event: ChatStreamEvent): void;
  /** Max pause_turn re-sends (default 5 per the issue spec). */
  maxPauseContinuations?: number;
  /** Safety cap on total model calls per turn (default 16). */
  maxIterations?: number;
}

export interface ChatTurnOutcome {
  /** Visible assistant text across all iterations (persisted). */
  text: string;
  /** Full content trace incl. tool_use/tool_result blocks (persisted). */
  blocks: StoredAssistantBlock[];
  /** Token usage summed across all model calls. */
  usage: ChatUsage;
  stopReason: ChatStopReason;
  /** Client-safe failure description when stopReason === "error". */
  errorMessage?: string;
}

export const MAX_PAUSE_CONTINUATIONS = 5;
const MAX_ITERATIONS = 16;
const SUMMARY_MAX_LENGTH = 200;

/** Client-safe error text — never the raw message, stack, or any secret. */
export function safeChatErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return en.chatApi.modelRequestFailed(
      String(error.status ?? "connection error"),
    );
  }
  return en.chatApi.streamFailed;
}

function truncate(text: string, maxLength: number = SUMMARY_MAX_LENGTH) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function summarizeArgs(input: unknown): string {
  try {
    return truncate(JSON.stringify(input) ?? "{}");
  } catch {
    return "{}";
  }
}

function summarizeWebSearchResult(
  content: Anthropic.WebSearchToolResultBlock["content"],
): string {
  if (Array.isArray(content)) {
    const titles = content
      .map((result) => result.title)
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
    return truncate(
      `${content.length} result${content.length === 1 ? "" : "s"}${titles ? `: ${titles}` : ""}`,
    );
  }
  return `search failed (${content.error_code})`;
}

function addUsage(total: ChatUsage, usage: Anthropic.Usage): void {
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
  total.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
}

function terminalStopReason(
  stopReason: Anthropic.StopReason | null,
): ChatStopReason {
  switch (stopReason) {
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}

/**
 * Run one assistant turn to completion. Resolves (never rejects) with the
 * persistable outcome; `messages` is not mutated.
 */
export async function runChatTurn(
  options: ChatTurnOptions,
): Promise<ChatTurnOutcome> {
  const maxPause = options.maxPauseContinuations ?? MAX_PAUSE_CONTINUATIONS;
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  const messages: Anthropic.MessageParam[] = [...options.messages];
  const blocks: StoredAssistantBlock[] = [];
  const textParts: string[] = [];
  const usage: ChatUsage = { ...EMPTY_USAGE };
  let pauseContinuations = 0;

  const outcome = (
    stopReason: ChatStopReason,
    errorMessage?: string,
  ): ChatTurnOutcome => ({
    text: textParts.join("\n\n"),
    blocks,
    usage,
    stopReason,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
  });

  for (let iteration = 0; ; iteration += 1) {
    if (iteration >= maxIterations) {
      blocks.push({ type: "error", message: en.chatApi.iterationLimitMarker });
      return outcome("iteration_limit");
    }

    // Adaptive thinking, NO sampling params (removed on claude-opus-4-8 —
    // sending temperature/top_p/top_k would 400).
    const stream = options.model.stream({
      model: options.modelId,
      max_tokens: options.maxTokens,
      thinking: { type: "adaptive" },
      system: options.system,
      tools: options.tools,
      messages,
    });

    let liveText = "";
    let final: Anthropic.Message;
    try {
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "thinking" || block.type === "redacted_thinking") {
            options.emit({ type: "thinking" });
          } else if (block.type === "server_tool_use") {
            options.emit({ type: "tool-start", name: block.name, args: "" });
          }
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          liveText += event.delta.text;
          options.emit({ type: "text-delta", text: event.delta.text });
        }
      }
      final = await stream.finalMessage();
    } catch (error) {
      // Persist whatever the user already saw, marked as interrupted.
      if (liveText) {
        textParts.push(liveText);
        blocks.push({ type: "text", text: liveText });
      }
      const message = safeChatErrorMessage(error);
      blocks.push({ type: "error", message });
      return outcome("error", message);
    }

    addUsage(usage, final.usage);

    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of final.content) {
      switch (block.type) {
        case "text":
          if (block.text) {
            textParts.push(block.text);
            blocks.push({ type: "text", text: block.text });
          }
          break;
        case "thinking":
        case "redacted_thinking":
          blocks.push({ type: "thinking" });
          break;
        case "tool_use":
          toolUses.push(block);
          blocks.push({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          });
          break;
        case "server_tool_use":
          blocks.push({
            type: "server_tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          });
          break;
        case "web_search_tool_result": {
          const summary = summarizeWebSearchResult(block.content);
          blocks.push({
            type: "web_search_tool_result",
            toolUseId: block.tool_use_id,
            summary,
          });
          options.emit({ type: "tool-result", name: "web_search", summary });
          break;
        }
        default:
          // Other server-side block types are not used by this app.
          break;
      }
    }

    if (final.stop_reason === "tool_use" && toolUses.length > 0) {
      messages.push({ role: "assistant", content: final.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        options.emit({
          type: "tool-start",
          name: toolUse.name,
          args: summarizeArgs(toolUse.input),
        });
        const result = await options.executeTool(toolUse.name, toolUse.input);
        options.emit({
          type: "tool-result",
          name: toolUse.name,
          summary: truncate(result.content),
          ...(result.isError ? { isError: true } : {}),
        });
        blocks.push({
          type: "tool_result",
          toolUseId: toolUse.id,
          name: toolUse.name,
          content: result.content,
          ...(result.isError ? { isError: true } : {}),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    if (final.stop_reason === "pause_turn") {
      if (pauseContinuations >= maxPause) {
        blocks.push({ type: "error", message: en.chatApi.pauseLimitMarker });
        return outcome("pause_limit");
      }
      pauseContinuations += 1;
      // Resume by re-sending with the paused assistant turn appended —
      // the API detects the trailing server_tool_use block and continues.
      messages.push({ role: "assistant", content: final.content });
      continue;
    }

    return outcome(terminalStopReason(final.stop_reason));
  }
}
