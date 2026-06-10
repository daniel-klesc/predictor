# Workflow guide

See `CLAUDE.md` for label rules and branch naming.

## References

- Issue conventions â†’ `docs/workflow/issue-reference.md`
- Parallel workflow, CI gates, PRs â†’ `docs/workflow/build-workflow.md`

## Recommended session order

1. `/issues-status`
2. `/issues-triage`
3. `/issues-refine #N`
4. `/issues-plan`
5. `/issues-build`

Every `backlog` issue needs exactly one priority label (`p1`, `p2`, or `p3`).

## Single-issue workflow

1. `backlog` â†’ `in-progress`
2. Branch from main: `git checkout -b feat/7-short-slug`
3. Implement
4. Run CI gates from `docs/workflow/build-workflow.md`
5. Push and open PR with `Closes #N`
6. `in-progress` â†’ `needs-review`

## Non-issue-driven work

Use this when there is **no** GitHub issue (ad-hoc fixes, small refactors, docs-only tweaks).

1. **Always** create a short-lived branch from `main` before making changes. Do **not** commit directly to `main` and do **not** pile unrelated work onto an existing feature branch unless the user explicitly asks.
2. Branch name: `<type>/<short-slug>` with a descriptive slug (no issue number). Prefer `chore/` for tooling/docs/maintenance, `fix/` for bugfixes, `feat/` for user-visible behavior. Example: `chore/manager-folder-browse`.
3. Implement, run CI gates from `docs/workflow/build-workflow.md` when applicable, push, and open a PR. Describe the change in the PR body; use `Closes #N` only when a follow-up issue exists.

This applies in **Cursor**, **Claude Code**, **GitHub Copilot**, and any other editor: follow `CLAUDE.md` and this file for the same branch expectations.

## Design workflow

For UI/UX tasks, show an ASCII wireframe and get approval before coding.
