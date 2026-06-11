/**
 * Parser for the eloratings.net World Football Elo TSV endpoints.
 *
 * The SPA at eloratings.net loads two plain TSV files (no API key):
 * - https://www.eloratings.net/World.tsv      rank rows; col 3 = elo team
 *   code (their own 2-letter codes), col 4 = current rating
 * - https://www.eloratings.net/en.teams.tsv   elo code → display name
 *   (+ optional alias columns)
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */
import { resolveTeamName } from "./teamNameMap";

/** Current World Football Elo ratings (plain TSV, no API key). */
export const ELO_WORLD_TSV_URL = "https://www.eloratings.net/World.tsv";

/** Elo team code → display-name spellings (plain TSV, no API key). */
export const ELO_TEAMS_TSV_URL = "https://www.eloratings.net/en.teams.tsv";

export interface EloEntry {
  /** eloratings.net team code (NOT a FIFA trigram), e.g. "CZ", "US". */
  eloCode: string;
  /** Primary display name from en.teams.tsv, e.g. "Czechia". */
  name: string;
  /** All name spellings from en.teams.tsv (primary first). */
  names: string[];
  /** Current Elo rating. */
  rating: number;
}

/** Parse the two TSVs into rated entries. Rows that do not parse are skipped. */
export function parseEloTsv(worldTsv: string, teamsTsv: string): EloEntry[] {
  const namesByCode = new Map<string, string[]>();
  for (const line of teamsTsv.split("\n")) {
    const cells = line.replace(/\r/g, "").split("\t").filter(Boolean);
    if (cells.length < 2) continue;
    namesByCode.set(cells[0], cells.slice(1));
  }

  const entries: EloEntry[] = [];
  for (const line of worldTsv.split("\n")) {
    const cells = line.replace(/\r/g, "").split("\t");
    if (cells.length < 4) continue;
    const eloCode = cells[2]?.trim();
    const rating = Number(cells[3]);
    if (!eloCode || !Number.isFinite(rating)) continue;
    const names = namesByCode.get(eloCode) ?? [];
    entries.push({ eloCode, name: names[0] ?? eloCode, names, rating });
  }
  return entries;
}

export interface TeamElo {
  rating: number;
  /** eloratings.net display name that matched (stored in teams.ext.eloName). */
  eloName: string;
}

/**
 * Map parsed Elo entries onto FIFA trigrams via the alias map.
 * Entries that resolve to no WC2026 team are ignored (the TSV covers ~240
 * nations); WC teams the TSV does not cover are simply absent from the
 * result — the caller decides whether that is fatal (seed: yes).
 */
export function eloRatingsByTeamCode(
  entries: EloEntry[],
): Map<string, TeamElo> {
  const byCode = new Map<string, TeamElo>();
  for (const entry of entries) {
    for (const name of entry.names) {
      const team = resolveTeamName(name);
      if (!team) continue;
      if (!byCode.has(team.code)) {
        byCode.set(team.code, {
          rating: entry.rating,
          eloName: entry.names[0],
        });
      }
      break;
    }
  }
  return byCode;
}
