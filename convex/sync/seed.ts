/**
 * One-shot (re-runnable, idempotent) tournament seed.
 *
 * Run with: npx convex run sync/seed:run
 *
 * 1. openfootball worldcup.json → 48 teams + 104 matches
 * 2. eloratings.net TSV → initial team Elo ratings (fatal if any team missing)
 * 3. football-data.org /v4/competitions/WC/matches → footballDataId per
 *    match/team (SKIPPED with a syncAudit warning when FOOTBALL_DATA_API_KEY
 *    is not set — re-run the seed later to complete the linking)
 *
 * Upserts by team code / matchNumber — never duplicates. Fails loudly
 * (throw + syncAudit error row) when any team cannot be resolved in the
 * alias map or any Elo entry is missing, listing exactly which.
 */
import { v } from "convex/values";

import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  ELO_TEAMS_TSV_URL,
  ELO_WORLD_TSV_URL,
  eloRatingsByTeamCode,
  parseEloTsv,
} from "../lib/eloTsv";
import {
  type FdMatchesResponse,
  pairingKey,
  resolveFdTeamCode,
} from "../lib/footballDataApi";
import {
  OPENFOOTBALL_URL,
  type OpenfootballJson,
  parseOpenfootball,
} from "../lib/openfootball";
import { stageValidator } from "../schema";
import { errorMessage, fetchJson, fetchText } from "./util";

const FOOTBALL_DATA_MATCHES_URL =
  "https://api.football-data.org/v4/competitions/WC/matches";

interface UpsertCounts {
  inserted: number;
  updated: number;
}

