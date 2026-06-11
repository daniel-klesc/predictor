/**
 * Chat persistence + chat-tool data queries (chat backend issue #7).
 *
 * Two groups of functions, all auth-scoped:
 *
 * 1. Thread/message CRUD for the chat UI and the streaming route —
 *    `listThreads`, `createThread`, `listMessages` (paginated, newest page
 *    first; reverse for display), `recentMessages` (route replay window),
 *    `sendUserMessage` (client persists BEFORE calling /api/chat),
 *    `appendAssistantMessage` (route persists on end_turn), and
 *    `threadContext` (the route's cheap auth/ownership gate).
 *
 * 2. Read-only `tool*` queries backing the Claude tool executors in
 *    `lib/chat/tools.ts`. They return scoped, pre-joined payloads; the
 *    executor layer compacts them (rounding, null-dropping) for the model.
 *    The ONLY write a chat tool performs is `bets.propose` (status
 *    "proposed", source "chat") — nothing here mutates match data.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { groupStandings } from "../lib/standings";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { stageValidator } from "./schema";

/** Signed-in user id, or throw (mapped to 401 by the chat route). */
async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated — sign in to use chat");
  }
  return userId;
}

/** Thread owned by `userId`, or throw (never leak other users' threads). */
async function requireOwnThread(
  ctx: QueryCtx,
  userId: Id<"users">,
  threadId: Id<"chatThreads">,
): Promise<Doc<"chatThreads">> {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.userId !== userId) {
    throw new Error("Thread not found");
  }
  return thread;
}

/** Slim team shape used in tool payloads. */
function teamRef(team: Doc<"teams"> | null | undefined) {
  if (!team) return null;
  return { code: team.code, name: team.name };
}

/** "MEX–RSA" from resolved teams, placeholders, or the match number. */
function matchTitle(
  match: Doc<"matches">,
  home: Doc<"teams"> | null,
  away: Doc<"teams"> | null,
): string {
  const homeLabel = home?.code ?? match.homePlaceholder;
  const awayLabel = away?.code ?? match.awayPlaceholder;
  if (homeLabel && awayLabel) return `${homeLabel}–${awayLabel}`;
  return `Match #${match.matchNumber}`;
}

// ---------------------------------------------------------------------------
// Threads & messages
// ---------------------------------------------------------------------------

