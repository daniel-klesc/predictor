/**
 * Static team-name alias map for the 48 WC2026 teams, keyed by FIFA trigram.
 *
 * Covers the spellings used by the four data sources:
 * - openfootball (worldcup.json 2026 — the seed source of truth)
 * - football-data.org (v4 `name` / `shortName`; `tla` usually equals the FIFA code)
 * - The Odds API (bookmaker-feed spellings)
 * - eloratings.net (en.teams.tsv display names)
 *
 * Matching policy: exact → normalized (lowercase, diacritics/punctuation
 * stripped) → null. On null the CALLER logs to syncAudit and SKIPS the row —
 * a team name is NEVER guessed.
 *
 * Group assignments are derived from the openfootball 2026 dataset
 * (the official draw), verified 2026-06-11.
 *
 * Pure TypeScript — no Convex imports (unit-tested with vitest).
 */

export interface TeamNameEntry {
  /** FIFA trigram — stable internal team key. */
  code: string;
  /** Canonical display name. */
  name: string;
  /** Group letter "A".."L" (from the official draw). */
  group: string;
  /** True for the three hosts (USA, CAN, MEX). */
  isHost: boolean;
  /** Spelling used by openfootball worldcup.json. */
  openfootball: string;
  /** Spellings seen on football-data.org (name / shortName variants). */
  footballData: string[];
  /** Spellings used by The Odds API. */
  oddsApi: string[];
  /** Spellings used by eloratings.net (first entry = en.teams.tsv primary). */
  elo: string[];
}