interface SeedSummary {
  teams: UpsertCounts;
  matches: UpsertCounts;
  footballDataLinked: number;
  notes: string[];
}

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<SeedSummary> => {
    const startedAt = Date.now();
    const details: string[] = [];
    try {
      // ---- 1) openfootball: teams + schedule (source of truth) ----
      const raw = (await fetchJson(OPENFOOTBALL_URL)) as OpenfootballJson;
      const { teams, matches } = parseOpenfootball(raw);

      const problems: string[] = [];
      if (teams.length !== 48) {
        problems.push(
          `expected 48 teams, parsed ${teams.length}: ${teams.map((t) => t.code).join(", ")}`,
        );
      }
      if (matches.length !== 104) {
        problems.push(`expected 104 matches, parsed ${matches.length}`);
      }
      const numbers = new Set(matches.map((m) => m.matchNumber));
      for (let n = 1; n <= 104; n += 1) {
        if (!numbers.has(n)) problems.push(`match number ${n} missing`);
      }
      if (problems.length > 0) {
        throw new Error(`seed validation failed:\n- ${problems.join("\n- ")}`);
      }

      // ---- 2) eloratings.net: initial Elo (fatal when a team is missing) ----
      const [worldTsv, teamsTsv] = await Promise.all([
        fetchText(ELO_WORLD_TSV_URL),
        fetchText(ELO_TEAMS_TSV_URL),
      ]);
      const eloByCode = eloRatingsByTeamCode(parseEloTsv(worldTsv, teamsTsv));
      const missingElo = teams.filter((team) => !eloByCode.has(team.code));
      if (missingElo.length > 0) {
        throw new Error(
          `Elo rating missing for: ${missingElo
            .map((t) => `${t.code} (${t.name})`)
            .join(", ")} — eloratings.net TSV had no resolvable entry`,
        );
      }

      // ---- 3) upsert teams, then matches (matches resolve codes → ids) ----
      const teamResult: UpsertCounts = await ctx.runMutation(
        internal.sync.seed.upsertTeams,
        {
          teams: teams.map((team) => {
            const elo = eloByCode.get(team.code)!;
            return {
              code: team.code,
              name: team.name,
              group: team.group,
              isHost: team.isHost,
              elo: elo.rating,
              eloName: elo.eloName,
            };
          }),
        },
      );
      const matchResult: UpsertCounts = await ctx.runMutation(
        internal.sync.seed.upsertMatches,
        {
          matches: matches.map((match) => ({
            matchNumber: match.matchNumber,
            stage: match.stage,
            kickoffAt: match.kickoffAt,
            city: match.city,
            group: match.group,
            homeCode: match.homeCode,
            awayCode: match.awayCode,
            homePlaceholder: match.homePlaceholder,
            awayPlaceholder: match.awayPlaceholder,
          })),
        },
      );

      // ---- 4) football-data.org: capture external ids (optional) ----
      let fdLinked = 0;
      const apiKey = process.env.FOOTBALL_DATA_API_KEY;
      if (!apiKey) {
        details.push(
          "WARNING: football-data step skipped — FOOTBALL_DATA_API_KEY not set on the deployment; re-run sync/seed:run after setting it",
        );
      } else {
        const fd = (await fetchJson(FOOTBALL_DATA_MATCHES_URL, {
          headers: { "X-Auth-Token": apiKey },
        })) as FdMatchesResponse;
        const unresolved = new Set<string>();
        const matchLinks: Array<{
          pairingKey: string;
          footballDataId: number;
        }> = [];
        const teamLinks = new Map<string, number>();
        for (const fdMatch of fd.matches ?? []) {
          const homeCode = resolveFdTeamCode(fdMatch.homeTeam);
          const awayCode = resolveFdTeamCode(fdMatch.awayTeam);
          for (const [team, code] of [
            [fdMatch.homeTeam, homeCode],
            [fdMatch.awayTeam, awayCode],
          ] as const) {
            if (team?.name && !code) unresolved.add(team.name);
            if (code && team?.id != null && !teamLinks.has(code)) {
              teamLinks.set(code, team.id);
            }
          }
          if (!homeCode || !awayCode) continue; // TBD or unresolved — skip, never guess
          const kickoffMs = Date.parse(fdMatch.utcDate);
          if (!Number.isFinite(kickoffMs)) continue;
          matchLinks.push({
            pairingKey: pairingKey(kickoffMs, homeCode, awayCode),
            footballDataId: fdMatch.id,
          });
        }
        if (unresolved.size > 0) {
          details.push(
            `football-data teams skipped (no alias-map match): ${[...unresolved].join(", ")}`,
          );
        }
        const linkResult: { matchesLinked: number; teamsLinked: number } =
          await ctx.runMutation(internal.sync.seed.linkFootballData, {
            matchLinks,
            teamLinks: [...teamLinks.entries()].map(
              ([code, footballDataId]) => ({
                code,
                footballDataId,
              }),
            ),
          });
        fdLinked = linkResult.matchesLinked + linkResult.teamsLinked;
        details.push(
          `football-data linked: ${linkResult.matchesLinked} matches, ${linkResult.teamsLinked} teams`,
        );
      }

      const itemsUpdated =
        teamResult.inserted +
        teamResult.updated +
        matchResult.inserted +
        matchResult.updated +
        fdLinked;
      await ctx.runMutation(internal.sync.audit.log, {
        source: "seed",
        startedAt,
        finishedAt: Date.now(),
        ok: true,
        itemsUpdated,
        detail: details.length > 0 ? details.join(" | ") : undefined,
      });

      // Predictions are event-driven — schedule the (stub) recompute.
      await ctx.scheduler.runAfter(0, internal.predictions.recomputeAll, {});

      return {
        teams: teamResult,
        matches: matchResult,
        footballDataLinked: fdLinked,
        notes: details,
      };
    } catch (error) {
      await ctx.runMutation(internal.sync.audit.log, {
        source: "seed",
        startedAt,
        finishedAt: Date.now(),
        ok: false,
        itemsUpdated: 0,
        error: errorMessage(error),
        detail: details.length > 0 ? details.join(" | ") : undefined,
      });
      throw error;
    }
  },
});

/** Upsert the 48 teams by FIFA code. Preserves squadValueEur and ext ids. */
export const upsertTeams = internalMutation({
  args: {
    teams: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        group: v.string(),
        isHost: v.boolean(),
        elo: v.number(),
        eloName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { teams }) => {
    let inserted = 0;
    let updated = 0;
    for (const team of teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_code", (q) => q.eq("code", team.code))
        .unique();
      const ext = team.eloName ? { eloName: team.eloName } : undefined;
      if (existing === null) {
        await ctx.db.insert("teams", {
          code: team.code,
          name: team.name,
          group: team.group,
          isHost: team.isHost,
          elo: team.elo,
          ext,
        });
        inserted += 1;
      } else {
        await ctx.db.patch(existing._id, {
          name: team.name,
          group: team.group,
          isHost: team.isHost,
          elo: team.elo,
          ext: { ...existing.ext, ...ext },
        });
        updated += 1;
      }
    }
    return { inserted, updated };
  },
});

/**
 * Upsert the 104 matches by matchNumber. New matches start "scheduled";
 * existing matches keep their status/score/winner (results-sync owns those)
 * and only refresh schedule fields. Throws (rolling back the transaction)
 * when a referenced team code does not exist.
 */
