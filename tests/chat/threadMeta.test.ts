/** Thread-list display helpers (title fallback + activity timestamp). */
import { describe, expect, it } from "vitest";

import { formatThreadTime, threadDisplayTitle } from "@/lib/chat/thread-meta";

describe("threadDisplayTitle", () => {
  it("falls back for the empty-title sentinel", () => {
    expect(threadDisplayTitle("", "New chat")).toBe("New chat");
    expect(threadDisplayTitle("   ", "New chat")).toBe("New chat");
  });

  it("trims and keeps real titles", () => {
    expect(threadDisplayTitle(" MEX–RSA ", "New chat")).toBe("MEX–RSA");
  });
});

describe("formatThreadTime", () => {
  // 2026-06-11 14:00 Europe/Prague (CEST, UTC+2)
  const now = Date.UTC(2026, 5, 11, 12, 0);

  it("shows the time for activity today (Prague day)", () => {
    expect(formatThreadTime(Date.UTC(2026, 5, 11, 8, 30), now)).toBe("10:30");
    // 23:30 UTC the previous date is already June 11 in Prague.
    expect(formatThreadTime(Date.UTC(2026, 5, 10, 23, 30), now)).toBe("01:30");
  });

  it("shows the day for older activity", () => {
    expect(formatThreadTime(Date.UTC(2026, 5, 9, 8, 30), now)).toBe(
      "Tue 9 Jun",
    );
  });
});
