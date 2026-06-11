/** Shared helpers for sync actions. */

/** Fetch a URL and return its body as text; throws a descriptive error on non-2xx. */
export async function fetchText(
  url: string,
  init?: RequestInit,
): Promise<string> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `fetch failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }
  return await response.text();
}

/** Fetch a URL and parse its body as JSON; throws a descriptive error on non-2xx. */
export async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `fetch failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }
  return await response.json();
}

/** Render an unknown thrown value as a bounded string for syncAudit.error. */
export function errorMessage(error: unknown, maxLength = 4000): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > maxLength
    ? `${message.slice(0, maxLength)}…`
    : message;
}
