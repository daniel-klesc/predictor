/**
 * Knockout-bracket structure builder. Pure and unit-tested — no React, no
 * Convex.
 *
 * The seeded schedule encodes the bracket in the slot placeholders:
 * "W74" means "winner of match 74 feeds this slot", so matchNumber
 * adjacency fully determines the tree. The builder walks DOWN from the
 * final — each match's two winner-refs name its two source matches — so
 * every column lists matches in true bracket order (a match sits between
 * its two feeders in the previous column). Placeholders are kept by the
 * sync even after slots resolve to real teams, so the structure is stable
 * for the whole tournament.
 */

export type BracketStage = "r32" | "r16" | "qf" | "sf" | "third" | "final";

/** Knockout columns in display order (the third-place match is separate). */
export const BRACKET_ROUNDS = ["r32", "r16", "qf", "sf", "final"] as const;

export type BracketRoundStage = (typeof BRACKET_ROUNDS)[number];

/** Minimal match shape the builder needs; extra fields pass through. */
export interface BracketMatchLike {
  matchNumber: number;
  stage: string;
  homePlaceholder?: string;
  awayPlaceholder?: string;
}

/** Parsed knockout slot reference (the placeholder grammar). */
export type BracketSlotRef =
  | { kind: "winner"; matchNumber: number }
  | { kind: "loser"; matchNumber: number }
  | { kind: "groupWinner"; group: string }
  | { kind: "groupRunnerUp"; group: string }
  | { kind: "bestThird"; groups: string[] }
  | { kind: "unknown"; raw: string };

/**
 * Parse a knockout slot placeholder: "W74" / "L101" (match refs),
 * "1A" / "2B" (group position), "3A/B/C/D/F" (best-third pool).
 * Anything else — including missing — is `unknown`.
 */
export function parseBracketSlot(
  placeholder: string | null | undefined,
): BracketSlotRef {
  const raw = (placeholder ?? "").trim();
  let m = /^([WL])(\d{1,3})$/i.exec(raw);
  if (m) {
    return {
      kind: m[1].toUpperCase() === "W" ? "winner" : "loser",
      matchNumber: Number(m[2]),
    };
  }
  m = /^([12])([A-L])$/i.exec(raw);
  if (m) {
    return m[1] === "1"
      ? { kind: "groupWinner", group: m[2].toUpperCase() }
      : { kind: "groupRunnerUp", group: m[2].toUpperCase() };
  }
  m = /^3([A-L](?:\/[A-L])+)$/i.exec(raw);
  if (m) {
    return { kind: "bestThird", groups: m[1].toUpperCase().split("/") };
  }
  return { kind: "unknown", raw };
}

/**
 * Slot display text: a resolved team's code wins over the stored
 * placeholder; an empty slot falls back to the given label (e.g. "TBD").
 */
export function bracketSlotCode(
  team: { code: string } | null | undefined,
  placeholder: string | null | undefined,
  fallback: string,
): string {
  return team?.code ?? placeholder?.trim() ?? fallback;
}

export interface BracketRound<T> {
  stage: BracketRoundStage;
  matches: T[];
}

export interface Bracket<T> {
  /** Columns r32 → final, each in bracket display order. Empty rounds are omitted. */
  rounds: Array<BracketRound<T>>;
  /** The third-place play-off (rendered apart from the main tree). */
  thirdPlace: T | null;
}

/**
 * Build the bracket from the full match list (group matches are ignored).
 * Ordering is derived from the W-refs starting at the final; any round
 * whose refs do not cleanly resolve — and every round below it — falls
 * back to matchNumber order, so partial or malformed data still renders.
 */
export function buildBracket<T extends BracketMatchLike>(
  matches: ReadonlyArray<T>,
): Bracket<T> {
  const byNumber = new Map<number, T>();
  const byStage = new Map<BracketRoundStage, T[]>();
  let thirdPlace: T | null = null;
  for (const match of matches) {
    if (match.stage === "third") {
      thirdPlace = match;
      continue;
    }
    if (!(BRACKET_ROUNDS as readonly string[]).includes(match.stage)) continue;
    const stage = match.stage as BracketRoundStage;
    byNumber.set(match.matchNumber, match);
    const list = byStage.get(stage) ?? [];
    list.push(match);
    byStage.set(stage, list);
  }
  for (const list of byStage.values()) {
    list.sort((a, b) => a.matchNumber - b.matchNumber);
  }

  /** Source matches of `round` in feed order, or null when refs break. */
  const deriveSources = (round: T[], sourceStage: BracketRoundStage) => {
    const stageMatches = byStage.get(sourceStage) ?? [];
    const sources: T[] = [];
    const seen = new Set<number>();
    for (const match of round) {
      for (const placeholder of [
        match.homePlaceholder,
        match.awayPlaceholder,
      ]) {
        const ref = parseBracketSlot(placeholder);
        if (ref.kind !== "winner") return null;
        const source = byNumber.get(ref.matchNumber);
        if (!source || source.stage !== sourceStage) return null;
        if (seen.has(source.matchNumber)) return null;
        seen.add(source.matchNumber);
        sources.push(source);
      }
    }
    return sources.length === stageMatches.length ? sources : null;
  };

  // Walk final → r32; once a derivation fails, every lower round falls
  // back too (the chain that orders it is broken).
  const ordered = new Map<BracketRoundStage, T[]>();
  let above: T[] | null = byStage.get("final") ?? null;
  ordered.set("final", above ?? []);
  let broken = above === null;
  for (let i = BRACKET_ROUNDS.length - 2; i >= 0; i -= 1) {
    const stage = BRACKET_ROUNDS[i];
    const derived = broken || !above ? null : deriveSources(above, stage);
    if (derived === null) broken = true;
    const round = derived ?? byStage.get(stage) ?? [];
    ordered.set(stage, round);
    above = round;
  }

  return {
    rounds: BRACKET_ROUNDS.map((stage) => ({
      stage,
      matches: ordered.get(stage) ?? [],
    })).filter((round) => round.matches.length > 0),
    thirdPlace,
  };
}
