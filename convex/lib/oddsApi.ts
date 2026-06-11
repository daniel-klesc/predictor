/**
 * Pure helpers for The Odds API (api.the-odds-api.com/v4): response typing,
 * per-bookmaker line extraction, best/median line math, event→match pairing
 * (alias map + kickoff proximity), and outright price aggregation.
 *
 * Matching policy everywhere: a team name that does not resolve through the
 * alias map is reported back to the caller, which logs it to syncAudit and
 * SKIPS the row — a team is NEVER guessed.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { resolveTeamName } from "./teamNameMap";

export const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";

/** Sport key for WC2026 match odds (h2h + totals). */
export const ODDS_SPORT_KEY = "soccer_fifa_world_cup";

/** Expected sport key for the tournament-winner outright market. */
export const OUTRIGHT_SPORT_KEY = "soccer_fifa_world_cup_winner";

/** The over/under goals line the app tracks. */
export const TOTALS_POINT = 2.5;

// ---------------------------------------------------------------------------
// API response shapes (the subset we read)
// ---------------------------------------------------------------------------

export interface OddsApiOutcome {
  name: string;
  price: number;
  /** Goals line for totals outcomes. */
  point?: number;
}

export interface OddsApiMarket {
  key: string;
  last_update?: string;
  outcomes?: OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key: string;
  title?: string;
  last_update?: string;
  markets?: OddsApiMarket[];
}

export interface OddsApiEvent {
  id: string;
  sport_key?: string;
  commence_time: string;
  /** Null for outright (futures) events. */
  home_team: string | null;
  away_team: string | null;
  bookmakers?: OddsApiBookmaker[];
}

/** Entry of the free `/v4/sports` list endpoint. */
export interface OddsApiSport {
  key: string;
  title?: string;
  active?: boolean;
  has_outrights?: boolean;
}

// ---------------------------------------------------------------------------
// Snapshot shapes (mirror the oddsSnapshots table in convex/schema.ts)
// ---------------------------------------------------------------------------

export interface H2hLine {
  home: number;
  draw: number;
  away: number;
}

export interface TotalsLine {
  point: number;
  over: number;
  under: number;
}

export interface SnapshotBookmaker {
  key: string;
  title?: string;
  lastUpdateAt?: number;
  h2h?: H2hLine;
  totals?: TotalsLine[];
}

export interface BestLines {
  h2h?: {
    home: number;
    homeBookmaker: string;
    draw: number;
    drawBookmaker: string;
    away: number;
    awayBookmaker: string;
  };
  totals25?: {
    over: number;
    overBookmaker: string;
    under: number;
    underBookmaker: string;
  };
}

export interface MedianLines {
  h2h?: H2hLine;
  totals25?: { over: number; under: number };
}

// ---------------------------------------------------------------------------
// Line math
// ---------------------------------------------------------------------------

/** Median of a non-empty list (average of the two middle values for even counts). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Display label for a bookmaker (title, falling back to the key). */
export function bookmakerLabel(bookmaker: SnapshotBookmaker): string {
  return bookmaker.title ?? bookmaker.key;
}

function totalsAt(
  bookmaker: SnapshotBookmaker,
  point: number,
): TotalsLine | undefined {
  return bookmaker.totals?.find((line) => line.point === point);
}

function bestPick(
  entries: { price: number; bookmaker: string }[],
): { price: number; bookmaker: string } | undefined {
  let best: { price: number; bookmaker: string } | undefined;
  for (const entry of entries) {
    if (!best || entry.price > best.price) best = entry;
  }
  return best;
}

/**
 * Extract per-bookmaker h2h + totals lines from one event. h2h outcomes are
 * named after the event's own home/away team strings (plus "Draw"); totals
 * outcomes are "Over"/"Under" carrying a `point`. Incomplete markets (a
 * missing outcome) are dropped rather than guessed; bookmakers without any
 * usable market are dropped entirely.
 */