/** Threads of the signed-in user, most recently active first. */
export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("chatThreads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Create a thread. Title precedence: explicit `title` → match context
 * ("MEX–RSA") → "" (sentinel; `sendUserMessage` fills it from the first
 * message, truncated).
 */
export const createThread = mutation({
  args: {
    matchId: v.optional(v.id("matches")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let title = args.title?.trim() ?? "";
    if (!title && args.matchId) {
      const match = await ctx.db.get(args.matchId);
      if (match) {
        const [home, away] = await Promise.all([
          match.homeTeamId ? ctx.db.get(match.homeTeamId) : null,
          match.awayTeamId ? ctx.db.get(match.awayTeamId) : null,
        ]);
        title = matchTitle(match, home, away);
      }
    }
    return await ctx.db.insert("chatThreads", {
      userId,
      title,
      matchId: args.matchId,
      lastMessageAt: Date.now(),
    });
  },
});

/**
 * Messages of an owned thread, paginated walking BACKWARDS from the newest
 * (Convex `usePaginatedQuery` pattern); the UI reverses each page so the
 * rendered transcript reads oldest → newest (newest last).
 */
export const listMessages = query({
  args: {
    threadId: v.id("chatThreads"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { threadId, paginationOpts }) => {
    const userId = await requireUserId(ctx);
    await requireOwnThread(ctx, userId, threadId);
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

const RECENT_MESSAGES_DEFAULT = 30;
const RECENT_MESSAGES_MAX = 100;

/**
 * The last `limit` (default 30) messages of an owned thread in chronological
 * order — the route's replay window for the model request. Takes a string id
 * so malformed ids resolve to null (404) instead of throwing (401).
 */
export const recentMessages = query({
  args: { threadId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const threadId = ctx.db.normalizeId("chatThreads", args.threadId);
    if (!threadId) return null;
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) return null;
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? RECENT_MESSAGES_DEFAULT), 1),
      RECENT_MESSAGES_MAX,
    );
    const newestFirst = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(limit);
    return newestFirst
      .reverse()
      .map((message) => ({ role: message.role, text: message.text }));
  },
});

const TITLE_MAX_LENGTH = 60;

/**
 * Persist a user message (the chat client calls this BEFORE POSTing to
 * /api/chat), bump thread activity, and auto-title untitled threads from
 * the first message.
 */
export const sendUserMessage = mutation({
  args: { threadId: v.id("chatThreads"), text: v.string() },
  handler: async (ctx, { threadId, text }) => {
    const userId = await requireUserId(ctx);
    const thread = await requireOwnThread(ctx, userId, threadId);
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message text must not be empty");
    const messageId = await ctx.db.insert("chatMessages", {
      threadId,
      role: "user",
      text: trimmed,
    });
    const patch: { lastMessageAt: number; title?: string } = {
      lastMessageAt: Date.now(),
    };
    if (!thread.title) {
      patch.title =
        trimmed.length > TITLE_MAX_LENGTH
          ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
          : trimmed;
    }
    await ctx.db.patch(threadId, patch);
    return messageId;
  },
});

/**
 * Persist the assistant reply (full content `blocks` incl. tool_use /
 * tool_result trace, plus token `usage`) — called by the streaming route on
 * end_turn or with partial text + an error marker when the stream dies.
 */
export const appendAssistantMessage = mutation({
  args: {
    threadId: v.id("chatThreads"),
    text: v.string(),
    blocks: v.optional(v.any()),
    usage: v.optional(v.any()),
  },
  handler: async (ctx, { threadId, text, blocks, usage }) => {
    const userId = await requireUserId(ctx);
    await requireOwnThread(ctx, userId, threadId);
    const messageId = await ctx.db.insert("chatMessages", {
      threadId,
      role: "assistant",
      text,
      blocks,
      usage,
    });
    await ctx.db.patch(threadId, { lastMessageAt: Date.now() });
    return messageId;
  },
});

/**
 * The route's auth + ownership gate: cheap authed query returning the thread
 * plus its optional match context (for the per-request context block).
 * Throws when unauthenticated (→ 401); returns null for a malformed id or a
 * thread the user does not own (→ 404).
 */
export const threadContext = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const threadId = ctx.db.normalizeId("chatThreads", args.threadId);
    if (!threadId) return null;
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) return null;

    let match: {
      matchNumber: number;
      stage: Doc<"matches">["stage"];
      kickoffAt: number;
      status: Doc<"matches">["status"];
      home: { code: string; name: string } | null;
      away: { code: string; name: string } | null;
      homePlaceholder: string | null;
      awayPlaceholder: string | null;
    } | null = null;
    if (thread.matchId) {
      const matchDoc = await ctx.db.get(thread.matchId);
      if (matchDoc) {
        const [home, away] = await Promise.all([
          matchDoc.homeTeamId ? ctx.db.get(matchDoc.homeTeamId) : null,
          matchDoc.awayTeamId ? ctx.db.get(matchDoc.awayTeamId) : null,
        ]);
        match = {
          matchNumber: matchDoc.matchNumber,
          stage: matchDoc.stage,
          kickoffAt: matchDoc.kickoffAt,
          status: matchDoc.status,
          home: teamRef(home),
          away: teamRef(away),
          homePlaceholder: matchDoc.homePlaceholder ?? null,
          awayPlaceholder: matchDoc.awayPlaceholder ?? null,
        };
      }
    }
    return { threadId: thread._id, title: thread.title, match };
  },
});

// ---------------------------------------------------------------------------
// Tool-backing queries (read-only data for the Claude tool executors)
// ---------------------------------------------------------------------------

/** All teams keyed by id (48 docs — one cheap read per tool call). */
async function teamsById(
  ctx: QueryCtx,
): Promise<Map<Id<"teams">, Doc<"teams">>> {
  const teams = await ctx.db.query("teams").collect();
  return new Map(teams.map((team) => [team._id, team]));
}

/** Match by official number via the by_matchNumber index. */
async function matchByNumberInner(
  ctx: QueryCtx,
  matchNumber: number,
): Promise<Doc<"matches"> | null> {
  return await ctx.db
    .query("matches")
    .withIndex("by_matchNumber", (q) => q.eq("matchNumber", matchNumber))
    .unique();
}

