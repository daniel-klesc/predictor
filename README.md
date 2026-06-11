# Predictor

Match predictions, odds edges, and bet tracking for the 2026 World Cup. A
personal mobile-first PWA: Next.js 16 (App Router) + Convex, dark navy +
volt design system.

## Getting started

```bash
npm install

# Terminal 1 — Convex dev deployment (provisions on first run, watches convex/)
npx convex dev

# Terminal 2 — Next.js dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to
`/signin`. Create an account with email + password (no email verification).

### First-time auth setup

`@convex-dev/auth` needs three env vars on the **Convex deployment** (not in
`.env.local`). The setup wizard handles them:

```bash
npx @convex-dev/auth
```

or set them manually: `SITE_URL` (e.g. `http://localhost:3000`),
`JWT_PRIVATE_KEY` and `JWKS` (RS256 key pair) via `npx convex env set`.

## Environment variables

Documented in [.env.example](.env.example) — copy values into `.env.local`
(gitignored). **Never commit real values.**

| Variable                   | Where                 | Purpose                                |
| -------------------------- | --------------------- | -------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`   | `.env.local` / Vercel | Convex deployment URL (client)         |
| `CONVEX_DEPLOYMENT`        | `.env.local`          | Dev deployment id (written by the CLI) |
| `ANTHROPIC_API_KEY`        | Vercel (server-only)  | Chat backend (later issue)             |
| `SITE_URL`                 | Convex deployment     | Auth redirects                         |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex deployment     | Auth token signing                     |
| `FOOTBALL_DATA_API_KEY`    | Convex deployment     | Fixtures/results (later issue)         |
| `ODDS_API_KEY`             | Convex deployment     | Odds ingestion (later issue)           |

## Scripts

| Script             | What it does                      |
| ------------------ | --------------------------------- |
| `npm run dev`      | Next.js dev server                |
| `npm run build`    | Production build                  |
| `npm run check`    | ESLint + prettier check (CI gate) |
| `npm run test:run` | Vitest, single pass (CI gate)     |
| `npm run test`     | Vitest in watch mode              |

CI gates before any push: `npm run check` · `npx tsc --noEmit` ·
`npm run test:run` (see `docs/workflow/build-workflow.md`).

## Design system

3-layer token system in `app/globals.css` (Tailwind 4 CSS-first — no
`tailwind.config.ts`): raw HSL scales → semantic tokens (dark default) →
`@theme inline` utility mapping. Navy surfaces, **volt** (`80 95% 55%`)
primary accent, teal secondary. Tokens-only styling; minimum text size 12px.
