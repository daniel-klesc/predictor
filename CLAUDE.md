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

## Tech stack (fill in)

Document your stack, test commands, and coding rules here (e.g. framework, linter, test runner, backend).

- CI gates before push: see `docs/workflow/build-workflow.md`

## Workflow docs

- `docs/workflow.md` â€” session order and single-issue flow
- `docs/workflow/issue-reference.md` â€” labels, templates, checklists
- `docs/workflow/build-workflow.md` â€” parallel work, CI gates, PRs
