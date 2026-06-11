import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Full football-data pass: kickoff changes, knockout slot resolution
 * (TBD → teams), venue/status/score updates.
 */
crons.interval(
  "fixtures-sync",
  { hours: 6 },
  internal.sync.footballData.fixturesSync,
  {},
);

/**
 * Results polling. GUARDED by shouldPollResults — outside live windows the
 * run makes zero API calls (free-tier budget).
 */
crons.interval(
  "results-sync",
  { minutes: 10 },
  internal.sync.footballData.resultsSync,
  {},
);

/** Refresh team Elo ratings from eloratings.net (no API key). */
crons.daily(
  "elo-nightly",
  { hourUTC: 3, minuteUTC: 30 },
  internal.sync.elo.nightly,
  {},
);

export default crons;
