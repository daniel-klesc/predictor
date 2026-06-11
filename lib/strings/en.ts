/**
 * English UI strings. ALL user-facing text flows through this module
 * (future-translation-friendly) — never hardcode strings in components.
 * Parametrized copy lives here too, as small template functions.
 */
export const en = {
  app: {
    name: "Predictor",
    tagline: "World Cup 2026 match predictions",
    description:
      "Match predictions, odds edges, and bet tracking for the 2026 World Cup.",
  },
  nav: {
    ariaLabel: "Primary navigation",
    today: "Today",
    matches: "Matches",
    chat: "Chat",
    bets: "Bets",
  },
  screens: {
    today: {
      title: "Today",
      empty: "No matches today.",
      valuePill: (count: number) =>
        count === 1 ? "1 value bet" : `${count} value bets`,
      tomorrow: (count: number) =>
        count === 1 ? "Tomorrow · 1 match" : `Tomorrow · ${count} matches`,
      nextMatchday: (day: string) => `Next matchday · ${day}`,
      refresh: "Refresh data",
    },
    matches: {
      title: "Matches",
      empty: "No matches found.",
      emptyFilter: "No matches for this filter.",
      views: {
        schedule: "Schedule",
        tournament: "Tournament",
        groups: "Groups",
      },
      viewsAriaLabel: "Matches view",
      stageFilterAriaLabel: "Stage filter",
      stageFilters: {
        all: "All",
        group: "Groups",
        r32: "R32",
        r16: "R16",
        qf: "QF",
        sf: "SF",
        final: "Final",
      },
      todayHeading: (day: string) => `Today · ${day}`,
      tomorrowHeading: (day: string) => `Tomorrow · ${day}`,
    },
    matchDetail: {
      title: "Match",
      empty: "Match not found.",
      back: "Back",
      matchNumber: (n: number) => `#${n}`,
      elo: (rating: number) => `Elo ${Math.round(rating)}`,
      eloUnknown: "Elo —",
      host: "host",
      hostAdvantage: (bonus: number) => `host advantage +${bonus} Elo`,
      noOddsNote: "No bookmaker odds yet — model probabilities only.",
      noPrediction: "Prediction arrives once both teams are known.",
      topScorelines: "Top scorelines",
      discussInChat: "Discuss in chat",
    },
    chat: {
      title: "Chat",
      empty: "Ask about any match or bet once the assistant is wired up.",
    },
    chatThread: {
      title: "Thread",
      empty: "This conversation thread is coming soon.",
    },
    bets: {
      title: "Bets",
      empty: "Tracked bets and your P/L will appear here.",
    },
  },
  match: {
    vs: "VS",
    live: "Live",
    fullTime: "FT",
    postponed: "Postponed",
    cancelled: "Cancelled",
    modelRow: "Model",
    marketRow: "Market",
    noOddsYet: "No odds yet",
    fairNoEdge: "Fair — no edge",
    bestOddsLabel: "best",
    valueWord: "Value",
    win: (team: string) => `${team} win`,
    draw: "Draw",
    over25: "Over 2.5 goals",
    under25: "Under 2.5 goals",
    bttsYes: "BTTS yes",
    over25Short: "Over 2.5",
    under25Short: "Under 2.5",
  },
  markets: {
    header: {
      market: "Market",
      model: "Model",
      odds: "Odds",
      edge: "Edge",
    },
    addToSlip: "+ Slip",
    added: "Added",
    addToSlipAria: (selection: string) => `Add ${selection} to slip`,
    noValue: "—",
  },
  stages: {
    group: "Group",
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter-final",
    sf: "Semi-final",
    third: "Third place",
    final: "Final",
  },
  placeholders: {
    winner: (match: string) => `Winner match ${match}`,
    loser: (match: string) => `Loser match ${match}`,
    groupWinner: (group: string) => `Group ${group} winner`,
    groupRunnerUp: (group: string) => `Group ${group} runner-up`,
    bestThird: (groups: string) => `3rd of ${groups}`,
    unknown: "TBD",
  },
  tournament: {
    meta: (runs: string, time: string) =>
      `${runs} simulations · updated ${time}`,
    oddsNote: "outright odds EU best",
    noOddsNote: "no outright odds yet",
    header: {
      team: "Team",
      champion: "Champion",
      odds: "Odds",
      edge: "Edge",
    },
    empty: "No simulation yet — the table fills in after the first run.",
  },
  groups: {
    title: (letter: string) => `Group ${letter}`,
    header: {
      team: "Team",
      played: "P",
      goalDiff: "GD",
      points: "Pts",
    },
  },
  settings: {
    title: "Settings",
    description: "Bankroll and app preferences.",
    bankrollLabel: "Bankroll",
    bankrollHint: "Used to size suggested stakes.",
    kellyLabel: "Kelly multiplier",
    kellyHint: "Scales recommended stakes down from full Kelly.",
    refreshAction: "Refresh data",
    refreshHint: "Re-fetch fixtures and odds.",
    comingSoon: "Coming soon",
    signOutAction: "Sign out",
  },
  auth: {
    signInTitle: "Sign in",
    signUpTitle: "Create account",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    signInAction: "Sign in",
    signUpAction: "Sign up",
    switchToSignUp: "No account? Create one",
    switchToSignIn: "Already have an account? Sign in",
    signInError: "Could not sign in. Check your email and password.",
    signUpError:
      "Could not create the account. Try a different email or a password with at least 8 characters.",
    pending: "Please wait…",
  },
  api: {
    notImplemented: "Not implemented yet.",
  },
  common: {
    loading: "Loading…",
    emDash: "—",
  },
  /** /api/chat responses + persisted error markers (chat backend issue #7). */
  chatApi: {
    unauthorized: "Unauthorized.",
    invalidRequest: "Invalid request — expected a JSON body with a threadId.",
    threadNotFound: "Thread not found.",
    noUserMessage: "No pending user message — send one before streaming.",
    notConfigured: "The chat backend is not configured on this server.",
    streamFailed: "The chat stream failed unexpectedly. Please try again.",
    modelRequestFailed: (status: string) => `Model request failed (${status}).`,
    replyNotSaved:
      "The reply finished but could not be saved to the thread history.",
    pauseLimitMarker:
      "Web search took too many rounds and was stopped — the answer may be incomplete.",
    iterationLimitMarker:
      "The assistant hit the per-turn tool budget and stopped.",
  },
  // Tournament outrights view (issue #9) — appended at the end per the
  // parallel-agent file boundaries; base table strings live in `tournament`.
  outrights: {
    noOddsHint:
      "Outright prices appear once the Odds API key is configured — sim probabilities are already live.",
    sortAriaLabel: "Sort tournament table",
    sort: {
      champion: "Champion %",
      edge: "Edge",
    },
    detail: {
      oddsLine: (odds: string, bookmaker: string, implied: string) =>
        `Best ${odds} (${bookmaker}) · implied ${implied}`,
      noPrice: "No outright price for this team yet.",
    },
    rounds: {
      winGroup: "Win group",
      r32: "R32",
      r16: "R16",
      qf: "QF",
      sf: "SF",
      final: "Final",
      champion: "Champion",
    },
  },
} as const;

export type Strings = typeof en;
