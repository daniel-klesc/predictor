#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
WT="$ROOT/.claude/worktrees"
[[ -d "$WT" ]] || exit 0
while IFS= read -r -d '' d; do
  (cd "$d" && git rev-parse --abbrev-ref HEAD >/dev/null 2>&1) || continue
  BR="$(cd "$d" && git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ -n "$BR" && "$BR" != "HEAD" ]] || continue
  if git -C "$ROOT" branch --merged main | grep -q "^[* ]*${BR}$"; then
    git -C "$ROOT" worktree remove --force "$d" 2>/dev/null || true
  fi
done < <(find "$WT" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null || true)
