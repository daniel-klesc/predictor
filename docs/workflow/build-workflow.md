# Build workflow

Used by `/issues-build`. See your agent skill for GitHub MCP steps.

## Build modes

Pass a flag to `/issues-build` to choose a mode:

| Mode | Flag | Behavior |
|---|---|---|
| Supervised (default) | _(none)_ | Sub-issue PRs target `main`. Claude opens each PR and stops — you review, merge, trigger next wave. |
| Autonomous | `--auto` | Three-level staging branch. Claude auto-merges sub-PRs after CI; opens one staging → main PR for you to review. |
| Epic | `--epic N` | Same as `--auto` but staging branch is named `epic/N-slug`; sub-issues auto-discovered from GitHub native sub-issues on issue N. |
| Small-changes | `--small-changes` | Auto-merges sub-PRs into the permanent `build/small-changes` accumulator, but does NOT open the → main PR. Batch across runs; ship with `--finalize-small-changes`. |

**Wave references** — pass `wave-1`, `wave-2`, etc. instead of issue numbers; `/issues-build` reads `.claude/wave-plan.json` written by `/issues-plan`. Run `/issues-plan` first, or use `/issues-plan --run wave-1` / `/issues-plan --auto all` to plan and build in one shot.

See `.agents/skills/issues-build/SKILL.md` for full mode details and PR creation steps.

## Small-changes accumulator

`build/small-changes` is a **permanent, reusable** accumulator branch (the `--auto` staging branch made long-lived). Use it to batch unrelated small fixes — issues labelled `small-change` — across multiple `/issues-build --small-changes` runs without opening a → main PR each time.

- First run cuts `build/small-changes` from `main` and pushes it; later runs reuse the existing branch.
- Each issue gets a `type/N-slug` branch off it; sub-PRs target it and auto-merge after CI.
- When ready, `/issues-build --finalize-small-changes` opens the single `build/small-changes → main` PR and pauses for review.

**Stale-local-branch hazard:** after the finalize PR merges, origin deletes `build/small-changes`, but the **local** copy survives. On the next batch it silently collides with the fresh-from-`main` branch you mean to cut, carrying stale commits forward. Always `git branch -D build/small-changes` before recreating.

## Parallel workflow

With multiple issues, use isolated worktrees per sub-agent. Orchestrator opens PRs with `Closes #N`.

### Subagent template (summary)

- Branch: `<type>/<issue>-<slug>` from `main`
- Read `CLAUDE.md` for project conventions
- Run CI gates below before push
- Do not open the PR yourself if the orchestrator does

## Worktree layout

Use `.claude/worktrees/agent-working-on-issue-{N}` under the repo root.

## Parallel constraints

- Do not assign two agents to the same issue
- Serialize work that touches the same migration/schema files (adjust paths for your stack)
- Cap parallel batch size (e.g. 5)

## CI gates

```bash
npm run check
npx tsc --noEmit
npm run test:run
```

Replace with your project's commands in `standards-kit.config.json` / `CLAUDE.md` if different.

## Main branch

Use `git pull --ff-only` on `main` after merges. If it fails, reset to `origin/main` per your team policy.

## PR template

Use `.github/pull_request_template.md` and include `Closes #N` in the body.
