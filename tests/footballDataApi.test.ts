import { describe, expect, it } from "vitest";

import {
  type FdScore,
  fdScoreToScore,
  normalizeFdStatus,
  pairingKey,
  resolveFdTeamCode,
  utcDayOf,
} from "@/convex/lib/footballDataApi";

describe("normalizeFdStatus", () => {
  it("maps football-data statuses onto the normalized vocabulary", () => {
    expect(normalizeFdStatus("SCHEDULED")).toBe("scheduled");
    expect(normalizeFdStatus("TIMED")).toBe("scheduled");
    expect(normalizeFdStatus("IN_PLAY")).toBe("live");
    expect(normalizeFdStatus("PAUSED")).toBe("live");
    expect(normalizeFdStatus("SUSPENDED")).toBe("live");
    expect(normalizeFdStatus("FINISHED")).toBe("finished");
    expect(normalizeFdStatus("AWARDED")).toBe("finished");
    expect(normalizeFdStatus("POSTPONED")).toBe("postponed");
    expect(normalizeFdStatus("CANCELLED")).toBe("cancelled");
    expect(normalizeFdStatus("SOMETHING_NEW")).toBe("scheduled");
  });
});

describe("fdScoreToScore", () => {
  it("returns undefined while no full-time score exists", () => {
    expect(fdScoreToScore(undefined)).toBeUndefined();
    expect(
      fdScoreToScore({
        winner: null,
        duration: "REGULAR",
        fullTime: { home: null, away: null },
      }),
    ).toBeUndefined();
  });

  it("extracts a regular-time score", () => {
    const score: FdScore = {
      winner: "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: 2, away: 1 },
      halfTime: { home: 1, away: 0 },
    };
    expect(fdScoreToScore(score)).toEqual({
      home: 2,
      away: 1,
      duration: "regular",
    });
  });

  it("extracts extra time and penalties", () => {
    const score: FdScore = {
      winner: "AWAY_TEAM",
      duration: "PENALTY_SHOOTOUT",
      fullTime: { home: 1, away: 1 },
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 0, away: 0 },
      penalties: { home: 3, away: 4 },
    };
    expect(fdScoreToScore(score)).toEqual({
      home: 1,
      away: 1,
      regulationHome: 1,
      regulationAway: 1,
      extraTimeHome: 0,
      extraTimeAway: 0,
      penaltiesHome: 3,
      penaltiesAway: 4,
      duration: "penalties",
    });
  });
});

describe("resolveFdTeamCode", () => {
  it("prefers the tla when it is a FIFA trigram", () => {
    expect(
      resolveFdTeamCode({ id: 1, name: "Korea Republic", tla: "KOR" }),
    ).toBe("KOR");
  });

  it("falls back to name / shortName via the alias map", () => {
    expect(
      resolveFdTeamCode({ id: 1, name: "Czech Republic", tla: null }),
    ).toBe("CZE");
    expect(
      resolveFdTeamCode({ id: 1, name: null, shortName: "United States" }),
    ).toBe("USA");
  });

  it("returns null for TBD slots and unresolvable names (log + skip)", () => {
    expect(resolveFdTeamCode(undefined)).toBeNull();
    expect(resolveFdTeamCode({ id: null, name: null })).toBeNull();
    expect(
      resolveFdTeamCode({ id: 9, name: "Atlantis", tla: "ATL" }),
    ).toBeNull();
  });
});

describe("pairingKey", () => {
  it("is order-independent and keyed by UTC day", () => {
    const kickoff = Date.UTC(2026, 5, 11, 19, 0, 0);
    expect(pairingKey(kickoff, "MEX", "RSA")).toBe("2026-06-11:MEX:RSA");
    expect(pairingKey(kickoff, "RSA", "MEX")).toBe("2026-06-11:MEX:RSA");
  });

  it("uses the UTC calendar day even for late-night local kickoffs", () => {
    expect(utcDayOf(Date.UTC(2026, 5, 12, 2, 0, 0))).toBe("2026-06-12");
  });
});