export function parseEventBookmakers(event: OddsApiEvent): SnapshotBookmaker[] {
  const result: SnapshotBookmaker[] = [];
  for (const bookmaker of event.bookmakers ?? []) {
    const parsed: SnapshotBookmaker = { key: bookmaker.key };
    if (bookmaker.title) parsed.title = bookmaker.title;
    if (bookmaker.last_update) {
      const lastUpdateAt = Date.parse(bookmaker.last_update);
      if (Number.isFinite(lastUpdateAt)) parsed.lastUpdateAt = lastUpdateAt;
    }
    for (const market of bookmaker.markets ?? []) {
      if (market.key === "h2h" && !parsed.h2h) {
        parsed.h2h = parseH2hOutcomes(market.outcomes ?? [], event);
      } else if (market.key === "totals" && !parsed.totals) {
        const totals = parseTotalsOutcomes(market.outcomes ?? []);
        if (totals.length > 0) parsed.totals = totals;
      }
    }
    if (parsed.h2h || parsed.totals) result.push(parsed);
  }
  return result;
}

function parseH2hOutcomes(
  outcomes: OddsApiOutcome[],
  event: OddsApiEvent,
): H2hLine | undefined {
  let home: number | undefined;
  let draw: number | undefined;
  let away: number | undefined;
  for (const outcome of outcomes) {
    if (typeof outcome.price !== "number" || !(outcome.price > 1)) continue;
    if (outcome.name === "Draw") draw = outcome.price;
    else if (outcome.name === event.home_team) home = outcome.price;
    else if (outcome.name === event.away_team) away = outcome.price;
  }
  return home !== undefined && draw !== undefined && away !== undefined
    ? { home, draw, away }
    : undefined;
}

function parseTotalsOutcomes(outcomes: OddsApiOutcome[]): TotalsLine[] {
  const byPoint = new Map<number, { over?: number; under?: number }>();
  for (const outcome of outcomes) {
    if (typeof outcome.point !== "number") continue;
    if (typeof outcome.price !== "number" || !(outcome.price > 1)) continue;
    const entry = byPoint.get(outcome.point) ?? {};
    if (outcome.name === "Over") entry.over = outcome.price;
    else if (outcome.name === "Under") entry.under = outcome.price;
    byPoint.set(outcome.point, entry);
  }
  const lines: TotalsLine[] = [];
  for (const [point, entry] of byPoint) {
    if (entry.over !== undefined && entry.under !== undefined) {
      lines.push({ point, over: entry.over, under: entry.under });
    }
  }
  return lines.sort((a, b) => a.point - b.point);
}

/** Best (max) price per outcome across bookmakers, with the bookmaker offering it. */
export function computeBest(
  bookmakers: SnapshotBookmaker[],
): BestLines | undefined {
  const result: BestLines = {};

  const h2hEntries = bookmakers.filter((bookmaker) => bookmaker.h2h);
  if (h2hEntries.length > 0) {
    const pick = (outcome: keyof H2hLine) =>
      bestPick(
        h2hEntries.map((bookmaker) => ({
          price: (bookmaker.h2h as H2hLine)[outcome],
          bookmaker: bookmakerLabel(bookmaker),
        })),
      ) as { price: number; bookmaker: string };
    const home = pick("home");
    const draw = pick("draw");
    const away = pick("away");
    result.h2h = {
      home: home.price,
      homeBookmaker: home.bookmaker,
      draw: draw.price,
      drawBookmaker: draw.bookmaker,
      away: away.price,
      awayBookmaker: away.bookmaker,
    };
  }

  const totalsEntries = bookmakers.flatMap((bookmaker) => {
    const line = totalsAt(bookmaker, TOTALS_POINT);
    return line ? [{ bookmaker, line }] : [];
  });
  if (totalsEntries.length > 0) {
    const over = bestPick(
      totalsEntries.map(({ bookmaker, line }) => ({
        price: line.over,
        bookmaker: bookmakerLabel(bookmaker),
      })),
    ) as { price: number; bookmaker: string };
    const under = bestPick(
      totalsEntries.map(({ bookmaker, line }) => ({
        price: line.under,
        bookmaker: bookmakerLabel(bookmaker),
      })),
    ) as { price: number; bookmaker: string };
    result.totals25 = {
      over: over.price,
      overBookmaker: over.bookmaker,
      under: under.price,
      underBookmaker: under.bookmaker,
    };
  }

  return result.h2h || result.totals25 ? result : undefined;
}

