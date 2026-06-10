/**
 * English UI strings. ALL user-facing text flows through this module
 * (future-translation-friendly) — never hardcode strings in components.
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
      empty: "No matches today yet. Fixtures land with the schedule issue.",
    },
    matches: {
      title: "Matches",
      empty: "The full match list arrives once the schedule is seeded.",
    },
    matchDetail: {
      title: "Match",
      empty: "Match detail coming soon.",
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
  },
} as const;

export type Strings = typeof en;
