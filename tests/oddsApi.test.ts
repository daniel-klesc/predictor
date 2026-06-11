import { describe, expect, it } from "vitest";

import {
  type MatchInfo,
  type OddsApiEvent,
  buildOddsSnapshots,
  buildOutrightPrices,
  computeBest,
  computeMedian,
  median,
  parseEventBookmakers,
  pickOutrightSportKey,
} from "@/convex/lib/oddsApi";

/** Realistic fixture: Mexico vs South Africa with three EU bookmakers. */
const EVENT: OddsApiEvent = {
  id: "e912304de2b2ce35b473ce2ecd3d1502",
  sport_key: "soccer_fifa_world_cup",
  commence_time: "2026-06-12T19:00:00Z",
  home_team: "Mexico",
  away_team: "South Africa",
  bookmakers: [
    {
      key: "pinnacle",
      title: "Pinnacle",
      last_update: "2026-06-12T18:00:00Z",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Mexico", price: 1.85 },
            { name: "South Africa", price: 4.6 },
            { name: "Draw", price: 3.5 },
          ],
        },
        {
          key: "totals",
          outcomes: [
            { name: "Over", price: 1.95, point: 2.5 },
            { name: "Under", price: 1.87, point: 2.5 },
          ],
        },
      ],
    },
    {
      key: "unibet_eu",
      title: "Unibet",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Mexico", price: 1.8 },
            { name: "Draw", price: 3.6 },
            { name: "South Africa", price: 4.4 },
          ],
        },
        {
          key: "totals",
          outcomes: [
            { name: "Over", price: 2.0, point: 2.5 },
            { name: "Under", price: 1.8, point: 2.5 },
            { name: "Over", price: 1.5, point: 1.5 },
            { name: "Under", price: 2.4, point: 1.5 },
          ],
        },
      ],
    },
    {
      // h2h only — no totals offered.
      key: "bet365",
      title: "Bet365",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Mexico", price: 1.9 },
            { name: "Draw", price: 3.4 },
            { name: "South Africa", price: 4.5 },
          ],
        },
      ],
    },
  ],
};

const KICKOFF = Date.parse("2026-06-12T19:00:00Z");

describe("median", () => {
  it("picks the middle value for odd counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5])).toBe(5);
  });

  it("averages the two middle values for even counts", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([1.8, 2.0])).toBe(1.9);
  });
});

describe("parseEventBookmakers", () => {
  it("extracts h2h lines keyed by the event's team names", () => {
    const bookmakers = parseEventBookmakers(EVENT);
    expect(bookmakers).toHaveLength(3);
    expect(bookmakers[0]).toMatchObject({
      key: "pinnacle",
      title: "Pinnacle",
      h2h: { home: 1.85, draw: 3.5, away: 4.6 },
    });
    expect(bookmakers[0].lastUpdateAt).toBe(Date.parse("2026-06-12T18:00:00Z"));
  });

  it("groups totals outcomes by point and sorts by line", () => {
    const unibet = parseEventBookmakers(EVENT)[1];
    expect(unibet.totals).toEqual([
      { point: 1.5, over: 1.5, under: 2.4 },
      { point: 2.5, over: 2.0, under: 1.8 },
    ]);
  });

  it("keeps h2h-only bookmakers and drops incomplete h2h markets", () => {
    const bookmakers = parseEventBookmakers(EVENT);
    expect(bookmakers[2].h2h).toEqual({ home: 1.9, draw: 3.4, away: 4.5 });
    expect(bookmakers[2].totals).toBeUndefined();

    const incomplete = parseEventBookmakers({
      ...EVENT,
      bookmakers: [
        {
          key: "partial",
          markets: [
            {
              key: "h2h",
              // Missing the away price — must be dropped, not guessed.
              outcomes: [
                { name: "Mexico", price: 1.9 },
                { name: "Draw", price: 3.4 },
              ],
            },
          ],
        },
      ],
    });
    expect(incomplete).toHaveLength(0);
  });
});

describe("computeBest", () => {
  it("takes the max price per outcome with the bookmaker offering it", () => {
    const best = computeBest(parseEventBookmakers(EVENT));
    expect(best?.h2h).toEqual({
      home: 1.9,
      homeBookmaker: "Bet365",
      draw: 3.6,
      drawBookmaker: "Unibet",
      away: 4.6,
      awayBookmaker: "Pinnacle",
    });
  });

  it("includes the over/under 2.5 line when present", () => {
    const best = computeBest(parseEventBookmakers(EVENT));
    expect(best?.totals25).toEqual({
      over: 2.0,
      overBookmaker: "Unibet",
      under: 1.87,
      underBookmaker: "Pinnacle",
    });
  });

  it("is undefined with no parseable lines", () => {
    expect(computeBest([])).toBeUndefined();
  });
});