/** Median (consensus) price per outcome across bookmakers. */
export function computeMedian(
  bookmakers: SnapshotBookmaker[],
): MedianLines | undefined {
  const result: MedianLines = {};

  const h2hLines = bookmakers.flatMap((bookmaker) =>
    bookmaker.h2h ? [bookmaker.h2h] : [],
  );
  if (h2hLines.length > 0) {
    result.h2h = {
      home: median(h2hLines.map((line) => line.home)),
      draw: median(h2hLines.map((line) => line.draw)),
      away: median(h2hLines.map((line) => line.away)),
    };
  }

  const totalsLines = bookmakers.flatMap((bookmaker) => {
    const line = totalsAt(bookmaker, TOTALS_POINT);
    return line ? [line] : [];
  });
  if (totalsLines.length > 0) {
    result.totals25 = {
      over: median(totalsLines.map((line) => line.over)),
      under: median(totalsLines.map((line) => line.under)),
    };
  }

  return result.h2h || result.totals25 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Event → match pairing + snapshot plans
// ---------------------------------------------------------------------------

/** The minimal match shape needed for pairing (ids stay opaque strings). */
export interface MatchInfo<TId extends string = string> {
  id: TId;
  kickoffAt: number;
  homeCode?: string;
  awayCode?: string;
}

/** One planned oddsSnapshots insert (matches the table shape + the event id). */
export interface OddsSnapshotPlan<TId extends string = string> {
  matchId: TId;
  oddsApiEventId: string;
  fetchedAt: number;
  bookmakers: SnapshotBookmaker[];
  best?: BestLines;
  median?: MedianLines;
}

export interface OddsSnapshotBuild<TId extends string = string> {
  snapshots: OddsSnapshotPlan<TId>[];
  /** Source spellings with no alias-map entry (caller logs + skips, never guesses). */
  unknownTeams: string[];
  /** Events whose team pair has no local match (e.g. knockout slot not resolved yet). */
  unmatchedEvents: string[];
  /** Events skipped because no bookmaker offered a parseable line. */
  unpricedEvents: number;
}

/** Order-independent team-pair key. */
function pairKey(codeA: string, codeB: string): string {
  return [codeA, codeB].sort().join(":");
}

/**
 * Map API events onto local matches and compute one snapshot plan per match.
 * Team names resolve through the alias map; the pairing is by team pair with
 * kickoff proximity to `commence_time` as the tiebreaker (handles knockout
 * rematches of a group-stage pairing).
 */
export function buildOddsSnapshots<TId extends string>(
  events: OddsApiEvent[],
  matches: MatchInfo<TId>[],
  fetchedAt: number,
): OddsSnapshotBuild<TId> {
  const byPair = new Map<string, MatchInfo<TId>[]>();
  for (const match of matches) {
    if (!match.homeCode || !match.awayCode) continue;
    const key = pairKey(match.homeCode, match.awayCode);
    const list = byPair.get(key);
    if (list) list.push(match);
    else byPair.set(key, [match]);
  }

  const unknownTeams = new Set<string>();
  const unmatchedEvents: string[] = [];
  let unpricedEvents = 0;
  const planByMatch = new Map<
    TId,
    { plan: OddsSnapshotPlan<TId>; kickoffDelta: number }
  >();

  for (const event of events) {
    if (!event.home_team || !event.away_team) continue; // outright-style rows
    const home = resolveTeamName(event.home_team);
    const away = resolveTeamName(event.away_team);
    if (!home) unknownTeams.add(event.home_team);
    if (!away) unknownTeams.add(event.away_team);
    if (!home || !away) continue;

    const candidates = byPair.get(pairKey(home.code, away.code)) ?? [];
    const commenceAt = Date.parse(event.commence_time);
    let match: MatchInfo<TId> | undefined;
    let kickoffDelta = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const delta = Number.isFinite(commenceAt)
        ? Math.abs(candidate.kickoffAt - commenceAt)
        : 0;
      if (delta < kickoffDelta) {
        match = candidate;
        kickoffDelta = delta;
      }
    }
    if (!match) {
      unmatchedEvents.push(`${event.home_team} vs ${event.away_team}`);
      continue;
    }

    const bookmakers = parseEventBookmakers(event);
    if (bookmakers.length === 0) {
      unpricedEvents += 1;
      continue;
    }

    const plan: OddsSnapshotPlan<TId> = {
      matchId: match.id,
      oddsApiEventId: event.id,
      fetchedAt,
      bookmakers,
      best: computeBest(bookmakers),
      median: computeMedian(bookmakers),
    };
    const existing = planByMatch.get(match.id);
    if (!existing || kickoffDelta < existing.kickoffDelta) {
      planByMatch.set(match.id, { plan, kickoffDelta });
    }
  }

  return {
    snapshots: [...planByMatch.values()].map((entry) => entry.plan),
    unknownTeams: [...unknownTeams],
    unmatchedEvents,
    unpricedEvents,
  };
}

