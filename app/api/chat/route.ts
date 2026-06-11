/**
 * Streaming chat endpoint (issue #7). Transport is a Next.js route handler
 * because Convex actions cannot stream tokens; the handler logic (auth gate,
 * manual tool loop, SSE protocol, persistence) lives in `lib/chat/handler`.
 */
import { defaultChatDeps, handleChatRequest } from "@/lib/chat/handler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  return handleChatRequest(request, defaultChatDeps());
}