describe("computeMedian", () => {
  it("computes the consensus h2h line across bookmakers", () => {
    const med = computeMedian(parseEventBookmakers(EVENT));
    // home [1.8, 1.85, 1.9], draw [3.4, 3.5, 3.6], away [4.4, 4.5, 4.6]
    expect(med?.h2h).toEqual({ home: 1.85, draw: 3.5, away: 4.5 });
  });

  it("computes the 2.5 totals median only over bookmakers pricing that line", () => {
    const med = computeMedian(parseEventBookmakers(EVENT));
    // over [1.95, 2.0] → 1.975, under [1.87, 1.8] → 1.835 (Bet365 has no totals)
    expect(med?.totals25?.over).toBeCloseTo(1.975, 10);
    expect(med?.totals25?.under).toBeCloseTo(1.835, 10);
  });

  it("is undefined with no parseable lines", () => {
    expect(computeMedian([])).toBeUndefined();
  });
});

describe("buildOddsSnapshots", () => {
  const MATCHES: MatchInfo[] = [
    { id: "m1", kickoffAt: KICKOFF, homeCode: "MEX", awayCode: "RSA" },
  ];

  it("pairs an event to its match via the alias map and plans one snapshot", () => {
    const build = buildOddsSnapshots([EVENT], MATCHES, 1234);
    expect(build.snapshots).toHaveLength(1);
    expect(build.snapshots[0]).toMatchObject({
      matchId: "m1",
      oddsApiEventId: EVENT.id,
      fetchedAt: 1234,
    });
    expect(build.snapshots[0].bookmakers).toHaveLength(3);
    expect(build.snapshots[0].best?.h2h?.home).toBe(1.9);
    expect(build.snapshots[0].median?.h2h?.draw).toBe(3.5);
    expect(build.unknownTeams).toEqual([]);
    expect(build.unmatchedEvents).toEqual([]);
  });

  it("resolves alternate Odds API spellings through the alias map", () => {
    const event: OddsApiEvent = {
      ...EVENT,
      id: "kor-cze",
      home_team: "Korea Republic",
      away_team: "Czech Republic",
    };
    const build = buildOddsSnapshots(
      [event],
      [{ id: "m2", kickoffAt: KICKOFF, homeCode: "KOR", awayCode: "CZE" }],
      1,
    );
    expect(build.snapshots.map((s) => s.matchId)).toEqual(["m2"]);
    expect(build.unknownTeams).toEqual([]);
  });

  it("logs and skips unknown team names — never guesses", () => {
    const event: OddsApiEvent = { ...EVENT, home_team: "Atlantis" };
    const build = buildOddsSnapshots([event], MATCHES, 1);
    expect(build.snapshots).toHaveLength(0);
    expect(build.unknownTeams).toEqual(["Atlantis"]);
    expect(build.unmatchedEvents).toEqual([]);
  });

  it("reports events whose pair has no local match yet", () => {
    const event: OddsApiEvent = {
      ...EVENT,
      home_team: "France",
      away_team: "Brazil",
    };
    const build = buildOddsSnapshots([event], MATCHES, 1);
    expect(build.snapshots).toHaveLength(0);
    expect(build.unmatchedEvents).toEqual(["France vs Brazil"]);
  });

  it("breaks repeat-pairing ties by kickoff proximity", () => {
    const groupMatch: MatchInfo = {
      id: "group",
      kickoffAt: KICKOFF,
      homeCode: "MEX",
      awayCode: "RSA",
    };
    const finalRematch: MatchInfo = {
      id: "final",
      kickoffAt: Date.parse("2026-07-19T19:00:00Z"),
      homeCode: "RSA", // reversed home/away — pairing is order-independent
      awayCode: "MEX",
    };
    const lateEvent: OddsApiEvent = {
      ...EVENT,
      id: "rematch",
      commence_time: "2026-07-19T19:00:00Z",
    };
    const build = buildOddsSnapshots(
      [lateEvent],
      [groupMatch, finalRematch],
      1,
    );
    expect(build.snapshots.map((s) => s.matchId)).toEqual(["final"]);
  });

  it("counts events without any priced line instead of writing empty snapshots", () => {
    const unpriced: OddsApiEvent = { ...EVENT, bookmakers: [] };
    const build = buildOddsSnapshots([unpriced], MATCHES, 1);
    expect(build.snapshots).toHaveLength(0);
    expect(build.unpricedEvents).toBe(1);
  });

  it("plans at most one snapshot per match when duplicate events appear", () => {
    const duplicate: OddsApiEvent = { ...EVENT, id: "dupe" };
    const build = buildOddsSnapshots([EVENT, duplicate], MATCHES, 1);
    expect(build.snapshots).toHaveLength(1);
  });

  it("ignores matches with unresolved knockout slots (no team codes)", () => {
    const build = buildOddsSnapshots(
      [EVENT],
      [{ id: "tbd", kickoffAt: KICKOFF }],
      1,
    );
    expect(build.snapshots).toHaveLength(0);
    expect(build.unmatchedEvents).toEqual(["Mexico vs South Africa"]);
  });
});

