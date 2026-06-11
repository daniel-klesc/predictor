import { en } from "@/lib/strings/en";

/** Stub — the chat backend issue implements streaming via @anthropic-ai/sdk. */
export function POST(): Response {
  return Response.json({ error: en.api.notImplemented }, { status: 501 });
}
