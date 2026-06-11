/**
 * Claude tool layer for the chat backend: tool definitions (deterministic,
 * cache-stable order) + executors that run each tool against Convex via the
 * caller's authenticated client.
 *
 * Token frugality: executors return compact JSON — numbers rounded to 3
 * decimals, null/undefined dropped, timestamps rendered as Europe/Prague
 * strings, lists sorted and capped — so the model can quote values verbatim.
 *
 * The ONLY write is `propose_bet`, which calls the existing
 * `api.bets.propose` mutation with `source: "chat"` (status "proposed";
 * the human places every bet manually).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { FunctionReference } from "convex/server";

import { api } from "@/convex/_generated/api";
import { nextDayKey, startOfDayKey } from "@/lib/day";

import { formatPragueInstant } from "./system-prompt";

/**
 * Structural Convex client (satisfied by ConvexHttpClient; mocked in tests).
 */
export interface ConvexToolClient {
  query(
    reference: FunctionReference<"query">,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  mutation(
    reference: FunctionReference<"mutation">,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

/** Outcome of one tool execution, fed back as a tool_result block. */
export interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

const VALUE_BETS_CAP = 25;
const SIM_TEAMS_CAP = 20;

// ---------------------------------------------------------------------------
// Tool definitions — ONE stable array literal. Never reorder or build
// dynamically: the serialized tool list is part of the cached prompt prefix.
// ---------------------------------------------------------------------------

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_fixtures",
    description:
      "List World Cup 2026 fixtures with kickoff times, status, and scores. Call this for schedule questions — what is on a given day, in a stage, or on a team's calendar. All filters are optional and combinable; with no filters it returns all 104 matches in kickoff order.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Calendar day in the Europe/Prague timezone, format YYYY-MM-DD (e.g. 2026-06-11).",
        },
        stage: {
          type: "string",
          enum: ["group", "r32", "r16", "qf", "sf", "third", "final"],
          description: "Tournament stage filter.",
        },
        teamCode: {
          type: "string",
          description: "FIFA trigram, e.g. MEX, USA, CZE.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_match_analysis",
    description:
      "Full analysis for ONE match: teams with Elo ratings, model/market/blend probabilities, flagged value bets, and the latest best+median odds, in a single payload. Call this FIRST for any question about a specific match. Requires the official match number (1-104) — find it via get_fixtures if unknown.",
    input_schema: {
      type: "object",
      properties: {
        matchNumber: {
          type: "integer",
          description: "Official match number, 1-104.",
        },
      },
      required: ["matchNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "get_odds",
    description:
      "Bookmaker-level odds detail for ONE match: per-bookmaker 1X2 prices and over/under 2.5 lines plus the best and median (consensus) prices. Call this when the user asks which bookmaker offers what, or wants price detail beyond get_match_analysis.",
    input_schema: {
      type: "object",
      properties: {
        matchNumber: {
          type: "integer",
          description: "Official match number, 1-104.",
        },
      },
      required: ["matchNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "get_value_bets",
    description:
      "The current value-bet board: every model-flagged edge across upcoming (scheduled) matches, sorted by edge descending, with probabilities, best odds, bookmaker, and the quarter-Kelly stake fraction. Call this for 'what should I bet today / any value right now' questions.",
    input_schema: {
      type: "object",
      properties: {
        minEdge: {
          type: "number",
          description:
            "Only return bets with at least this edge (0-1 scale, e.g. 0.03 for 3%). Default 0.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_team_profile",
    description:
      "Profile of one team: Elo rating, group standing (position, points, goal difference), remaining fixtures, Monte-Carlo tournament probabilities (win group, reach each round, champion), and the current outright price. Call this for any team-level question.",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "FIFA trigram, e.g. MEX, USA, CZE.",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tournament_sim",
    description:
      "Latest Monte-Carlo tournament simulation: per-team probabilities of winning the group, reaching each knockout round, and becoming champion, plus model-flagged outright value bets. Call this for tournament-winner odds, progression chances, or outright value questions.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_my_bets",
    description:
      "The user's tracked bets (proposed, placed, won, lost, void) with odds, stakes, and payouts. Call this when the user asks about their bets, open proposals, exposure, or profit/loss.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "propose_bet",
    description:
      "Record ONE bet proposal in the user's tracker (status 'proposed'; the human reviews and places every bet manually — this never stakes money). Call it only after the user signals they want the bet tracked, using odds taken from a tool result.",
    input_schema: {
      type: "object",
      properties: {
        matchNumber: {
          type: "integer",
          description: "Official match number, 1-104.",
        },
        market: {
          type: "string",
          description: "Market, e.g. h2h, totals25.",
        },
        selection: {
          type: "string",
          description: "Selection within the market, e.g. home, draw, over.",
        },
        odds: {
          type: "number",
          description:
            "Decimal odds from a tool result (e.g. the bestOdds of the value bet).",
        },
        bookmaker: {
          type: "string",
          description: "Bookmaker offering the odds, when known.",
        },
        note: {
          type: "string",
          description: "Short reasoning note to store with the proposal.",
        },
      },
      required: ["matchNumber", "market", "selection", "odds"],
      additionalProperties: false,
    },
  },
];

/** Anthropic server-side web search (runs on Anthropic infra, max 5 uses). */
export const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
};

/** The full tool array sent on every request — custom tools, then search. */
export const ALL_CHAT_TOOLS: Anthropic.Messages.ToolUnion[] = [
  ...CHAT_TOOLS,
  WEB_SEARCH_TOOL,
];

// ---------------------------------------------------------------------------
// Compaction helpers
// ---------------------------------------------------------------------------

/** Round to 3 decimals (no-op for integers); guards quote-verbatim outputs. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Deep-compact a payload: round every number to 3 decimals and drop
 * null/undefined object properties (token frugality + verbatim quoting).
 */
export function compact(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? round3(value) : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => compact(item));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) continue;
      result[key] = compact(item);
    }
    return result;
  }
  return value;
}

/** Compact JSON string for a tool_result block. */
function toJson(payload: unknown): string {
  return JSON.stringify(compact(payload));
}

function ok(payload: unknown): ToolExecutionResult {
  return { content: toJson(payload), isError: false };
}

function toolError(message: string): ToolExecutionResult {
  return { content: JSON.stringify({ error: message }), isError: true };
}

// ---------------------------------------------------------------------------
// Input parsing (tool inputs arrive as untrusted `unknown` from the model)
// ---------------------------------------------------------------------------

function asRecord(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STAGES = ["group", "r32", "r16", "qf", "sf", "third", "final"] as const;

function parseMatchNumber(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 104
    ? value
    : null;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

type RawRow = Record<string, unknown>;

function withKickoff<T extends { kickoffAt?: number | null }>(
  row: T,
): Omit<T, "kickoffAt"> & { kickoff?: string } {
  const { kickoffAt, ...rest } = row;
  return typeof kickoffAt === "number"
    ? { ...rest, kickoff: formatPragueInstant(kickoffAt) }
    : rest;
}

async function runGetFixtures(
  convex: ConvexToolClient,
  input: unknown,
): Promise<ToolExecutionResult> {
  const args = asRecord(input);
  const date = optionalString(args.date);
  if (date !== undefined && !DATE_PATTERN.test(date)) {
    return toolError("date must be formatted YYYY-MM-DD, e.g. 2026-06-11");
  }
  const stage = optionalString(args.stage);
  if (
    stage !== undefined &&
    !STAGES.includes(stage as (typeof STAGES)[number])
  ) {
    return toolError(`stage must be one of: ${STAGES.join(", ")}`);
  }
  const queryArgs: Record<string, unknown> = {};
  if (date !== undefined) {
    queryArgs.start = startOfDayKey(date);
    queryArgs.end = startOfDayKey(nextDayKey(date));
  }
  if (stage !== undefined) queryArgs.stage = stage;
  const teamCode = optionalString(args.teamCode);
  if (teamCode !== undefined) queryArgs.teamCode = teamCode;

  const rows = (await convex.query(api.chat.toolFixtures, queryArgs)) as Array<
    RawRow & { kickoffAt: number }
  >;
  return ok({
    count: rows.length,
    fixtures: rows.map((row) => withKickoff(row)),
  });
}

async function runGetMatchAnalysis(
  convex: ConvexToolClient,
  input: unknown,
): Promise<ToolExecutionResult> {
  const matchNumber = parseMatchNumber(asRecord(input).matchNumber);
  if (matchNumber === null) {
    return toolError("matchNumber must be an integer between 1 and 104");
  }
  const payload = (await convex.query(api.chat.toolMatchAnalysis, {
    matchNumber,
  })) as {
    match: RawRow & { kickoffAt: number };
    prediction: (RawRow & { computedAt: number }) | null;
    odds: (RawRow & { fetchedAt: number }) | null;
  } | null;
  if (!payload) return toolError(`No match with number ${matchNumber}`);
  const { computedAt, ...predictionRest } = payload.prediction ?? {};
  const { fetchedAt, ...oddsRest } = payload.odds ?? {};
  return ok({
    match: withKickoff(payload.match),
    prediction: payload.prediction
      ? {
          ...predictionRest,
          computed:
            typeof computedAt === "number"
              ? formatPragueInstant(computedAt)
              : undefined,
        }
      : null,
    odds: payload.odds
      ? {
          ...oddsRest,
          fetched:
            typeof fetchedAt === "number"
              ? formatPragueInstant(fetchedAt)
              : undefined,
        }
      : null,
    note: payload.prediction
      ? undefined
      : "No prediction yet for this match (teams may not be resolved).",
  });
}

interface RawBookmaker {
  key: string;
  h2h: { home: number; draw: number; away: number } | null;
  totals: Array<{ point: number; over: number; under: number }> | null;
}

async function runGetOdds(
  convex: ConvexToolClient,
  input: unknown,
): Promise<ToolExecutionResult> {
  const matchNumber = parseMatchNumber(asRecord(input).matchNumber);
  if (matchNumber === null) {
    return toolError("matchNumber must be an integer between 1 and 104");
  }
  const payload = (await convex.query(api.chat.toolOdds, { matchNumber })) as
    | (RawRow & {
        kickoffAt: number;
        snapshot:
          | (RawRow & { fetchedAt: number; bookmakers: RawBookmaker[] })
          | null;
      })
    | null;
  if (!payload) return toolError(`No match with number ${matchNumber}`);
  if (!payload.snapshot) {
    return ok({
      ...withKickoff({ ...payload, snapshot: undefined }),
      odds: null,
      note: "No bookmaker odds for this match yet.",
    });
  }
  const { fetchedAt, bookmakers, ...snapshotRest } = payload.snapshot;
  return ok({
    ...withKickoff({ ...payload, snapshot: undefined }),
    odds: {
      ...snapshotRest,
      fetched: formatPragueInstant(fetchedAt),
      bookmakers: bookmakers.map((bookmaker) => ({
        key: bookmaker.key,
        h2h: bookmaker.h2h,
        totals25:
          bookmaker.totals?.find((line) => line.point === 2.5) ?? undefined,
      })),
    },
  });
}

async function runGetValueBets(
  convex: ConvexToolClient,
  input: unknown,
): Promise<ToolExecutionResult> {
  const minEdgeRaw = optionalNumber(asRecord(input).minEdge);
  const minEdge = minEdgeRaw !== undefined ? Math.max(0, minEdgeRaw) : 0;
  const rows = (await convex.query(api.chat.toolValueBets, {})) as Array<
    RawRow & { edge: number; kickoffAt: number }
  >;
  const filtered = rows
    .filter((row) => row.edge >= minEdge)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, VALUE_BETS_CAP)
    .map((row) => withKickoff(row));
  return ok({
    count: filtered.length,
    minEdge,
    valueBets: filtered,
    note:
      filtered.length === 0
        ? "No value bets currently flagged at this edge threshold."
        : undefined,
  });
}

async function runGetTeamProfile(
  convex: ConvexToolClient,
  input: unknown,
): Promise<ToolExecutionResult> {
  const code = optionalString(asRecord(input).code);
  if (!code) return toolError("code must be a FIFA trigram, e.g. MEX");
  const payload = (await convex.query(api.chat.toolTeamProfile, {
    code,
  })) as
    | (RawRow & {
        remainingFixtures: Array<RawRow & { kickoffAt: number }>;
      })
    | null;
  if (!payload) {
    return toolError(
      `Unknown team code "${code}" — use the FIFA trigram of a qualified team`,
    );
  }
  return ok({
    ...payload,
    remainingFixtures: payload.remainingFixtures.map((row) => withKickoff(row)),
  });
}

async function runGetTournamentSim(
  convex: ConvexToolClient,
): Promise<ToolExecutionResult> {
  const payload = (await convex.query(api.chat.toolTournamentSim, {})) as
    | (RawRow & {
        computedAt: number;
        perTeam: Array<RawRow & { pChampion: number; teamCode: string }>;
      })
    | null;
  if (!payload) {
    return ok({
      sim: null,
      note: "No tournament simulation has been computed yet.",
    });
  }
  const { computedAt, perTeam, ...rest } = payload;
  const sorted = [...perTeam].sort((a, b) => b.pChampion - a.pChampion);
  return ok({
    ...rest,
    computed: formatPragueInstant(computedAt),
    perTeam: sorted.slice(0, SIM_TEAMS_CAP),
    note:
      sorted.length > SIM_TEAMS_CAP
        ? `Top ${SIM_TEAMS_CAP} of ${sorted.length} teams by champion probability — use get_team_profile for any other team.`
        : undefined,
  });
}

async function runGetMyBets(
  convex: ConvexToolClient,
): Promise<ToolExecutionResult> {
  const rows = (await convex.query(api.chat.toolMyBets, {})) as Array<
    RawRow & {
      createdAt: number;
      matchNumber: number | null;
      home: string | null;
      away: string | null;
    }
  >;
  const bets = [...rows]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ createdAt, matchNumber, home, away, ...rest }) => ({
      created: formatPragueInstant(createdAt),
      match:
        matchNumber !== null
          ? `${home ?? "TBD"}–${away ?? "TBD"} (#${matchNumber})`
          : undefined,
      ...rest,
    }));
  return ok({
    count: bets.length,
    bets,
    note: bets.length === 0 ? "No tracked bets yet." : undefined,
  });
}

async function runProposeBet(
  convex: ConvexToolClient,
  input: unknown,
): Promise<ToolExecutionResult> {
  const args = asRecord(input);
  const matchNumber = parseMatchNumber(args.matchNumber);
  if (matchNumber === null) {
    return toolError("matchNumber must be an integer between 1 and 104");
  }
  const market = optionalString(args.market);
  const selection = optionalString(args.selection);
  const odds = optionalNumber(args.odds);
  if (!market) return toolError("market is required, e.g. h2h or totals25");
  if (!selection) {
    return toolError("selection is required, e.g. home, draw, away, over");
  }
  if (odds === undefined || odds <= 1) {
    return toolError(
      "odds must be decimal odds greater than 1, taken from a tool result",
    );
  }
  const match = (await convex.query(api.chat.matchByNumber, {
    matchNumber,
  })) as {
    matchId: string;
    matchNumber: number;
    status: string;
    kickoffAt: number;
    home: { code: string } | null;
    away: { code: string } | null;
  } | null;
  if (!match) return toolError(`No match with number ${matchNumber}`);

  const mutationArgs: Record<string, unknown> = {
    matchId: match.matchId,
    market,
    selection,
    odds,
    source: "chat",
  };
  const bookmaker = optionalString(args.bookmaker);
  if (bookmaker !== undefined) mutationArgs.bookmaker = bookmaker;
  const note = optionalString(args.note);
  if (note !== undefined) mutationArgs.note = note;

  const betId = await convex.mutation(api.bets.propose, mutationArgs);
  return ok({
    proposed: true,
    betId,
    match: `${match.home?.code ?? "TBD"}–${match.away?.code ?? "TBD"} (#${match.matchNumber})`,
    market,
    selection,
    odds,
    bookmaker,
    status: "proposed",
    note: "Recorded as a proposal only — the user reviews and places every bet manually.",
  });
}

/** Names of all custom chat tools, in definition order. */
export const CHAT_TOOL_NAMES = CHAT_TOOLS.map((tool) => tool.name);

/**
 * Execute one custom tool against Convex with the caller's auth. Never
 * throws for tool-level problems — invalid input, unknown names, and Convex
 * failures come back as `isError` results so the model can adapt.
 */
export async function executeChatTool(
  convex: ConvexToolClient,
  name: string,
  input: unknown,
): Promise<ToolExecutionResult> {
  try {
    switch (name) {
      case "get_fixtures":
        return await runGetFixtures(convex, input);
      case "get_match_analysis":
        return await runGetMatchAnalysis(convex, input);
      case "get_odds":
        return await runGetOdds(convex, input);
      case "get_value_bets":
        return await runGetValueBets(convex, input);
      case "get_team_profile":
        return await runGetTeamProfile(convex, input);
      case "get_tournament_sim":
        return await runGetTournamentSim(convex);
      case "get_my_bets":
        return await runGetMyBets(convex);
      case "propose_bet":
        return await runProposeBet(convex, input);
      default:
        return toolError(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return toolError(`Tool ${name} failed: ${message}`);
  }
}
