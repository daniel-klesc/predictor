---
name: issues-status
description: GitHub backlog snapshot for daniel-klesc/predictor. Trigger on /issues-status.
model: haiku
---

You are executing `/issues-status` for `daniel-klesc/predictor`.

Label definitions: `docs/workflow/issue-reference.md`.

## Fetch (parallel)

```
mcp__github__list_issues(owner="daniel-klesc", repo="predictor",
  labels=["backlog"], state="OPEN", orderBy="CREATED_AT", direction="ASC", perPage=30)
mcp__github__list_issues(owner="daniel-klesc", repo="predictor",
  labels=["in-progress"], state="OPEN", perPage=20)
mcp__github__list_issues(owner="daniel-klesc", repo="predictor",
  labels=["needs-definition"], state="OPEN", perPage=20)
mcp__github__list_issues(owner="daniel-klesc", repo="predictor",
  labels=["small-change"], state="OPEN", perPage=20)
mcp__github__list_pull_requests(owner="daniel-klesc", repo="predictor",
  state="OPEN", orderBy="CREATED_AT", direction="DESC", perPage=10)
```

Render compact tables. Flag backlog issues missing priority or area. Suggest `/issues-plan`, `/issues-build`, or `/issues-refine` as appropriate.

## Small-changes accumulator

Render a snapshot section: the queued `small-change` count, plus a branch-existence check:

```bash
git ls-remote --heads origin build/small-changes
```

If the branch exists, note there's an open batch (build more with `/issues-build --small-changes`, ship with `/issues-build --finalize-small-changes`). If queued count > 0 but no branch, suggest `/issues-build --small-changes` to start one.

## Filter argument

Accept a label as an argument to scope the snapshot (e.g. `/issues-status small-change` shows only the accumulator queue).
