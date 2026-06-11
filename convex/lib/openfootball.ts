/**
 * Parser for the openfootball worldcup.json 2026 dataset — the seed source
 * of truth for teams and the 104-match schedule.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { resolveTeamName } from "./teamNameMap";

/** Seed source of truth for the 2026 schedule. */
export const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";

export interface OpenfootballMatch {
  round: string;
  /** Official match number — present for knockout rounds in the source. */
  num?: number;
  /** "YYYY-MM-DD" local date. */
  date: string;
  /** "HH:MM UTC±H" local time with explicit UTC offset. */
  time?: string;
  team1: string;
  team2: string;
  /** "Group A".."Group L" for group-stage matches. */
  group?: string;
  /** Host city, e.g. "Boston (Foxborough)". */
  ground?: string;
}

export interface OpenfootballJson {
  name: string;
  matches: OpenfootballMatch[];
}

export interface ParsedTeam {
  code: string;
  name: string;
  group: string;
  isHost: boolean;
  /** Spelling as it appeared in the source. */
  openfootballName: string;
}

export interface ParsedMatch {
  matchNumber: number;
  stage: Stage;
  /** Kickoff in UTC milliseconds. */
  kickoffAt: number;
  city?: string;
  /** Group letter "A".."L". */
  group?: string;
  /** Resolved FIFA trigram (set when the slot holds a real team). */
  homeCode?: string;
  awayCode?: string;
  /** Knockout slot placeholder, e.g. "1A", "2B", "3A/B/C/D/F", "W74", "L101". */
  homePlaceholder?: string;
  awayPlaceholder?: string;
}

/** Thrown when the source cannot be parsed safely. Lists every problem found. */
export class OpenfootballParseError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`openfootball parse failed:\n- ${problems.join("\n- ")}`);
    this.name = "OpenfootballParseError";
    this.problems = problems;
  }
}

const STAGE_BY_ROUND: Array<[RegExp, Stage]> = [
  [/^Matchday\s+\d+$/i, "group"],
  [/^Round of 32$/i, "r32"],
  [/^Round of 16$/i, "r16"],
  [/^Quarter-finals?$/i, "qf"],
  [/^Semi-finals?$/i, "sf"],
  [/^Match for third place$/i, "third"],
  [/^Third place(?: match)?$/i, "third"],
  [/^Final$/i, "final"],
];

export function stageFromRound(round: string): Stage | null {
  for (const [pattern, stage] of STAGE_BY_ROUND) {
    if (pattern.test(round.trim())) return stage;
  }
  return null;
}

/** Knockout slot placeholders: "1A", "2B", "3A/B/C/D/F", "W74", "L101". */
const PLACEHOLDER_PATTERN = /^(?:[12][A-L]|3[A-L](?:\/[A-L])+|[WL]\d{1,3})$/;

export function isPlaceholder(team: string): boolean {
  return PLACEHOLDER_PATTERN.test(team.trim());
}

/**
 * Parse "YYYY-MM-DD" + "HH:MM UTC±H" into UTC milliseconds.
 * Returns null when the format is unrecognized.
 */