/** Compact match row shared by toolFixtures / toolMatchAnalysis. */
function matchRow(
  match: Doc<"matches">,
  teams: Map<Id<"teams">, Doc<"teams">>,
) {
  return {
    matchNumber: match.matchNumber,
    stage: match.stage,
    group: match.group ?? null,
    kickoffAt: match.kickoffAt,
    venue: match.venue ?? null,
    city: match.city ?? null,
    status: match.status,
    home: teamRef(match.homeTeamId ? teams.get(match.homeTeamId) : null),
    away: teamRef(match.awayTeamId ? teams.get(match.awayTeamId) : null),
    homePlaceholder: match.homePlaceholder ?? null,
    awayPlaceholder: match.awayPlaceholder ?? null,
    score: match.score
      ? {
          home: match.score.home,
          away: match.score.away,
          penaltiesHome: match.score.penaltiesHome ?? null,
          penaltiesAway: match.score.penaltiesAway ?? null,
          duration: match.score.duration ?? null,
        }
      : null,
  };
}

/**
 * Fixtures for the `get_fixtures` tool. Optional UTC-ms kickoff range
 * (index-backed), then in-memory stage/team filters (≤104 docs).
 */
export const toolFixtures = query({
  args: {
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    stage: v.optional(stageValidator),
    teamCode: v.optional(v.string()),
  },
  handler: async (ctx, { start, end, stage, teamCode }) => {
    await requireUserId(ctx);
    let matches: Doc<"matches">[];
    if (start !== undefined && end !== undefined) {
      matches = await ctx.db
        .query("matches")
        .withIndex("by_kickoff", (q) =>
          q.gte("kickoffAt", start).lt("kickoffAt", end),
        )
        .collect();
    } else if (start !== undefined) {
      matches = await ctx.db
        .query("matches")
        .withIndex("by_kickoff", (q) => q.gte("kickoffAt", start))
        .collect();
    } else if (end !== undefined) {
      matches = await ctx.db
        .query("matches")
        .withIndex("by_kickoff", (q) => q.lt("kickoffAt", end))
        .collect();
    } else {
      matches = await ctx.db.query("matches").withIndex("by_kickoff").collect();
    }
    if (stage) matches = matches.filter((match) => match.stage === stage);
    const teams = await teamsById(ctx);
    if (teamCode) {
      const code = teamCode.toUpperCase();
      matches = matches.filter((match) => {
        const home = match.homeTeamId ? teams.get(match.homeTeamId) : null;
        const away = match.awayTeamId ? teams.get(match.awayTeamId) : null;
        return home?.code === code || away?.code === code;
      });
    }
    return matches.map((match) => matchRow(match, teams));
  },
});

/**
 * Everything about one match for `get_match_analysis`: match + teams +
 * the prediction doc + the latest odds snapshot (best/median only).
 */
export const toolMatchAnalysis = query({
  args: { matchNumber: v.number() },
  handler: async (ctx, { matchNumber }) => {
    await requireUserId(ctx);
    const match = await matchByNumberInner(ctx, matchNumber);
    if (!match) return null;
    const teams = await teamsById(ctx);
    const [prediction, snapshot] = await Promise.all([
      ctx.db
        .query("predictions")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .first(),
      ctx.db
        .query("oddsSnapshots")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .order("desc")
        .first(),
    ]);
    const home = match.homeTeamId ? teams.get(match.homeTeamId) : null;
    const away = match.awayTeamId ? teams.get(match.awayTeamId) : null;
    return {
      match: {
        ...matchRow(match, teams),
        home: home
          ? { ...teamRef(home)!, elo: home.elo, isHost: home.isHost }
          : null,
        away: away
          ? { ...teamRef(away)!, elo: away.elo, isHost: away.isHost }
          : null,
      },
      prediction: prediction
        ? {
            computedAt: prediction.computedAt,
            model: prediction.model,
            market: prediction.market ?? null,
            blend: prediction.blend ?? null,
            valueBets: prediction.valueBets,
          }
        : null,
      odds: snapshot
        ? {
            fetchedAt: snapshot.fetchedAt,
            best: snapshot.best ?? null,
            median: snapshot.median ?? null,
          }
        : null,
    };
  },
});

