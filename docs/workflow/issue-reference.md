# Issue reference

## Labels

One **type**, one **status**, one **area**, and (when `backlog`) one **priority**:

| Type | Status | Priority |
|------|--------|----------|
| feat | needs-definition | p1 |
| bug | backlog | p2 |
| chore | in-progress | p3 |
| design | needs-review | |
| | blocked | |

### Modifier labels

| Label | Meaning |
|------|---------|
| small-change | Small, self-contained fix. Routes to the small-changes accumulator instead of the wave plan; build with `/issues-build --small-changes`. |

### Area labels (customize)

| Area | Covers |
|------|--------|
| area/core | Core product surface |
| area/api | APIs and integrations |
| area/ui | Shared UI components |
| area/infra | CI, tooling, dependencies |

### Lifecycle

needs-definition â†’ backlog â†’ in-progress â†’ needs-review â†’ closed

A `backlog` issue may also carry `small-change` as a modifier: `/issues-plan` excludes it from waves, and it builds via the small-changes accumulator instead.

### Branch naming

`<type>/<issue-number>-<short-slug>` from `main`.

## Body templates

Use `## What`, `## Why`, `## Where`, `## Acceptance Criteria` (- [ ] items), optional `## Hints`.

## Implementation checklists

Embed a checklist from your teamâ€™s variant (coding / design / tooling / content) at the end of `backlog` issues. Extend this file with full checklist tables as needed.

## Implementability

- Acceptance criteria must be binary-testable
- `## Hints` should name at least one file path

Add stack-specific advisories in `CLAUDE.md`.
