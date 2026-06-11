import { describe, expect, it } from "vitest";

import {
  KICKED_OFF_WINDOW_MS,
  UPCOMING_WINDOW_MS,
  shouldPollResults,
} from "@/convex/lib/resultsGuard";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 5, 11, 20, 0, 0);

describe("shouldPollResults", () => {
  it("true when any match is live", () => {
    const matches = [
      { status: "finished", kickoffAt: NOW - 6 * HOUR },
      { status: "live", kickoffAt: NOW - 1 * HOUR },
    ];
    expect(shouldPollResults(matches, NOW)).toBe(true);
  });

  it("true when a match kicked off less than 3.5h ago (status lagging)", () => {
    expect(
      shouldPollResults(
        [{ status: "scheduled", kickoffAt: NOW - 2 * HOUR }],
        NOW,
      ),
    ).toBe(true);
    // boundary: just inside the window
    expect(
      shouldPollResults(
        [{ status: "scheduled", kickoffAt: NOW - KICKED_OFF_WINDOW_MS + 1 }],
        NOW,
      ),
    ).toBe(true);
  });

  it("true when a match kicks off in less than 15 minutes", () => {
    expect(
      shouldPollResults(
        [{ status: "scheduled", kickoffAt: NOW + 10 * MINUTE }],
        NOW,
      ),
    ).toBe(true);
    // boundary: just inside the window
    expect(
      shouldPollResults(
        [{ status: "scheduled", kickoffAt: NOW + UPCOMING_WINDOW_MS - 1 }],
        NOW,
      ),
    ).toBe(true);
  });

  it("false otherwise — no-op with zero API calls", () => {
    const matches = [
      { status: "scheduled", kickoffAt: NOW + 2 * HOUR }, // too far out
      { status: "scheduled", kickoffAt: NOW + UPCOMING_WINDOW_MS }, // exactly 15min
      { status: "scheduled", kickoffAt: NOW - KICKED_OFF_WINDOW_MS }, // exactly 3.5h ago
      { status: "finished", kickoffAt: NOW - 5 * HOUR },
    ];
    expect(shouldPollResults(matches, NOW)).toBe(false);
  });

  it("false for an empty schedule", () => {
    expect(shouldPollResults([], NOW)).toBe(false);
  });

  it("never polls for matches in a terminal state, even inside the windows", () => {
    expect(
      shouldPollResults(
        [{ status: "finished", kickoffAt: NOW - 2 * HOUR }],
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldPollResults(
        [{ status: "postponed", kickoffAt: NOW + 5 * MINUTE }],
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldPollResults(
        [{ status: "cancelled", kickoffAt: NOW - 1 * HOUR }],
        NOW,
      ),
    ).toBe(false);
  });
});