export function parseKickoff(
  date: string,
  time: string | undefined,
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})(?::(\d{2}))?$/.exec(
    time.trim(),
  );
  if (!m) return null;
  const [, hh, mm, offsetHours, offsetMinutes] = m;
  const sign = offsetHours.startsWith("-") ? "-" : "+";
  const offH = String(Math.abs(Number(offsetHours))).padStart(2, "0");
  const offM = (offsetMinutes ?? "00").padStart(2, "0");
  const iso = `${date}T${hh.padStart(2, "0")}:${mm}:00${sign}${offH}:${offM}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Parse the full dataset into normalized teams + matches.
 *
 * Match numbering: the source carries official `num` for knockout matches
 * (73–102). "Match for third place" and "Final" carry no num and are fixed
 * to 103/104. Group matches carry no num and are assigned 1–72 in kickoff
 * order (ties broken by source order — deterministic across re-runs).
 *
 * FAILS LOUDLY (OpenfootballParseError listing every problem) when any team
 * name cannot be resolved in the alias map or any field cannot be parsed —
 * teams are never guessed.
 */
export function parseOpenfootball(data: OpenfootballJson): {
  teams: ParsedTeam[];
  matches: ParsedMatch[];
} {
  const problems: string[] = [];
  if (!data || !Array.isArray(data.matches)) {
    throw new OpenfootballParseError(["root object has no matches array"]);
  }

  interface WorkingMatch {
    parsed: Omit<ParsedMatch, "matchNumber">;
    explicitNum?: number;
    sourceIndex: number;
    label: string;
  }

  const working: WorkingMatch[] = [];
  const teamsByCode = new Map<string, ParsedTeam>();

  const resolveSide = (
    raw: string,
    label: string,
  ): { code?: string; placeholder?: string } | null => {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) {
      problems.push(`${label}: empty team string`);
      return null;
    }
    if (isPlaceholder(trimmed)) return { placeholder: trimmed };
    const entry = resolveTeamName(trimmed);
    if (!entry) {
      problems.push(
        `${label}: unresolved team name "${trimmed}" (not in alias map)`,
      );
      return null;
    }
    return { code: entry.code };
  };

  for (const [index, match] of data.matches.entries()) {
    const label = `match[${index}] (${match.round ?? "?"} ${match.team1 ?? "?"}–${match.team2 ?? "?"})`;

    const stage = stageFromRound(match.round ?? "");
    if (!stage) {
      problems.push(`${label}: unknown round "${match.round}"`);
      continue;
    }

    const kickoffAt = parseKickoff(match.date, match.time);
    if (kickoffAt === null) {
      problems.push(
        `${label}: unparseable kickoff date="${match.date}" time="${match.time}"`,
      );
      continue;
    }

    const home = resolveSide(match.team1, `${label} team1`);
    const away = resolveSide(match.team2, `${label} team2`);
    if (!home || !away) continue;

    let group: string | undefined;
    if (match.group) {
      const groupMatch = /^Group ([A-L])$/.exec(match.group.trim());
      if (!groupMatch) {
        problems.push(`${label}: unparseable group "${match.group}"`);
        continue;
      }
      group = groupMatch[1];
    }
    if (stage === "group" && !group) {
      problems.push(`${label}: group-stage match without a group`);
      continue;
    }

    // Collect teams (with group) from resolved sides of group-stage matches.
    if (stage === "group" && group) {
      for (const [side, raw] of [
        [home, match.team1],
        [away, match.team2],
      ] as const) {
        if (!side.code) continue;
        const entry = resolveTeamName(raw)!;
        const existing = teamsByCode.get(entry.code);
        if (existing && existing.group !== group) {
          problems.push(
            `team ${entry.code} appears in groups ${existing.group} and ${group}`,
          );
        } else if (!existing) {
          teamsByCode.set(entry.code, {
            code: entry.code,
            name: entry.name,
            group,
            isHost: entry.isHost,
            openfootballName: raw.trim(),
          });
        }
      }
    }

    let explicitNum = match.num;
    if (explicitNum === undefined) {
      if (stage === "third") explicitNum = 103;
      else if (stage === "final") explicitNum = 104;
    }

    working.push({
      parsed: {
        stage,
        kickoffAt,
        city: match.ground?.trim() || undefined,
        group,
        homeCode: home.code,
        awayCode: away.code,
        homePlaceholder: home.placeholder,
        awayPlaceholder: away.placeholder,
      },
      explicitNum,
      sourceIndex: index,
      label,
    });
  }

  // Assign match numbers: explicit nums win; the rest (group stage) get the
  // lowest unused numbers in kickoff order, ties broken by source order.
  const usedNumbers = new Map<number, string>();
  for (const w of working) {
    if (w.explicitNum === undefined) continue;
    const clash = usedNumbers.get(w.explicitNum);
    if (clash)
      problems.push(
        `duplicate match number ${w.explicitNum}: ${clash} vs ${w.label}`,
      );
    usedNumbers.set(w.explicitNum, w.label);
  }

  const unnumbered = working
    .filter((w) => w.explicitNum === undefined)
    .sort(
      (a, b) =>
        a.parsed.kickoffAt - b.parsed.kickoffAt ||
        a.sourceIndex - b.sourceIndex,
    );
  let nextNumber = 1;
  for (const w of unnumbered) {
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    w.explicitNum = nextNumber;
    usedNumbers.set(nextNumber, w.label);
  }

  if (problems.length > 0) throw new OpenfootballParseError(problems);

  const matches: ParsedMatch[] = working
    .map((w) => ({ matchNumber: w.explicitNum!, ...w.parsed }))
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const teams = [...teamsByCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  return { teams, matches };
}
