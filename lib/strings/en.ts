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
  // Bets screen (issue #6) — appended as one trailing section.
  bets: {
    roi: {
      staked: "Staked",
      returned: "Returned",
      yield: "Yield",
    },
    sections: {
      proposed: (count: number) => `Proposed · ${count}`,
      placed: (count: number) => `Placed · ${count}`,
      settled: "Settled",
    },
    empty: "No bets yet — add one from a match's markets or ask the chat.",
    /** Bare grouped number → display amount, e.g. "2,400" → "2,400 Kč". */
    amount: (formatted: string) => `${formatted} Kč`,
    bttsNo: "BTTS no",
    card: {
      selectionAtOdds: (selection: string, odds: string) =>
        `${selection} @ ${odds}`,
      vs: (opponent: string) => `vs ${opponent}`,
      edge: (edge: string) => `edge ${edge}`,
      source: {
        analysis: "from analysis",
        chat: "from chat",
        manual: "manual",
      },
      removeAria: (label: string) => `Dismiss ${label}`,
      editStakeAria: (label: string) => `Edit stake for ${label}`,
    },
    place: "Place",
    placeWith: (amount: string) => `Place · ${amount}`,
    awaiting: "Awaiting",
    pills: {
      won: (net: string) => `Won ${net}`,
      lost: (net: string) => `Lost ${net}`,
      void: "Void",
    },
    dialog: {
      placeTitle: "Place bet",
      placeDescription:
        "Record the stake you put on this bet on your betting platform.",
      updateTitle: "Update stake",
      updateDescription: "Adjust the recorded stake for this placed bet.",
      stakeLabel: "Stake (Kč)",
      suggested: (amount: string) =>
        `Suggested ${amount} — fractional Kelly from your bankroll.`,
      returns: (amount: string) => `Returns ${amount} if it wins.`,
      confirmPlace: "Confirm placed",
      confirmUpdate: "Save stake",
      cancel: "Cancel",
    },
    settleNote:
      "1X2, O/U 2.5 and BTTS settle on the 90-minute result — knockout extra time and penalties don't count.",
  },
} as const;

export type Strings = typeof en;