export const upsertMatches = internalMutation({
  args: {
    matches: v.array(
      v.object({
        matchNumber: v.number(),
        stage: stageValidator,
        kickoffAt: v.number(),
        city: v.optional(v.string()),
        group: v.optional(v.string()),
        homeCode: v.optional(v.string()),
        awayCode: v.optional(v.string()),
        homePlaceholder: v.optional(v.string()),
        awayPlaceholder: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { matches }) => {
    const teams = await ctx.db.query("teams").collect();
    const teamIdByCode = new Map(teams.map((team) => [team.code, team._id]));

    const missingCodes = new Set<string>();
    for (const match of matches) {
      for (const code of [match.homeCode, match.awayCode]) {
        if (code && !teamIdByCode.has(code)) missingCodes.add(code);
      }
    }
    if (missingCodes.size > 0) {
      throw new Error(
        `matches reference team codes missing from the teams table: ${[...missingCodes].join(", ")}`,
      );
    }

    let inserted = 0;
    let updated = 0;
    for (const match of matches) {
      const homeTeamId = match.homeCode
        ? teamIdByCode.get(match.homeCode)
        : undefined;
      const awayTeamId = match.awayCode
        ? teamIdByCode.get(match.awayCode)
        : undefined;
      const existing = await ctx.db
        .query("matches")
        .withIndex("by_matchNumber", (q) =>
          q.eq("matchNumber", match.matchNumber),
        )
        .unique();
      if (existing === null) {
        await ctx.db.insert("matches", {
          matchNumber: match.matchNumber,
          stage: match.stage,
          kickoffAt: match.kickoffAt,
          city: match.city,
          group: match.group,
          homeTeamId,
          awayTeamId,
          homePlaceholder: match.homePlaceholder,
          awayPlaceholder: match.awayPlaceholder,
          status: "scheduled",
        });
        inserted += 1;
      } else {
        await ctx.db.patch(existing._id, {
          stage: match.stage,
          kickoffAt: match.kickoffAt,
          city: match.city ?? existing.city,
          group: match.group ?? existing.group,
          homeTeamId: homeTeamId ?? existing.homeTeamId,
          awayTeamId: awayTeamId ?? existing.awayTeamId,
          homePlaceholder: match.homePlaceholder ?? existing.homePlaceholder,
          awayPlaceholder: match.awayPlaceholder ?? existing.awayPlaceholder,
        });
        updated += 1;
      }
    }
    return { inserted, updated };
  },
});

/** Store football-data ids on teams (by code) and matches (by pairing key). */
export const linkFootballData = internalMutation({
  args: {
    matchLinks: v.array(
      v.object({ pairingKey: v.string(), footballDataId: v.number() }),
    ),
    teamLinks: v.array(
      v.object({ code: v.string(), footballDataId: v.number() }),
    ),
  },
  handler: async (ctx, { matchLinks, teamLinks }) => {
    const teams = await ctx.db.query("teams").collect();
    const teamByCode = new Map(teams.map((team) => [team.code, team]));
    const codeByTeamId = new Map(teams.map((team) => [team._id, team.code]));

    let teamsLinked = 0;
    for (const link of teamLinks) {
      const team = teamByCode.get(link.code);
      if (!team) continue;
      if (team.ext?.footballDataId !== link.footballDataId) {
        await ctx.db.patch(team._id, {
          ext: { ...team.ext, footballDataId: link.footballDataId },
        });
        teamsLinked += 1;
      }
    }

    const matches = await ctx.db.query("matches").collect();
    const matchByPairingKey = new Map<string, (typeof matches)[number]>();
    for (const match of matches) {
      if (!match.homeTeamId || !match.awayTeamId) continue;
      const homeCode = codeByTeamId.get(match.homeTeamId);
      const awayCode = codeByTeamId.get(match.awayTeamId);
      if (!homeCode || !awayCode) continue;
      matchByPairingKey.set(
        pairingKey(match.kickoffAt, homeCode, awayCode),
        match,
      );
    }

    let matchesLinked = 0;
    for (const link of matchLinks) {
      const match = matchByPairingKey.get(link.pairingKey);
      if (!match) continue;
      if (match.ext?.footballDataId !== link.footballDataId) {
        await ctx.db.patch(match._id, {
          ext: { ...match.ext, footballDataId: link.footballDataId },
        });
        matchesLinked += 1;
      }
    }
    return { matchesLinked, teamsLinked };
  },
});

/** Quick verification counts: npx convex run sync/seed:counts */
export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [teams, matches, audit] = await Promise.all([
      ctx.db.query("teams").collect(),
      ctx.db.query("matches").collect(),
      ctx.db.query("syncAudit").collect(),
    ]);
    return {
      teams: teams.length,
      matches: matches.length,
      syncAuditRows: audit.length,
      lastAudit: audit.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
    };
  },
});