// ---------------------------------------------------------------------------
// Outrights (tournament winner)
// ---------------------------------------------------------------------------

export interface OutrightPrice {
  teamCode: string;
  bestOdds: number;
  medianOdds: number;
  /** Bookmaker offering the best price. */
  bookmaker: string;
}

export interface OutrightBuild {
  prices: OutrightPrice[];
  unknownTeams: string[];
}

/**
 * Aggregate tournament-winner outright prices across bookmakers (and events,
 * should the API return several). Outcome names resolve through the alias
 * map; unknown names are reported and skipped, never guessed. Prices are
 * sorted favorites-first (ascending median odds).
 */
export function buildOutrightPrices(events: OddsApiEvent[]): OutrightBuild {
  const unknownTeams = new Set<string>();
  const byTeam = new Map<
    string,
    { prices: number[]; best: number; bookmaker: string }
  >();

  for (const event of events) {
    for (const bookmaker of event.bookmakers ?? []) {
      const label = bookmaker.title ?? bookmaker.key;
      for (const market of bookmaker.markets ?? []) {
        if (market.key !== "outrights") continue;
        for (const outcome of market.outcomes ?? []) {
          if (typeof outcome.price !== "number" || !(outcome.price > 1)) {
            continue;
          }
          const entry = resolveTeamName(outcome.name);
          if (!entry) {
            unknownTeams.add(outcome.name);
            continue;
          }
          const team = byTeam.get(entry.code) ?? {
            prices: [],
            best: 0,
            bookmaker: label,
          };
          team.prices.push(outcome.price);
          if (outcome.price > team.best) {
            team.best = outcome.price;
            team.bookmaker = label;
          }
          byTeam.set(entry.code, team);
        }
      }
    }
  }

  const prices = [...byTeam.entries()]
    .map(([teamCode, team]) => ({
      teamCode,
      bestOdds: team.best,
      medianOdds: median(team.prices),
      bookmaker: team.bookmaker,
    }))
    .sort(
      (a, b) =>
        a.medianOdds - b.medianOdds || a.teamCode.localeCompare(b.teamCode),
    );

  return { prices, unknownTeams: [...unknownTeams] };
}

/**
 * Pick the WC-winner outright sport key from the free sports list. Prefers
 * the documented OUTRIGHT_SPORT_KEY; falls back to any active World Cup sport
 * flagged `has_outrights`. Null when the market is not offered (caller logs
 * a skip — no credits are spent).
 */
export function pickOutrightSportKey(sports: OddsApiSport[]): string | null {
  const exact = sports.find((sport) => sport.key === OUTRIGHT_SPORT_KEY);
  if (exact && exact.active !== false) return exact.key;
  const fallback = sports.find(
    (sport) =>
      sport.key.startsWith("soccer_fifa_world_cup") &&
      sport.has_outrights === true &&
      sport.active !== false,
  );
  return fallback?.key ?? null;
}
