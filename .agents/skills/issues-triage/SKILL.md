---
name: issues-triage
description: Triage findings into GitHub issues on daniel-klesc/predictor. Trigger on /issues-triage.
model: sonnet
---

Read `docs/workflow/issue-reference.md` first.

For each finding: type, title, body template, labels, duplicate search:

```
mcp__github__search_issues(
  query="repo:daniel-klesc/predictor is:open <tokens>",
  state="open")
```

Create with:

```
mcp__github__issue_write(method="create", owner="daniel-klesc", repo="predictor", ...)
```

## Routing to the small-changes accumulator

When a finding is a small, self-contained fix, add the `small-change` label so it routes to the small-changes accumulator instead of the regular wave plan. Build it later with `/issues-build --small-changes`.
