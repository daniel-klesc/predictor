---
name: issues-plan
description: Conflict-aware plan for daniel-klesc/predictor. Trigger on /issues-plan.
model: sonnet
---

You are executing `/issues-plan` for `daniel-klesc/predictor`.

## Fetch backlog

```
mcp__github__list_issues(owner="daniel-klesc", repo="predictor",
  labels=["backlog"], state="OPEN", orderBy="CREATED_AT", direction="ASC", perPage=50)
```

Then client-side filter OUT any issue carrying the `small-change` label (GitHub's `labels` arg is AND-only, so it can't be excluded server-side). Those route to the small-changes accumulator, not the wave plan. Count them for the output line below.

Score conflict tiers (schema/migrations vs shared files vs isolated). Sort by p1, p2, p3. Group waves; cap parallel size.

Customize "area → paths" hints in this skill or in `issue-reference.md` for your app.

## Wave plan output

After grouping waves, always do both steps:

**1. Write `.claude/wave-plan.json`:**

```json
{
  "repo": "daniel-klesc/predictor",
  "generated_at": "<ISO timestamp>",
  "waves": {
    "wave-1": { "issues": [18, 19, 20], "reason": "<conflict rationale>" },
    "wave-2": { "issues": [21, 22], "reason": "<conflict rationale>" }
  }
}
```

**2. Display the wave table and output command variants per wave:**

```
## Wave 1 — issues: #18, #19, #20
  /issues-build wave-1                  # supervised: you review and merge each PR
  /issues-build --auto wave-1           # autonomous: Claude merges sub-PRs into staging branch; you review one final PR
  /issues-build --epic <M>              # epic: auto-discovers native sub-issues of #M from GitHub

## To plan + build in one shot:
  /issues-plan --run wave-1             # supervised
  /issues-plan --run all                # supervised, all waves in sequence
  /issues-plan --auto wave-1            # autonomous
  /issues-plan --auto all               # autonomous, all waves in sequence
```

When any `small-change` issues were filtered out, also print:

```
N routed to the small-changes accumulator — build with `/issues-build --small-changes`
```

## Flags

### (no flag) — plan only
Fetch, score, group, write `.claude/wave-plan.json`, display wave table with command variants.

### `--run <wave-label|all>`
Plan (as above), then immediately invoke issues-build for the specified wave(s) in **supervised** mode.
Process multiple waves or "all" sequentially, respecting merge gates between waves.

### `--auto <wave-label|all>`
Plan (as above), then immediately invoke issues-build `--auto` for the specified wave(s).
Process multiple waves or "all" sequentially in autonomous mode.
