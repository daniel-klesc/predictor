---
name: worktree-clean
description: Clean up stale git worktrees, orphaned disk directories, and local worktree-agent-* branches left over from /issues-build runs. Trigger when the user runs /worktree-clean.
model: haiku
---

You are executing the `/worktree-clean` command.

> **Note:** Merged worktrees are auto-cleaned by the `SessionEnd` hook (`.claude/scripts/cleanup-merged-worktrees.sh`) on session exit or `/clear`.
> Use `/worktree-clean` for stale **unmerged** worktrees, orphaned branches from killed sessions,
> or when you need to force-clean everything before the hook runs.

## Purpose

Remove stale worktree artifacts left over from `/issues-build` sessions:
- Stale `.git/worktrees/` metadata entries (gitdir files missing)
- Orphaned `.claude/worktrees/` disk directories
- Local `worktree-agent-*` branches with no remote tracking branch

---

## Step 1 — Assess current state

Run these read-only commands and collect the output:

```bash
git worktree list
git worktree prune --dry-run 2>&1
ls .claude/worktrees/ 2>/dev/null || echo "(none)"
git branch | grep "worktree-agent" || echo "(none)"
```

Report to the user:
- How many stale git worktree registrations exist
- How many disk directories exist under `.claude/worktrees/`
- How many local `worktree-agent-*` branches exist

If everything is already clean, report that and stop.

---

## Step 2 — Prune stale git metadata

Try the standard prune first:

```bash
git worktree prune
```

If permission errors occur (common on Windows), fall back to directly removing the stale entries identified in Step 1:

```bash
# Only remove entries that were flagged as stale by --dry-run
rm -rf .git/worktrees/<stale-entry-name>
```

**Do NOT remove any entry that is NOT flagged as stale** — active worktrees from other sessions must be preserved.

---

## Step 3 — Remove disk directories

Remove only directories inside `.claude/worktrees/` that have no active git link (i.e., not listed as active in `git worktree list`):

```bash
rm -rf .claude/worktrees/
```

This is safe when all registrations have already been pruned in Step 2. If any active worktrees were found in Step 1, remove only the stale directories individually instead of the whole folder.

---

## Step 4 — Delete orphaned local branches

Delete all local `worktree-agent-*` branches that have no remote tracking branch:

```bash
# List candidates (branches with no upstream)
git branch --format '%(refname:short) %(upstream)' | grep "^worktree-agent-" | awk '{print $1}'
```

Then delete each one:

```bash
git branch -D <branch-name> [...]
```

These branches are safe to bulk-delete — actual work branches always follow the `<type>/<N>-<slug>` naming convention and are pushed before deletion.

---

## Step 5 — Verify and report

Run the verification commands:

```bash
git worktree list
git worktree prune --dry-run 2>&1
ls .claude/worktrees/ 2>/dev/null || echo "(none)"
git branch | grep "worktree-agent" || echo "(none)"
```

Report a clean summary:
- ✓ Git worktree metadata — X entries pruned
- ✓ Disk directories — X directories removed
- ✓ Local branches — X branches deleted