/** All 48 qualified teams. */
export const TEAM_NAME_MAP: Record<string, TeamNameEntry> = {
  // ----- Group A -----
  MEX: {
    code: "MEX",
    name: "Mexico",
    group: "A",
    isHost: true,
    openfootball: "Mexico",
    footballData: ["Mexico"],
    oddsApi: ["Mexico"],
    elo: ["Mexico"],
  },
  RSA: {
    code: "RSA",
    name: "South Africa",
    group: "A",
    isHost: false,
    openfootball: "South Africa",
    footballData: ["South Africa"],
    oddsApi: ["South Africa"],
    elo: ["South Africa"],
  },
  KOR: {
    code: "KOR",
    name: "South Korea",
    group: "A",
    isHost: false,
    openfootball: "South Korea",
    footballData: ["South Korea", "Korea Republic"],
    oddsApi: ["South Korea", "Korea Republic"],
    elo: ["South Korea"],
  },
  CZE: {
    code: "CZE",
    name: "Czechia",
    group: "A",
    isHost: false,
    openfootball: "Czech Republic",
    footballData: ["Czech Republic", "Czechia"],
    oddsApi: ["Czech Republic", "Czechia"],
    elo: ["Czechia"],
  },
  // ----- Group B -----
  CAN: {
    code: "CAN",
    name: "Canada",
    group: "B",
    isHost: true,
    openfootball: "Canada",
    footballData: ["Canada"],
    oddsApi: ["Canada"],
    elo: ["Canada"],
  },
  SUI: {
    code: "SUI",
    name: "Switzerland",
    group: "B",
    isHost: false,
    openfootball: "Switzerland",
    footballData: ["Switzerland"],
    oddsApi: ["Switzerland"],
    elo: ["Switzerland"],
  },
  QAT: {
    code: "QAT",
    name: "Qatar",
    group: "B",
    isHost: false,
    openfootball: "Qatar",
    footballData: ["Qatar"],
    oddsApi: ["Qatar"],
    elo: ["Qatar"],
  },
  BIH: {
    code: "BIH",
    name: "Bosnia and Herzegovina",
    group: "B",
    isHost: false,
    openfootball: "Bosnia & Herzegovina",
    footballData: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnia"],
    oddsApi: [
      "Bosnia and Herzegovina",
      "Bosnia & Herzegovina",
      "Bosnia-Herzegovina",
    ],
    elo: ["Bosnia and Herzegovina", "Bosnia & Herzegovina"],
  },
  // ----- Group C -----
  BRA: {
    code: "BRA",
    name: "Brazil",
    group: "C",
    isHost: false,
    openfootball: "Brazil",
    footballData: ["Brazil"],
    oddsApi: ["Brazil"],
    elo: ["Brazil"],
  },
  MAR: {
    code: "MAR",
    name: "Morocco",
    group: "C",
    isHost: false,
    openfootball: "Morocco",
    footballData: ["Morocco"],
    oddsApi: ["Morocco"],
    elo: ["Morocco"],
  },
  HAI: {
    code: "HAI",
    name: "Haiti",
    group: "C",
    isHost: false,
    openfootball: "Haiti",
    footballData: ["Haiti"],
    oddsApi: ["Haiti"],
    elo: ["Haiti"],
  },
  SCO: {
    code: "SCO",
    name: "Scotland",
    group: "C",
    isHost: false,
    openfootball: "Scotland",
    footballData: ["Scotland"],
    oddsApi: ["Scotland"],
    elo: ["Scotland"],
  },
  // ----- Group D -----
  USA: {
    code: "USA",
    name: "USA",
    group: "D",
    isHost: true,
    openfootball: "USA",
    footballData: ["United States", "USA", "United States of America"],
    oddsApi: ["USA", "United States"],
    elo: ["United States", "USA"],
  },
  PAR: {
    code: "PAR",
    name: "Paraguay",
    group: "D",
    isHost: false,
    openfootball: "Paraguay",
    footballData: ["Paraguay"],
    oddsApi: ["Paraguay"],
    elo: ["Paraguay"],
  },
  AUS: {
    code: "AUS",
    name: "Australia",
    group: "D",
    isHost: false,
    openfootball: "Australia",
    footballData: ["Australia"],
    oddsApi: ["Australia"],
    elo: ["Australia"],
  },
  TUR: {
    code: "TUR",
    name: "Turkey",
    group: "D",
    isHost: false,
    openfootball: "Turkey",
    footballData: ["Turkey", "Türkiye", "Turkiye"],
    oddsApi: ["Turkey", "Türkiye", "Turkiye"],
    elo: ["Turkey", "Türkiye"],
  },
  // ----- Group E -----
  GER: {
    code: "GER",
    name: "Germany",
    group: "E",
    isHost: false,
    openfootball: "Germany",
    footballData: ["Germany"],
    oddsApi: ["Germany"],
    elo: ["Germany"],
  },
  CUW: {
    code: "CUW",
    name: "Curaçao",
    group: "E",
    isHost: false,
    openfootball: "Curaçao",
    footballData: ["Curaçao", "Curacao"],
    oddsApi: ["Curaçao", "Curacao"],
    elo: ["Curaçao", "Curacao"],
  },
  ECU: {
    code: "ECU",
    name: "Ecuador",
    group: "E",
    isHost: false,
    openfootball: "Ecuador",
    footballData: ["Ecuador"],
    oddsApi: ["Ecuador"],
    elo: ["Ecuador"],
  },
  CIV: {
    code: "CIV",
    name: "Ivory Coast",
    group: "E",
    isHost: false,
    openfootball: "Ivory Coast",
    footballData: ["Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire"],
    oddsApi: ["Ivory Coast", "Côte d'Ivoire", "Cote D'Ivoire"],
    elo: ["Ivory Coast", "Côte d'Ivoire"],
  },
  // ----- Group F -----
  NED: {
    code: "NED",
    name: "Netherlands",
    group: "F",
    isHost: false,
    openfootball: "Netherlands",
    footballData: ["Netherlands", "Holland"],
    oddsApi: ["Netherlands", "Holland"],
    elo: ["Netherlands"],
  },
  JPN: {
    code: "JPN",
    name: "Japan",
    group: "F",
    isHost: false,
    openfootball: "Japan",
    footballData: ["Japan"],
    oddsApi: ["Japan"],
    elo: ["Japan"],
  },
  SWE: {
    code: "SWE",
    name: "Sweden",
    group: "F",
    isHost: false,
    openfootball: "Sweden",
    footballData: ["Sweden"],
    oddsApi: ["Sweden"],
    elo: ["Sweden"],
  },
  TUN: {
    code: "TUN",
    name: "Tunisia",
    group: "F",
    isHost: false,
    openfootball: "Tunisia",
    footballData: ["Tunisia"],
    oddsApi: ["Tunisia"],
    elo: ["Tunisia"],
  },
  // ----- Group G -----
  BEL: {
    code: "BEL",
    name: "Belgium",
    group: "G",
    isHost: false,
    openfootball: "Belgium",
    footballData: ["Belgium"],
    oddsApi: ["Belgium"],
    elo: ["Belgium"],
  },
  EGY: {
    code: "EGY",
    name: "Egypt",
    group: "G",
    isHost: false,
    openfootball: "Egypt",
    footballData: ["Egypt"],
    oddsApi: ["Egypt"],
    elo: ["Egypt"],
  },
  IRN: {
    code: "IRN",
    name: "Iran",
    group: "G",
    isHost: false,
    openfootball: "Iran",
    footballData: ["Iran", "IR Iran"],
    oddsApi: ["Iran", "IR Iran"],
    elo: ["Iran"],
  },
  NZL: {
    code: "NZL",
    name: "New Zealand",
    group: "G",
    isHost: false,
    openfootball: "New Zealand",
    footballData: ["New Zealand"],
    oddsApi: ["New Zealand"],
    elo: ["New Zealand"],
  },
  // ----- Group H -----
  ESP: {
    code: "ESP",
    name: "Spain",
    group: "H",
    isHost: false,
    openfootball: "Spain",
    footballData: ["Spain"],
    oddsApi: ["Spain"],
    elo: ["Spain"],
  },
  CPV: {
    code: "CPV",
    name: "Cape Verde",
    group: "H",
    isHost: false,
    openfootball: "Cape Verde",
    footballData: ["Cape Verde Islands", "Cape Verde", "Cabo Verde"],
    oddsApi: ["Cape Verde", "Cabo Verde"],
    elo: ["Cape Verde"],
  },
  KSA: {
    code: "KSA",
    name: "Saudi Arabia",
    group: "H",
    isHost: false,
    openfootball: "Saudi Arabia",
    footballData: ["Saudi Arabia"],
    oddsApi: ["Saudi Arabia"],
    elo: ["Saudi Arabia"],
  },
  URU: {
    code: "URU",
    name: "Uruguay",
    group: "H",
    isHost: false,
    openfootball: "Uruguay",
    footballData: ["Uruguay"],
    oddsApi: ["Uruguay"],
    elo: ["Uruguay"],
  },
  // ----- Group I -----
  FRA: {
    code: "FRA",
    name: "France",
    group: "I",
    isHost: false,
    openfootball: "France",
    footballData: ["France"],
    oddsApi: ["France"],
    elo: ["France"],
  },
  SEN: {
    code: "SEN",
    name: "Senegal",
    group: "I",
    isHost: false,
    openfootball: "Senegal",
    footballData: ["Senegal"],
    oddsApi: ["Senegal"],
    elo: ["Senegal"],
  },
  IRQ: {
    code: "IRQ",
    name: "Iraq",
    group: "I",
    isHost: false,
    openfootball: "Iraq",
    footballData: ["Iraq"],
    oddsApi: ["Iraq"],
    elo: ["Iraq"],
  },
  NOR: {
    code: "NOR",
    name: "Norway",
    group: "I",
    isHost: false,
    openfootball: "Norway",
    footballData: ["Norway"],
    oddsApi: ["Norway"],
    elo: ["Norway"],
  },
  // ----- Group J -----
  ARG: {
    code: "ARG",
    name: "Argentina",
    group: "J",
    isHost: false,
    openfootball: "Argentina",
    footballData: ["Argentina"],
    oddsApi: ["Argentina"],
    elo: ["Argentina"],
  },
  ALG: {
    code: "ALG",
    name: "Algeria",
    group: "J",
    isHost: false,
    openfootball: "Algeria",
    footballData: ["Algeria"],
    oddsApi: ["Algeria"],
    elo: ["Algeria"],
  },
  AUT: {
    code: "AUT",
    name: "Austria",
    group: "J",
    isHost: false,
    openfootball: "Austria",
    footballData: ["Austria"],
    oddsApi: ["Austria"],
    elo: ["Austria"],
  },
  JOR: {
    code: "JOR",
    name: "Jordan",
    group: "J",
    isHost: false,
    openfootball: "Jordan",
    footballData: ["Jordan"],
    oddsApi: ["Jordan"],
    elo: ["Jordan"],
  },
  // ----- Group K -----
  POR: {
    code: "POR",
    name: "Portugal",
    group: "K",
    isHost: false,
    openfootball: "Portugal",
    footballData: ["Portugal"],
    oddsApi: ["Portugal"],
    elo: ["Portugal"],
  },
  COL: {
    code: "COL",
    name: "Colombia",
    group: "K",
    isHost: false,
    openfootball: "Colombia",
    footballData: ["Colombia"],
    oddsApi: ["Colombia"],
    elo: ["Colombia"],
  },
  COD: {
    code: "COD",
    name: "DR Congo",
    group: "K",
    isHost: false,
    openfootball: "DR Congo",
    footballData: [
      "DR Congo",
      "Congo DR",
      "Democratic Republic of the Congo",
      "Dem. Rep. Congo",
    ],
    oddsApi: ["DR Congo", "Democratic Republic of the Congo", "Congo DR"],
    elo: ["DR Congo"],
  },
  UZB: {
    code: "UZB",
    name: "Uzbekistan",
    group: "K",
    isHost: false,
    openfootball: "Uzbekistan",
    footballData: ["Uzbekistan"],
    oddsApi: ["Uzbekistan"],
    elo: ["Uzbekistan"],
  },
  // ----- Group L -----
  ENG: {
    code: "ENG",
    name: "England",
    group: "L",
    isHost: false,
    openfootball: "England",
    footballData: ["England"],
    oddsApi: ["England"],
    elo: ["England"],
  },
  CRO: {
    code: "CRO",
    name: "Croatia",
    group: "L",
    isHost: false,
    openfootball: "Croatia",
    footballData: ["Croatia"],
    oddsApi: ["Croatia"],
    elo: ["Croatia"],
  },
  GHA: {
    code: "GHA",
    name: "Ghana",
    group: "L",
    isHost: false,
    openfootball: "Ghana",
    footballData: ["Ghana"],
    oddsApi: ["Ghana"],
    elo: ["Ghana"],
  },
  PAN: {
    code: "PAN",
    name: "Panama",
    group: "L",
    isHost: false,
    openfootball: "Panama",
    footballData: ["Panama"],
    oddsApi: ["Panama"],
    elo: ["Panama"],
  },
};

