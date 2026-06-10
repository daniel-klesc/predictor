---
name: issues-refine
description: Refine issue #N on daniel-klesc/predictor. Trigger on /issues-refine #N.
---

```
mcp__github__issue_read(method="get", owner="daniel-klesc", repo="predictor", issue_number=N)
```

Interactive loop per `docs/workflow/issue-reference.md`. Apply updates with:

```
mcp__github__issue_write(method="update", owner="daniel-klesc", repo="predictor", ...)
```

## Promote options

- **Promote** — remove `needs-definition`, add `backlog`.
- **Promote + route to small-changes** — remove `needs-definition`, add `backlog` + `small-change` (builds via `/issues-build --small-changes`).
