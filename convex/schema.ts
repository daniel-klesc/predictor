import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Application schema. Owned by the schema/seed issue (#2); other issues build
 * on these shapes — extend additively, never repurpose fields.
 */

/** Tournament stage. 104 matches: 72 group, 16 r32, 8 r16, 4 qf, 2 sf, 1 third, 1 final. */
export const stageValidator = v.union(
  v.literal("group"),
  v.literal("r32"),
  v.literal("r16"),
  v.literal("qf"),
  v.literal("sf"),
  v.literal("third"),
  v.literal("final"),
);

/**
 * Normalized match status (football-data.org statuses are mapped onto these:
 * SCHEDULED/TIMED → scheduled, IN_PLAY/PAUSED/SUSPENDED → live,
 * FINISHED/AWARDED → finished, POSTPONED → postponed, CANCELLED → cancelled).
 */
export const matchStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("live"),
  v.literal("finished"),
  v.literal("postponed"),
  v.literal("cancelled"),
);

/**
 * Match score. `home`/`away` are the final/current score INCLUDING extra time
 * but EXCLUDING penalty shootouts (football-data `fullTime` semantics).
 */
export const scoreValidator = v.object({
  home: v.number(),
  away: v.number(),
  /** 90-minute score when the match went to extra time. */
  regulationHome: v.optional(v.number()),
  regulationAway: v.optional(v.number()),
  /** Goals scored during extra time only. */
  extraTimeHome: v.optional(v.number()),
  extraTimeAway: v.optional(v.number()),
  /** Penalty-shootout score when one happened. */
  penaltiesHome: v.optional(v.number()),
  penaltiesAway: v.optional(v.number()),
  duration: v.optional(
    v.union(
      v.literal("regular"),
      v.literal("extraTime"),
      v.literal("penalties"),
    ),
  ),
});

/** Decimal odds for a 1X2 (h2h) market. */
const h2hOdds = v.object({
  home: v.number(),
  draw: v.number(),
  away: v.number(),
});

/** Decimal odds for a totals (over/under) line at `point` goals. */
const totalsOdds = v.object({
  point: v.number(),
  over: v.number(),
  under: v.number(),
});