/**
 * Latest odds snapshot for `get_odds`, incl. the per-bookmaker lines (the
 * executor compacts totals to the 2.5 line).
 */
export const toolOdds = query({
  args: { matchNumber: v.number() },
  handler: async (ctx, { matchNumber }) => {
    await requireUserId(ctx);
    const match = await matchByNumberInner(ctx, matchNumber);
    if (!match) return null;
    const teams = await teamsById(ctx);
    const snapshot = await ctx.db
      .query("oddsSnapshots")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .order("desc")
      .first();
    return {
      matchNumber: match.matchNumber,
      home: teamRef(match.homeTeamId ? teams.get(match.homeTeamId) : null),
      away: teamRef(match.awayTeamId ? teams.get(match.awayTeamId) : null),
      kickoffAt: match.kickoffAt,
      status: match.status,
      snapshot: snapshot
        ? {
            fetchedAt: snapshot.fetchedAt,
            best: snapshot.best ?? null,
            median: snapshot.median ?? null,
            bookmakers: snapshot.bookmakers.map((bookmaker) => ({
              key: bookmaker.key,
              h2h: bookmaker.h2h ?? null,
              totals: bookmaker.totals ?? null,
            })),
          }
        : null,
    };
  },
});

/**
 * Flattened value-bet rows for `get_value_bets`: every `valueBets` entry of
 * every prediction on a SCHEDULED match, joined with match/team info. The
 * executor applies minEdge, sorts by edge and caps the list. Predictions is
 * one doc per match (≤104) so the scan is bounded.
 */
export const toolValueBets = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const [predictions, teams] = await Promise.all([
      ctx.db.query("predictions").collect(),
      teamsById(ctx),
    ]);
    const rows = [];
    for (const prediction of predictions) {
      if (prediction.valueBets.length === 0) continue;
      const match = await ctx.db.get(prediction.matchId);
      if (!match || match.status !== "scheduled") continue;
      const home = match.homeTeamId ? teams.get(match.homeTeamId) : null;
      const away = match.awayTeamId ? teams.get(match.awayTeamId) : null;
      for (const bet of prediction.valueBets) {
        rows.push({
          matchNumber: match.matchNumber,
          stage: match.stage,
          kickoffAt: match.kickoffAt,
          home: home?.code ?? match.homePlaceholder ?? null,
          away: away?.code ?? match.awayPlaceholder ?? null,
          market: bet.market,
          selection: bet.selection ?? null,
          pBlend: bet.pBlend,
          pImplied: bet.pImplied,
          edge: bet.edge,
          bestOdds: bet.bestOdds,
          bookmaker: bet.bookmaker,
          kellyFraction: bet.kellyFraction,
        });
      }
    }
    return rows;
  },
});

/**
 * Team profile for `get_team_profile`: team + Elo + group standing +
 * remaining fixtures + latest sim probabilities + outright price.
 */
