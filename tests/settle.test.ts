import { describe, expect, it } from "vitest";

import {
  decideBet,
  ninetyMinuteScore,
  roundPayout,
  settleBet,
} from "@/convex/lib/settle";

describe("ninetyMinuteScore", () => {
  it("returns the full score for matches decided in 90 minutes", () => {
    expect(ninetyMinuteScore({ home: 2, away: 1 })).toEqual({
      home: 2,
      away: 1,
    });
  });

  it("returns the regulation score when extra time happened", () => {
    expect(
      ninetyMinuteScore({
        home: 3,
        away: 2,
        regulationHome: 1,
        regulationAway: 1,
      }),
    ).toEqual({ home: 1, away: 1 });
  });
});

describe("decideBet — 1X2 (h2h)", () => {
  it("settles group matches from the full-time score", () => {
    expect(decideBet({ home: 2, away: 0 }, "h2h", "home")).toBe("won");
    expect(decideBet({ home: 2, away: 0 }, "h2h", "draw")).toBe("lost");
    expect(decideBet({ home: 2, away: 0 }, "h2h", "away")).toBe("lost");
    expect(decideBet({ home: 1, away: 1 }, "h2h", "draw")).toBe("won");
    expect(decideBet({ home: 0, away: 2 }, "h2h", "away")).toBe("won");
  });

  it("settles knockout 1X2 on the 90-minute result — draw wins despite an extra-time winner", () => {
    // 1–1 after 90, 2–1 after extra time: the 1X2 draw is the winning pick.
    const knockout = {
      home: 2,
      away: 1,
      regulationHome: 1,
      regulationAway: 1,
    };
    expect(decideBet(knockout, "h2h", "draw")).toBe("won");
    expect(decideBet(knockout, "h2h", "home")).toBe("lost");
    expect(decideBet(knockout, "h2h", "away")).toBe("lost");
  });

  it("rejects unknown selections", () => {
    expect(decideBet({ home: 1, away: 0 }, "h2h", "banker")).toBeNull();
  });
});

describe("decideBet — Over/Under 2.5 (totals25)", () => {
  it("is push-free: 2 goals → under, 3 goals → over", () => {
    expect(decideBet({ home: 1, away: 1 }, "totals25", "under")).toBe("won");
    expect(decideBet({ home: 1, away: 1 }, "totals25", "over")).toBe("lost");
    expect(decideBet({ home: 2, away: 1 }, "totals25", "over")).toBe("won");
    expect(decideBet({ home: 2, away: 1 }, "totals25", "under")).toBe("lost");
    expect(decideBet({ home: 0, away: 0 }, "totals25", "under")).toBe("won");
    expect(decideBet({ home: 4, away: 3 }, "totals25", "over")).toBe("won");
  });

  it("ignores extra-time goals (settles on the 90-minute score)", () => {
    // 1–1 after 90 (total 2), 2–1 AET — the under still wins.
    const knockout = {
      home: 2,
      away: 1,
      regulationHome: 1,
      regulationAway: 1,
    };
    expect(decideBet(knockout, "totals25", "under")).toBe("won");
    expect(decideBet(knockout, "totals25", "over")).toBe("lost");
  });

  it("rejects unknown selections", () => {
    expect(decideBet({ home: 1, away: 0 }, "totals25", "exactly")).toBeNull();
  });
});

describe("decideBet — BTTS", () => {
  it("yes wins when both teams scored in 90 minutes", () => {
    expect(decideBet({ home: 1, away: 1 }, "btts", "yes")).toBe("won");
    expect(decideBet({ home: 1, away: 1 }, "btts", "no")).toBe("lost");
    expect(decideBet({ home: 2, away: 0 }, "btts", "no")).toBe("won");
    expect(decideBet({ home: 2, away: 0 }, "btts", "yes")).toBe("lost");
    expect(decideBet({ home: 0, away: 0 }, "btts", "no")).toBe("won");
  });

  it("ignores an extra-time-only goal by the second team", () => {
    // 2–0 after 90, 2–1 AET — BTTS yes still loses.
    const knockout = {
      home: 2,
      away: 1,
      regulationHome: 2,
      regulationAway: 0,
    };
    expect(decideBet(knockout, "btts", "yes")).toBe("lost");
    expect(decideBet(knockout, "btts", "no")).toBe("won");
  });
});

describe("decideBet — unknown markets", () => {
  it("returns null instead of guessing (manual settlement)", () => {
    expect(decideBet({ home: 1, away: 0 }, "outright", "ESP")).toBeNull();
    expect(decideBet({ home: 1, away: 0 }, "totals15", "over")).toBeNull();
  });
});

describe("settleBet — full decision incl. match status", () => {
  const bet = { market: "h2h", selection: "home", odds: 1.95, stake: 300 };

  it("voids placed bets on postponed/cancelled matches, stake back", () => {
    expect(settleBet(bet, { status: "postponed" })).toEqual({
      status: "void",
      payout: 300,
    });
    expect(settleBet(bet, { status: "cancelled" })).toEqual({
      status: "void",
      payout: 300,
    });
  });

  it("pays stake × odds on a win and zero on a loss", () => {
    expect(
      settleBet(bet, { status: "finished", score: { home: 2, away: 0 } }),
    ).toEqual({ status: "won", payout: 585 });
    expect(
      settleBet(bet, { status: "finished", score: { home: 0, away: 2 } }),
    ).toEqual({ status: "lost", payout: 0 });
  });

  it("rounds payouts to 2 decimals", () => {
    expect(
      settleBet(
        { market: "h2h", selection: "home", odds: 1.95, stake: 333.33 },
        { status: "finished", score: { home: 1, away: 0 } },
      ),
    ).toEqual({ status: "won", payout: 649.99 });
  });

  it("leaves bets alone while no final state/score exists", () => {
    expect(settleBet(bet, { status: "scheduled" })).toBeNull();
    expect(
      settleBet(bet, { status: "live", score: { home: 1, away: 0 } }),
    ).toBeNull();
    expect(settleBet(bet, { status: "finished" })).toBeNull();
    expect(settleBet(bet, { status: "finished", score: null })).toBeNull();
  });

  it("leaves unknown markets alone even on finished matches", () => {
    expect(
      settleBet(
        { market: "outright", selection: "ESP", odds: 6.5, stake: 100 },
        { status: "finished", score: { home: 1, away: 0 } },
      ),
    ).toBeNull();
  });

  it("treats a missing stake as zero (defensive)", () => {
    expect(
      settleBet(
        { market: "h2h", selection: "home", odds: 2 },
        { status: "finished", score: { home: 1, away: 0 } },
      ),
    ).toEqual({ status: "won", payout: 0 });
  });
});

describe("roundPayout", () => {
  it("kills float dust", () => {
    expect(roundPayout(649.9935)).toBe(649.99);
    expect(roundPayout(0.1 + 0.2)).toBe(0.3);
  });
});
