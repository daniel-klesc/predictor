---
name: branch-prune
description: Delete local branches whose remote tracking branch has been removed from origin. Identifies gone branches, flags branches with unique commits, and deletes safe branches after user confirmation. Trigger when the user runs /branch-prune.
model: haiku
---

You are executing the `/branch-prune` command.

## Purpose

Clean up local branches that are no longer tracked on origin — branches where `git branch -vv` shows `: gone` next to the upstream ref. These accumulate after PRs are merged and remotes are deleted, cluttering the branch list.

---

## Step 1 — Sync remote-tracking refs

Run `git fetch --prune` to remove any stale remote-tracking refs and ensure the local picture of origin is current:

```bash
git fetch --prune
```

Report: "Fetched and pruned remote-tracking refs."

---

## Step 2 — Identify gone branches

Find all local branches whose upstream has been deleted:

```bash
git branch -vv | grep ': gone]'
```

Parse the branch names from the output (first field, stripping any leading `*`).

If no branches are found, report: "No gone branches detected. Nothing to prune." and stop.

Otherwise list them for the user so they can see what will be affected before any deletion occurs.

---

## Step 3 — Check for unique commits

For each gone branch, check whether it has commits that are not in `origin/main`:

```bash
git cherry origin/main <branch-name>
```

`git cherry` outputs one line per commit. Lines prefixed with `+` are unique to the branch (not in `origin/main`). Lines prefixed with `-` are already present in `origin/main`.

Classify each branch:

- **Safe to delete** — `git cherry` output is empty or all lines are prefixed with `-`
- **Has unique commits** — one or more lines are prefixed with `+`

---

## Step 4 — Present findings and ask for confirmation

Report a summary table to the user:

```
Branches safe to delete (no unique commits):
  feat/12-example-branch
  chore/34-old-chore

Branches with unique commits (skipped unless confirmed):
  feat/56-wip-feature   [2 unique commits]
```

If there are no safe branches, report that only flagged branches were found and ask whether to proceed with those.

Ask the user: **"Delete the N safe branches listed above? (yes/no)"**

Wait for confirmation before proceeding.

---

## Step 5 — Delete safe branches

After the user confirms, delete each safe branch:

```bash
git branch -D <branch-name>
```

Delete them one by one so a failure on one does not abort the rest.

---

## Step 6 — Handle flagged branches (optional)

If there were branches flagged for having unique commits, ask the user separately:

**"The following branches have unique commits not in origin/main and were skipped. Delete them anyway? (yes/no)"**

List each flagged branch with its unique commit count.

If the user confirms, delete them with `git branch -D <branch-name>`.

If the user declines, leave them in place and note they were skipped.

---

## Step 7 — Report summary

Print a final summary:

```
Branch prune complete:
  N branches pruned
  N branches skipped (unique commits — kept)
```

If any deletion failed, list those branches with the error message.
