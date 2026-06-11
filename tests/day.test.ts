import { describe, expect, it } from "vitest";

import {
  dayKeyInZone,
  dayRangeInZone,
  groupByDay,
  nextDayKey,
  startOfDayKey,
} from "@/lib/day";

// Live fixtures: opener Mexico–South Africa kicks off 2026-06-11T19:00Z
// (21:00 Prague); match #2 kicks off 2026-06-12T02:00Z — still the evening
// of June 11 in Guadalajara but already June 12 in Prague.
const OPENER_KICKOFF = Date.UTC(2026, 5, 11, 19, 0);
const MATCH2_KICKOFF = Date.UTC(2026, 5, 12, 2, 0);

describe("dayKeyInZone (Europe/Prague)", () => {
  it("buckets an evening kickoff into the local day", () => {
    expect(dayKeyInZone(OPENER_KICKOFF)).toBe("2026-06-11");
  });

  it("rolls a late-UTC kickoff into the NEXT Prague day", () => {
    // 02:00 UTC = 04:00 CEST — June 12 in Prague despite the venue's June 11.
    expect(dayKeyInZone(MATCH2_KICKOFF)).toBe("2026-06-12");
  });

  it("keeps a just-before-midnight kickoff on the same Prague day", () => {
    // 21:59:59 UTC = 23:59:59 CEST.
    expect(dayKeyInZone(Date.UTC(2026, 5, 11, 21, 59, 59))).toBe("2026-06-11");
    expect(dayKeyInZone(Date.UTC(2026, 5, 11, 22, 0, 0))).toBe("2026-06-12");
  });
});

describe("dayRangeInZone (Europe/Prague)", () => {
  it("computes the UTC range of a CEST summer day", () => {
    const range = dayRangeInZone(OPENER_KICKOFF);
    expect(range.start).toBe(Date.UTC(2026, 5, 10, 22, 0)); // 00:00 CEST
    expect(range.end).toBe(Date.UTC(2026, 5, 11, 22, 0));
    expect(range.end - range.start).toBe(24 * 60 * 60 * 1000);
  });

  it("handles the 25-hour fall-back day (DST ends 2026-10-25)", () => {
    const range = dayRangeInZone(Date.UTC(2026, 9, 25, 12, 0));
    expect(range.start).toBe(Date.UTC(2026, 9, 24, 22, 0)); // 00:00 CEST
    expect(range.end).toBe(Date.UTC(2026, 9, 25, 23, 0)); // 00:00 CET
    expect(range.end - range.start).toBe(25 * 60 * 60 * 1000);
  });

  it("handles the 23-hour spring-forward day (DST starts 2026-03-29)", () => {
    const range = dayRangeInZone(Date.UTC(2026, 2, 29, 12, 0));
    expect(range.end - range.start).toBe(23 * 60 * 60 * 1000);
  });
});

describe("startOfDayKey / nextDayKey", () => {
  it("round-trips a day key to its UTC start", () => {
    expect(startOfDayKey("2026-06-11")).toBe(Date.UTC(2026, 5, 10, 22, 0));
  });

  it("increments across month boundaries with plain date math", () => {
    expect(nextDayKey("2026-06-30")).toBe("2026-07-01");
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
  });
});

describe("groupByDay", () => {
  it("buckets and orders items by local Prague day", () => {
    const items = [
      { id: "late", at: MATCH2_KICKOFF },
      { id: "opener", at: OPENER_KICKOFF },
      { id: "evening12", at: Date.UTC(2026, 5, 12, 19, 0) },
    ];
    const days = groupByDay(items, (item) => item.at);
    expect(days.map((day) => day.key)).toEqual(["2026-06-11", "2026-06-12"]);
    expect(days[0].items.map((item) => item.id)).toEqual(["opener"]);
    // The 02:00 UTC match groups with June 12 and sorts before the evening one.
    expect(days[1].items.map((item) => item.id)).toEqual(["late", "evening12"]);
    expect(days[0].start).toBe(Date.UTC(2026, 5, 10, 22, 0));
  });

  it("returns no groups for no items", () => {
    expect(groupByDay([], () => 0)).toEqual([]);
  });
});
