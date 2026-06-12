# predictor â€” Claude Code guide

## Repo

GitHub: `daniel-klesc/predictor`

## Execution model

- Prefer delegating implementation to a sub-agent when the user approves a plan; keep the main session for planning and review when that fits your workflow.
- Follow `docs/workflow.md` for issue labels, branches, and PR expectations.
- **Non-issue-driven work:** always branch from `main` with `<type>/<short-slug>` (e.g. `chore/docs-typo`). Never commit ad-hoc work directly to `main` unless the user explicitly overrides. Details: `docs/workflow.md` (Non-issue-driven work).

## Slash commands (Claude Code)

Commands live in `.claude/commands/` and load skills from `.agents/skills/`.

- `/issues-status` â€” backlog snapshot
- `/issues-triage` â€” capture findings as GitHub issues
- `/issues-refine #N` â€” refine an issue; promote to `backlog`
- `/issues-plan` â€” conflict-aware plan and `/issues-build` waves
- `/issues-build` â€” run backlog issues (orchestration; needs GitHub MCP)
- `/issues-dedupe` â€” find duplicate issues
- `/worktree-clean` â€” remove stale worktrees, orphaned disk dirs, and leftover agent branches
- `/branch-prune` â€” delete local branches whose upstream is gone after PR merges

## Skills

See `.agents/skills/issues-*/SKILL.md`. They assume **GitHub MCP** is available for issue and PR operations.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack) + React 19, TypeScript strict
- **Backend:** Convex (`convex/`) with `@convex-dev/auth` password auth (no email verification). Keep `convex/schema.ts` additive — auth tables live there; app tables are owned by the schema issue.
- **Styling:** Tailwind CSS 4, CSS-first — ALL theme config in `app/globals.css` `@theme` blocks; **no `tailwind.config.ts`**. shadcn/ui (radix preset) in `components/ui/`.
- **AI:** `@anthropic-ai/sdk` (server-only; chat backend issue). **Validation:** zod.
- **Tests:** vitest, files in `tests/**/*.test.ts`.

### Dev commands

- `npm run dev` (Next) + `npx convex dev` (Convex watcher) — run both for local dev
- `npm run build` — production build sanity check

### CI gates (all must pass before push)

```bash
npm run check     # eslint . && prettier --check .
npx tsc --noEmit
npm run test:run  # vitest run
```

### Design-token rules (app/globals.css)

- 3-layer system: **raw HSL triplets** (no `hsl()` wrapper, e.g. `--volt-500: 80 95% 55%`) → **semantic tokens** (`--background`, `--primary`, `--value-strong`, `--edge-positive`, …; dark is default on `:root`, light overrides on `.light`) → **`@theme inline`** mapping to utilities.
- Style ONLY with token-driven Tailwind utilities — **no raw hex/hsl in `className`**, no parallel CSS class system. Lint-enforced: raw hex / `hsl()` / `rgb()` in `className` (app/**, components/**) fails `npm run check` (selectors: `eslint-rules/design-tokens.mjs`).
- **Minimum text size 12px** (`text-xs`) — never smaller.
- Radii: `rounded-card` (12px) and `rounded-tile` (10px) for surfaces.
- Fonts via next/font: `font-display` (Barlow Condensed — headings/numbers) and `font-body` (Source Sans 3); no CSS `@import` for fonts.
- ALL user-facing strings come from `lib/strings/en.ts` — never hardcode UI text.

### Environment variables

- `.env.local` (gitignored; see `.env.example`): `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`
- Vercel: `NEXT_PUBLIC_CONVEX_URL`, `ANTHROPIC_API_KEY` (server-only)
- Convex deployment (`npx convex env set`): `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`, `FOOTBALL_DATA_API_KEY`, `ODDS_API_KEY`
- NEVER commit `.env*` files or real secret values.

## Workflow docs

- `docs/workflow.md` â€” session order and single-issue flow
- `docs/workflow/issue-reference.md` â€” labels, templates, checklists
- `docs/workflow/build-workflow.md` â€” parallel work, CI gates, PRs
