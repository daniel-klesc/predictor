---
name: issues-build
description: Process backlog issues with subagents for daniel-klesc/predictor. Trigger on /issues-build.
model: opus
---

Read `docs/workflow/build-workflow.md` first.

Use `owner="daniel-klesc", repo="predictor"` in all GitHub MCP calls.

## Modes

### Supervised (default — no flag)
- Sub-issue branches target `main` directly.
- Claude opens each PR and stops. User reviews, merges, triggers next wave.

### Autonomous (`--auto`)
Three-level branch pattern:
```
main
 └── build/wave-N  (staging branch — name from wave label, or build/auto-YYYYMMDD)
       └── type/N-slug  (one per sub-issue)
```
- Create staging branch from `main`.
- Each sub-issue branches off the staging branch; PR targets the staging branch.
- Auto-merge each sub-PR after CI passes:
  poll `mcp__github__get_pull_request` until `mergeable_state == "clean"`, then
  `mcp__github__merge_pull_request(merge_method="squash")`.
- CI failure: do NOT merge. Open a tracking issue. Report and stop.
- After all sub-PRs merge into staging: open `staging → main` PR. Pause and report URL.
- Multi-wave: pause after opening each wave's staging PR; do not start wave N+1 until user merges it.

### Small-changes accumulator (`--small-changes`)
A permanent, reusable accumulator branch `build/small-changes` (the `--auto` staging branch made long-lived). Batch unrelated small fixes onto it across multiple runs, then finalize once.
- Ensure `build/small-changes` exists on origin: `git ls-remote --heads origin build/small-changes`. If present, reuse it; else cut fresh from `main` and push.
- Each issue branches `type/N-slug` off `build/small-changes`; PR targets `build/small-changes`.
- Auto-merge each sub-PR after CI (same poll + merge as `--auto`).
- UNLIKE `--auto`, do NOT open the `build/small-changes → main` PR — keep batching. Report what merged and stop.

### Finalize small-changes (`--finalize-small-changes`)
- Open `build/small-changes → main` PR (title `build: small-changes batch — <N> issues`, body lists merged issues). Pause for human review and report the URL.
- After the user merges it: origin deletes `build/small-changes`, but the **local** copy survives and will silently collide on the next batch. Before recreating, run `git branch -D build/small-changes`, then cut fresh from `main` on the next `--small-changes` run.

### Epic (`--epic N`)
Same three-level pattern as `--auto`, but:
- Fetch issue N: `mcp__github__get_issue(issue_number=N)` → derive branch `epic/N-<slug>` from title.
- Discover sub-issues via GitHub native sub-issue API: parse `sub_issues` field from issue N.
- If no native sub-issues found: report and stop.
- Sub-issue PRs target the epic branch; auto-merge after CI (same poll + merge as `--auto`).
- Final PR: `epic/N-slug → main`, title `feat: <epic title> (#N)`, body `Closes #N` + sub-issue list.
- User reviews and merges the single epic → main PR.

## Wave reference resolution

When a wave label is passed (e.g., `/issues-build wave-1` or `/issues-build --auto wave-1`):
- Read `.claude/wave-plan.json`.
- Extract `waves["wave-1"].issues` as the issue list.
- If file is missing: stop — "No wave plan found. Run `/issues-plan` first, or use `/issues-plan --run wave-1`."

Explicit issue numbers (e.g., `/issues-build 18 19 20`) bypass the plan file entirely.

## Merge gate (supervised + multi-wave)

Before the next serial issue or wave, ensure the previous PR is merged, then from the **repository root** run `git pull --ff-only` on `main`, then add the next worktree.
In `--auto` mode the merge gate between sub-issues is handled automatically; the user gates between wave-level staging PRs.

## Subagent template (adapt)

- Work in `.claude/worktrees/agent-working-on-issue-{N}`
- `npm install` if needed
- **Supervised**: branch `type/N-slug` from `main`
- **`--auto` / `--epic` / `--small-changes`**: branch `type/N-slug` from the staging / epic / `build/small-changes` branch
- Read `CLAUDE.md` and any project-specific skills listed there
- Run CI gates from `build-workflow.md`
- Commit, push; do not open PR (orchestrator does)

## Skill injection

Prefer skills listed in the target repo's `CLAUDE.md`. Default: add tests per acceptance criteria; follow stack rules in `CLAUDE.md`.

## PR creation

**Supervised — sub-issue PR targeting `main`:**
```
mcp__github__create_pull_request(owner, repo,
  head="type/N-slug", base="main",
  title="<type>: <summary> (#N)", body="Closes #N\n...")
```

**`--auto` / `--epic` / `--small-changes` — sub-issue PR targeting staging / epic / `build/small-changes` branch:**
```
mcp__github__create_pull_request(owner, repo,
  head="type/N-slug", base="<staging-branch | build/small-changes>",
  title="<type>: <summary> (#N)", body="Closes #N\n...")
```

**`--auto` — final staging → main PR:**
```
mcp__github__create_pull_request(owner, repo,
  head="<staging-branch>", base="main",
  title="build: <wave label> — <N> issues",
  body="## Issues\n- #N1\n- #N2\n...")
```

**`--epic` — final epic → main PR:**
```
mcp__github__create_pull_request(owner, repo,
  head="epic/N-slug", base="main",
  title="feat: <epic title> (#N)",
  body="Closes #N\n\n## Sub-issues\n- #N1\n- #N2\n...")
```

**`--finalize-small-changes` — accumulator → main PR:**
```
mcp__github__create_pull_request(owner, repo,
  head="build/small-changes", base="main",
  title="build: small-changes batch — <N> issues",
  body="## Issues\n- #N1\n- #N2\n...")
```

On failure, revert labels and open a tracking issue per your team policy.