describe("buildOutrightPrices", () => {
  const OUTRIGHT_EVENT: OddsApiEvent = {
    id: "winner-2026",
    sport_key: "soccer_fifa_world_cup_winner",
    commence_time: "2026-06-11T00:00:00Z",
    home_team: null,
    away_team: null,
    bookmakers: [
      {
        key: "pinnacle",
        title: "Pinnacle",
        markets: [
          {
            key: "outrights",
            outcomes: [
              { name: "Spain", price: 5.5 },
              { name: "England", price: 7.0 },
              { name: "Narnia", price: 100 },
            ],
          },
        ],
      },
      {
        key: "unibet_eu",
        title: "Unibet",
        markets: [
          {
            key: "outrights",
            outcomes: [
              { name: "Spain", price: 6.0 },
              { name: "England", price: 6.5 },
            ],
          },
        ],
      },
    ],
  };

  it("aggregates best and median per team, favorites first", () => {
    const build = buildOutrightPrices([OUTRIGHT_EVENT]);
    expect(build.prices).toEqual([
      {
        teamCode: "ESP",
        bestOdds: 6.0,
        medianOdds: 5.75,
        bookmaker: "Unibet",
      },
      {
        teamCode: "ENG",
        bestOdds: 7.0,
        medianOdds: 6.75,
        bookmaker: "Pinnacle",
      },
    ]);
  });

  it("logs and skips unknown outcome names — never guesses", () => {
    const build = buildOutrightPrices([OUTRIGHT_EVENT]);
    expect(build.unknownTeams).toEqual(["Narnia"]);
    expect(
      build.prices.find((price) => price.teamCode === "Narnia"),
    ).toBeUndefined();
  });

  it("ignores non-outright markets", () => {
    const build = buildOutrightPrices([
      {
        ...OUTRIGHT_EVENT,
        bookmakers: [
          {
            key: "exchange",
            markets: [
              {
                key: "outrights_lay",
                outcomes: [{ name: "Spain", price: 5.6 }],
              },
            ],
          },
        ],
      },
    ]);
    expect(build.prices).toEqual([]);
  });
});

describe("pickOutrightSportKey", () => {
  it("prefers the documented winner key", () => {
    expect(
      pickOutrightSportKey([
        { key: "soccer_fifa_world_cup", has_outrights: false, active: true },
        {
          key: "soccer_fifa_world_cup_winner",
          has_outrights: true,
          active: true,
        },
      ]),
    ).toBe("soccer_fifa_world_cup_winner");
  });

  it("falls back to another active World Cup outright sport", () => {
    expect(
      pickOutrightSportKey([
        { key: "soccer_fifa_world_cup", has_outrights: false, active: true },
        {
          key: "soccer_fifa_world_cup_2026_winner",
          has_outrights: true,
          active: true,
        },
      ]),
    ).toBe("soccer_fifa_world_cup_2026_winner");
  });

  it("is null when the winner market is not offered (caller logs a skip)", () => {
    expect(
      pickOutrightSportKey([
        { key: "soccer_fifa_world_cup", has_outrights: false, active: true },
        { key: "soccer_epl", has_outrights: false, active: true },
      ]),
    ).toBeNull();
    expect(pickOutrightSportKey([])).toBeNull();
  });

  it("skips inactive entries", () => {
    expect(
      pickOutrightSportKey([
        {
          key: "soccer_fifa_world_cup_winner",
          has_outrights: true,
          active: false,
        },
      ]),
    ).toBeNull();
  });
});