export const toolTeamProfile = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const code = args.code.toUpperCase();
    const team = await ctx.db
      .query("teams")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!team) return null;

    const [groupTeams, allMatches, sim, outright] = await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_group", (q) => q.eq("group", team.group))
        .collect(),
      ctx.db.query("matches").withIndex("by_kickoff").collect(),
      ctx.db
        .query("tournamentSims")
        .withIndex("by_computedAt")
        .order("desc")
        .first(),
      ctx.db
        .query("outrightSnapshots")
        .withIndex("by_fetchedAt")
        .order("desc")
        .first(),
    ]);

    const codeById = new Map(
      groupTeams.map((groupTeam) => [groupTeam._id, groupTeam.code]),
    );
    const standingsInput = allMatches
      .filter((match) => match.group === team.group)
      .map((match) => ({
        stage: match.stage,
        status: match.status,
        homeCode: match.homeTeamId ? codeById.get(match.homeTeamId) : null,
        awayCode: match.awayTeamId ? codeById.get(match.awayTeamId) : null,
        score: match.score
          ? { home: match.score.home, away: match.score.away }
          : null,
      }));
    const tables = groupStandings(
      groupTeams.map((groupTeam) => ({
        code: groupTeam.code,
        name: groupTeam.name,
        group: groupTeam.group,
      })),
      standingsInput,
    );
    const rows = tables.find((table) => table.group === team.group)?.rows ?? [];
    const position = rows.findIndex((row) => row.code === team.code);
    const standingRow = position >= 0 ? rows[position] : null;

    const teams = await teamsById(ctx);
    const remaining = allMatches
      .filter(
        (match) =>
          match.status === "scheduled" &&
          (match.homeTeamId === team._id || match.awayTeamId === team._id),
      )
      .map((match) => {
        const isHome = match.homeTeamId === team._id;
        const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
        const opponent = opponentId ? teams.get(opponentId) : null;
        return {
          matchNumber: match.matchNumber,
          stage: match.stage,
          kickoffAt: match.kickoffAt,
          home: isHome,
          opponent:
            opponent?.code ??
            (isHome ? match.awayPlaceholder : match.homePlaceholder) ??
            null,
        };
      });

    const simRow =
      sim?.perTeam.find((row) => row.teamCode === team.code) ?? null;
    const outrightPrice =
      outright?.prices.find((price) => price.teamCode === team.code) ?? null;

    return {
      team: {
        code: team.code,
        name: team.name,
        group: team.group,
        elo: team.elo,
        isHost: team.isHost,
      },
      standing: standingRow ? { position: position + 1, ...standingRow } : null,
      remainingFixtures: remaining,
      sim: simRow
        ? {
            pWinGroup: simRow.pWinGroup,
            pR32: simRow.pR32,
            pR16: simRow.pR16,
            pQF: simRow.pQF,
            pSF: simRow.pSF,
            pFinal: simRow.pFinal,
            pChampion: simRow.pChampion,
          }
        : null,
      outright: outrightPrice
        ? {
            bestOdds: outrightPrice.bestOdds,
            medianOdds: outrightPrice.medianOdds,
            bookmaker: outrightPrice.bookmaker,
          }
        : null,
    };
  },
});

/** Latest Monte-Carlo tournament simulation for `get_tournament_sim`. */
export const toolTournamentSim = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const sim = await ctx.db
      .query("tournamentSims")
      .withIndex("by_computedAt")
      .order("desc")
      .first();
    if (!sim) return null;
    return {
      computedAt: sim.computedAt,
      runs: sim.runs,
      perTeam: sim.perTeam,
      valueOutrights: sim.valueOutrights,
    };
  },
});

/** The signed-in user's bets for `get_my_bets` (all statuses), joined. */
export const toolMyBets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const bets = await ctx.db
      .query("bets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = await teamsById(ctx);
    return await Promise.all(
      bets.map(async (bet) => {
        const match = bet.matchId ? await ctx.db.get(bet.matchId) : null;
        return {
          createdAt: bet._creationTime,
          matchNumber: match?.matchNumber ?? null,
          home: match
            ? (teamRef(match.homeTeamId ? teams.get(match.homeTeamId) : null)
                ?.code ??
              match.homePlaceholder ??
              null)
            : null,
          away: match
            ? (teamRef(match.awayTeamId ? teams.get(match.awayTeamId) : null)
                ?.code ??
              match.awayPlaceholder ??
              null)
            : null,
          market: bet.market,
          selection: bet.selection,
          odds: bet.odds,
          bookmaker: bet.bookmaker ?? null,
          stake: bet.stake ?? null,
          status: bet.status,
          source: bet.source,
          payout: bet.payout ?? null,
          note: bet.note ?? null,
        };
      }),
    );
  },
});

/** Resolve a match number to its id for the `propose_bet` executor. */
export const matchByNumber = query({
  args: { matchNumber: v.number() },
  handler: async (ctx, { matchNumber }) => {
    await requireUserId(ctx);
    const match = await matchByNumberInner(ctx, matchNumber);
    if (!match) return null;
    const teams = await teamsById(ctx);
    return {
      matchId: match._id,
      matchNumber: match.matchNumber,
      status: match.status,
      kickoffAt: match.kickoffAt,
      home: teamRef(match.homeTeamId ? teams.get(match.homeTeamId) : null),
      away: teamRef(match.awayTeamId ? teams.get(match.awayTeamId) : null),
    };
  },
});