/**
 * Normalize a team name for fuzzy-exact matching: lowercase, strip
 * diacritics, collapse punctuation/whitespace runs to single spaces.
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Space-free variant so "U.S.A." still matches the "USA" alias. */
function squash(normalized: string): string {
  return normalized.replace(/ /g, "");
}

const exactLookup = new Map<string, TeamNameEntry>();
const normalizedLookup = new Map<string, TeamNameEntry>();
const squashedLookup = new Map<string, TeamNameEntry>();

for (const entry of Object.values(TEAM_NAME_MAP)) {
  const aliases = [
    entry.code,
    entry.name,
    entry.openfootball,
    ...entry.footballData,
    ...entry.oddsApi,
    ...entry.elo,
  ];
  for (const alias of aliases) {
    const normalized = normalizeTeamName(alias);
    exactLookup.set(alias, entry);
    normalizedLookup.set(normalized, entry);
    squashedLookup.set(squash(normalized), entry);
  }
}

/**
 * Resolve a raw source spelling to a team entry.
 * Exact match → normalized match (incl. space-free form) → null.
 *
 * On null the caller MUST log the miss (syncAudit) and skip the row —
 * never guess.
 */
export function resolveTeamName(raw: string): TeamNameEntry | null {
  if (!raw) return null;
  const exact = exactLookup.get(raw);
  if (exact) return exact;
  const normalized = normalizeTeamName(raw);
  return (
    normalizedLookup.get(normalized) ??
    squashedLookup.get(squash(normalized)) ??
    null
  );
}

/** All 48 FIFA trigrams. */
export function allTeamCodes(): string[] {
  return Object.keys(TEAM_NAME_MAP);
}