export default defineSchema({
  ...authTables,

  /** The 48 qualified teams, keyed by FIFA trigram (`code`). */
  teams: defineTable({
    /** FIFA trigram, e.g. "CZE", "USA", "KOR" — stable internal team key. */
    code: v.string(),
    /** Canonical display name. */
    name: v.string(),
    /** Group letter "A".."L". */
    group: v.string(),
    /** Current World Football Elo rating (eloratings.net). */
    elo: v.number(),
    /** True for the three hosts: USA, CAN, MEX. */
    isHost: v.boolean(),
    /** Squad market value in EUR (filled by a later issue). */
    squadValueEur: v.optional(v.number()),
    /** External-source identifiers/spellings captured during sync. */
    ext: v.optional(
      v.object({
        footballDataId: v.optional(v.number()),
        oddsApiName: v.optional(v.string()),
        eloName: v.optional(v.string()),
      }),
    ),
  })
    .index("by_code", ["code"])
    .index("by_group", ["group"]),

  /** All 104 matches. `matchNumber` is the stable cross-source join key. */
  matches: defineTable({
    /** Official match number 1–104 — THE stable join key across sources. */
    matchNumber: v.number(),
    stage: stageValidator,
    /** Kickoff in UTC milliseconds. */
    kickoffAt: v.number(),
    /** Stadium name (filled by football-data sync when available). */
    venue: v.optional(v.string()),
    /** Host city, e.g. "Mexico City", "Boston (Foxborough)". */
    city: v.optional(v.string()),
    /** Group letter "A".."L" for group-stage matches. */
    group: v.optional(v.string()),
    /** Nullable until knockout slots resolve to real teams. */
    homeTeamId: v.optional(v.id("teams")),
    awayTeamId: v.optional(v.id("teams")),
    /** Knockout slot placeholders, e.g. "1A", "2B", "3A/B/C/D/F", "W74", "L101". */
    homePlaceholder: v.optional(v.string()),
    awayPlaceholder: v.optional(v.string()),
    status: matchStatusValidator,
    score: v.optional(scoreValidator),
    /** Winner incl. penalty shootouts; unset for draws / unfinished matches. */
    winnerTeamId: v.optional(v.id("teams")),
    /** External-source match ids. */
    ext: v.optional(
      v.object({
        footballDataId: v.optional(v.number()),
        oddsApiId: v.optional(v.string()),
      }),
    ),
  })
    .index("by_kickoff", ["kickoffAt"])
    .index("by_matchNumber", ["matchNumber"])
    .index("by_status", ["status"]),

  /** Per-match odds snapshots. Written by the odds issue; shape defined here. */
  oddsSnapshots: defineTable({
    matchId: v.id("matches"),
    fetchedAt: v.number(),
    /** Raw per-bookmaker lines (h2h + totals). */
    bookmakers: v.array(
      v.object({
        key: v.string(),
        title: v.optional(v.string()),
        lastUpdateAt: v.optional(v.number()),
        h2h: v.optional(h2hOdds),
        totals: v.optional(v.array(totalsOdds)),
      }),
    ),
    /** Best available price per outcome across bookmakers. */
    best: v.optional(
      v.object({
        h2h: v.optional(
          v.object({
            home: v.number(),
            homeBookmaker: v.string(),
            draw: v.number(),
            drawBookmaker: v.string(),
            away: v.number(),
            awayBookmaker: v.string(),
          }),
        ),
        /** Over/under 2.5 goals line. */
        totals25: v.optional(
          v.object({
            over: v.number(),
            overBookmaker: v.string(),
            under: v.number(),
            underBookmaker: v.string(),
          }),
        ),
      }),
    ),
    /** Median price per outcome across bookmakers (consensus line). */
    median: v.optional(
      v.object({
        h2h: v.optional(h2hOdds),
        totals25: v.optional(v.object({ over: v.number(), under: v.number() })),
      }),
    ),
  }).index("by_match", ["matchId", "fetchedAt"]),

  /** Tournament-winner (outright) odds snapshots. */
  outrightSnapshots: defineTable({
    fetchedAt: v.number(),
    prices: v.array(
      v.object({
        teamCode: v.string(),
        bestOdds: v.number(),
        medianOdds: v.number(),
        /** Bookmaker offering the best price. */
        bookmaker: v.string(),
      }),
    ),
  }).index("by_fetchedAt", ["fetchedAt"]),

  /** ONE document per match, upserted on every recompute (model issue #4). */
  predictions: defineTable({
    matchId: v.id("matches"),
    computedAt: v.number(),
    /** Model inputs at compute time. */
    inputs: v.object({
      homeElo: v.number(),
      awayElo: v.number(),
      /** Expected goals (Poisson lambdas). */
      homeLambda: v.number(),
      awayLambda: v.number(),
      /** Dixon-Coles low-score correlation parameter. */
      rho: v.number(),
    }),
    /** Pure model probabilities. */
    model: v.object({
      pHome: v.number(),
      pDraw: v.number(),
      pAway: v.number(),
      pOver25: v.number(),
      pUnder25: v.number(),
      pBttsYes: v.number(),
      pBttsNo: v.number(),
      topScorelines: v.array(
        v.object({ home: v.number(), away: v.number(), p: v.number() }),
      ),
    }),
    /** De-margined market probabilities (Shin / proportional). */
    market: v.optional(
      v.object({
        pHome: v.number(),
        pDraw: v.number(),
        pAway: v.number(),
        pOver25: v.optional(v.number()),
        pUnder25: v.optional(v.number()),
        method: v.optional(v.string()),
      }),
    ),
    /** Model/market blend (weight w ≈ 0.7 toward market). */
    blend: v.optional(
      v.object({
        weight: v.number(),
        pHome: v.number(),
        pDraw: v.number(),
        pAway: v.number(),
        pOver25: v.optional(v.number()),
        pUnder25: v.optional(v.number()),
      }),
    ),
    valueBets: v.array(
      v.object({
        market: v.string(),
        /** Outcome within the market, e.g. "home", "over". */
        selection: v.optional(v.string()),
        pBlend: v.number(),
        pImplied: v.number(),
        edge: v.number(),
        bestOdds: v.number(),
        bookmaker: v.string(),
        kellyFraction: v.number(),
      }),
    ),
  }).index("by_match", ["matchId"]),

  /** Monte-Carlo tournament simulation results. */
  tournamentSims: defineTable({
    computedAt: v.number(),
    /** Number of simulation runs. */
    runs: v.number(),
    perTeam: v.array(
      v.object({
        teamCode: v.string(),
        pWinGroup: v.number(),
        pR32: v.number(),
        pR16: v.number(),
        pQF: v.number(),
        pSF: v.number(),
        pFinal: v.number(),
        pChampion: v.number(),
      }),
    ),
    valueOutrights: v.array(
      v.object({
        teamCode: v.string(),
        market: v.string(),
        pModel: v.number(),
        pImplied: v.number(),
        edge: v.number(),
        bestOdds: v.number(),
        bookmaker: v.string(),
        kellyFraction: v.optional(v.number()),
      }),
    ),
  }).index("by_computedAt", ["computedAt"]),

  /** Bet tracking (proposed by analysis/chat or entered manually). */
  bets: defineTable({
    userId: v.id("users"),
    /** Unset for outright (tournament-winner) bets. */
    matchId: v.optional(v.id("matches")),
    market: v.string(),
    selection: v.string(),
    /** Decimal odds taken. */
    odds: v.number(),
    bookmaker: v.optional(v.string()),
    stake: v.optional(v.number()),
    status: v.union(
      v.literal("proposed"),
      v.literal("placed"),
      v.literal("won"),
      v.literal("lost"),
      v.literal("void"),
    ),
    source: v.union(
      v.literal("analysis"),
      v.literal("chat"),
      v.literal("manual"),
    ),
    payout: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_user", ["userId", "status"])
    .index("by_match", ["matchId"]),

  /** Chat threads (chat issue owns message semantics). */
  chatThreads: defineTable({
    userId: v.id("users"),
    title: v.string(),
    matchId: v.optional(v.id("matches")),
    lastMessageAt: v.number(),
  }).index("by_user", ["userId", "lastMessageAt"]),

  chatMessages: defineTable({
    threadId: v.id("chatThreads"),
    /** "user" | "assistant" | … — chat issue owns the role vocabulary. */
    role: v.string(),
    text: v.string(),
    /** Rich content blocks incl. tool trace — shape owned by the chat issue. */
    blocks: v.optional(v.any()),
    /** Token usage metadata — shape owned by the chat issue. */
    usage: v.optional(v.any()),
  }).index("by_thread", ["threadId"]),

  /** Per-user betting settings. Defaults: kellyMultiplier 0.25, blendWeight 0.7. */
  userSettings: defineTable({
    userId: v.id("users"),
    bankroll: v.optional(v.number()),
    /** Fraction of full Kelly to stake (default 0.25). */
    kellyMultiplier: v.number(),
    /** Market weight in the model/market blend (default 0.7). */
    blendWeight: v.number(),
  }).index("by_user", ["userId"]),

  /** One row per sync run (seed, fixtures-sync, results-sync, elo-nightly, odds). */
  syncAudit: defineTable({
    source: v.string(),
    startedAt: v.number(),
    finishedAt: v.number(),
    ok: v.boolean(),
    itemsUpdated: v.number(),
    error: v.optional(v.string()),
    /** Non-fatal notes: skipped steps, guard no-ops, unresolved names. */
    detail: v.optional(v.string()),
    /** Remaining credits reported by The Odds API response headers. */
    creditsRemaining: v.optional(v.number()),
  }).index("by_source", ["source", "startedAt"]),
});
