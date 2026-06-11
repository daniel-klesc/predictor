/**
 * /api/chat request handler (wired by `app/api/chat/route.ts`).
 *
 * AUTH GATE FIRST: the Convex JWT from `Authorization: Bearer` is verified
 * by running a cheap authed ownership query (`chat.threadContext`) — an
 * invalid/expired token fails there and returns 401 BEFORE the Anthropic
 * client is even constructed (otherwise the endpoint is a free Claude
 * proxy). The user message was already persisted by the client via
 * `chat.sendUserMessage`; the body is just `{ threadId }`.
 *
 * Dependencies (Convex client factory, Anthropic client factory, env, clock)
 * are injected so tests can drive the full handler without the live API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import { en } from "@/lib/strings/en";

import {
  CHAT_SSE_HEADERS,
  type ChatStreamEvent,
  encodeChatEvent,
} from "./protocol";
import {
  type ChatModelClient,
  runChatTurn,
  safeChatErrorMessage,
} from "./stream";
import {
  buildContextBlock,
  buildModelMessages,
  type HistoryMessage,
  type MatchContext,
  SYSTEM_PROMPT,
} from "./system-prompt";
import {
  ALL_CHAT_TOOLS,
  type ConvexToolClient,
  executeChatTool,
} from "./tools";

/** Default model — override with the CHAT_MODEL env var. */
export const DEFAULT_CHAT_MODEL = "claude-opus-4-8";
/** Per-response output cap (issue spec). */
export const CHAT_MAX_TOKENS = 8000;
/** How many trailing thread messages are replayed to the model. */
const HISTORY_LIMIT = 30;

export interface ChatRouteDeps {
  convexUrl: string | undefined;
  anthropicApiKey: string | undefined;
  chatModel: string;
  createConvexClient(url: string, token: string): ConvexToolClient;
  createModelClient(apiKey: string): ChatModelClient;
  now(): number;
}

/** Production wiring — env + real Convex/Anthropic clients. */
export function defaultChatDeps(): ChatRouteDeps {
  return {
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
    // Server-only secret (Vercel env) — never NEXT_PUBLIC_*.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    chatModel: process.env.CHAT_MODEL ?? DEFAULT_CHAT_MODEL,
    createConvexClient: (url, token) => {
      const client = new ConvexHttpClient(url);
      client.setAuth(token);
      return {
        query: (reference, args) => client.query(reference, args),
        mutation: (reference, args) => client.mutation(reference, args),
      };
    },
    createModelClient: (apiKey) => {
      const client = new Anthropic({ apiKey });
      return { stream: (params) => client.messages.stream(params) };
    },
    now: () => Date.now(),
  };
}

/** Shape returned by `api.chat.threadContext`. */
interface ThreadContextPayload {
  threadId: string;
  title: string;
  match: MatchContext | null;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function handleChatRequest(
  request: Request,
  deps: ChatRouteDeps,
): Promise<Response> {
  // ---- Auth gate (before ANY Anthropic involvement) -----------------------
  const token = bearerToken(request);
  if (!token) return jsonError(401, en.chatApi.unauthorized);

  let threadIdInput: string;
  try {
    const body = (await request.json()) as { threadId?: unknown };
    if (typeof body?.threadId !== "string" || body.threadId === "") {
      return jsonError(400, en.chatApi.invalidRequest);
    }
    threadIdInput = body.threadId;
  } catch {
    return jsonError(400, en.chatApi.invalidRequest);
  }

  if (!deps.convexUrl) return jsonError(500, en.chatApi.notConfigured);
  const convex = deps.createConvexClient(deps.convexUrl, token);

  let context: ThreadContextPayload | null;
  try {
    context = (await convex.query(api.chat.threadContext, {
      threadId: threadIdInput,
    })) as ThreadContextPayload | null;
  } catch {
    // Invalid/expired token (or unauthenticated identity) — reject before
    // the Anthropic SDK is touched.
    return jsonError(401, en.chatApi.unauthorized);
  }
  if (!context) return jsonError(404, en.chatApi.threadNotFound);

  if (!deps.anthropicApiKey) return jsonError(500, en.chatApi.notConfigured);

  let history: HistoryMessage[] | null;
  try {
    history = (await convex.query(api.chat.recentMessages, {
      threadId: threadIdInput,
      limit: HISTORY_LIMIT,
    })) as HistoryMessage[] | null;
  } catch {
    return jsonError(401, en.chatApi.unauthorized);
  }
  if (!history) return jsonError(404, en.chatApi.threadNotFound);

  // The client persists the user message via chat.sendUserMessage BEFORE
  // POSTing here — without a trailing user message there is nothing to do.
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return jsonError(400, en.chatApi.noUserMessage);
  }

  // Volatile context (today's date, thread match) rides on the LAST user
  // turn — the system prompt + tool list prefix stays byte-stable for the
  // prompt cache.
  const contextBlock = buildContextBlock({
    now: deps.now(),
    match: context.match,
  });
  const modelMessages = buildModelMessages(history, contextBlock);
  if (!modelMessages) return jsonError(400, en.chatApi.noUserMessage);

  const model = deps.createModelClient(deps.anthropicApiKey);
  const threadId = context.threadId;
  const chatModel = deps.chatModel;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ChatStreamEvent): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeChatEvent(event)));
        } catch {
          // Client went away mid-stream; keep running so the turn persists.
          closed = true;
        }
      };

      void (async () => {
        try {
          const outcome = await runChatTurn({
            model,
            modelId: chatModel,
            maxTokens: CHAT_MAX_TOKENS,
            // Single cache breakpoint on the system block — tools render
            // before system, so this caches the tool list + system prompt.
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: ALL_CHAT_TOOLS,
            messages: modelMessages,
            executeTool: (name, input) => executeChatTool(convex, name, input),
            emit,
          });

          // Persist the assistant turn (or the partial text + error marker)
          // with the SAME user-authed Convex client.
          let persistFailed = false;
          if (outcome.text !== "" || outcome.blocks.length > 0) {
            try {
              await convex.mutation(api.chat.appendAssistantMessage, {
                threadId,
                text: outcome.text,
                blocks: outcome.blocks,
                usage: outcome.usage,
              });
            } catch {
              persistFailed = true;
            }
          }

          if (outcome.stopReason === "error") {
            emit({
              type: "error",
              message: outcome.errorMessage ?? en.chatApi.streamFailed,
            });
          } else if (persistFailed) {
            emit({ type: "error", message: en.chatApi.replyNotSaved });
          } else {
            emit({
              type: "done",
              stopReason: outcome.stopReason,
              usage: outcome.usage,
            });
          }
        } catch (error) {
          // Unexpected failure — client-safe message only (no stack, no key).
          emit({ type: "error", message: safeChatErrorMessage(error) });
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // Stream already closed by the runtime.
            }
          }
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { status: 200, headers: CHAT_SSE_HEADERS });
}
