/**
 * Group standings computed from finished group-stage results. Pure and
 * unit-tested; the Groups view feeds it the live matches + teams queries.
 */

export interface StandingsTeam {
  code: string;
  name: string;
  group: string;
}

export interface StandingsMatch {
  stage: string;
  status: string;
  homeCode?: string | null;
  awayCode?: string | null;
  score?: { home: number; away: number } | null;
}

export interface StandingRow {
  code: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export interface GroupStandings {
  /** Group letter "A".."L". */
  group: string;
  rows: StandingRow[];
}

/**
 * One standings table per group, A→L. Counts only finished group-stage
 * matches with both teams resolved and a score. Rows sort by points, goal
 * difference, goals for, then name (display ordering — official FIFA
 * tie-breaks need head-to-head and arrive with the knockout issue).
 */
export function groupStandings(
  teams: readonly StandingsTeam[],
  matches: readonly StandingsMatch[],
): GroupStandings[] {
  const rowsByCode = new Map<string, StandingRow>();
  const groups = new Map<string, StandingRow[]>();
  for (const team of teams) {
    const row: StandingRow = {
      code: team.code,
      name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    };
    rowsByCode.set(team.code, row);
    const group = groups.get(team.group);
    if (group) group.push(row);
    else groups.set(team.group, [row]);
  }

  for (const match of matches) {
    if (match.stage !== "group" || match.status !== "finished") continue;
    if (!match.homeCode || !match.awayCode || !match.score) continue;
    const home = rowsByCode.get(match.homeCode);
    const away = rowsByCode.get(match.awayCode);
    if (!home || !away) continue;
    const { home: homeGoals, away: awayGoals } = match.score;
    applyResult(home, homeGoals, awayGoals);
    applyResult(away, awayGoals, homeGoals);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => ({
      group,
      rows: [...rows].sort(
        (a, b) =>
          b.points - a.points ||
          b.goalDiff - a.goalDiff ||
          b.goalsFor - a.goalsFor ||
          a.name.localeCompare(b.name),
      ),
    }));
}

function applyResult(row: StandingRow, scored: number, conceded: number): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won += 1;
    row.points += 3;
  } else if (scored === conceded) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}
