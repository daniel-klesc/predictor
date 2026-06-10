---
name: issues-dedupe
description: Find duplicate issues on daniel-klesc/predictor. Trigger on /issues-dedupe.
model: haiku
---

```
mcp__github__list_issues(owner="daniel-klesc", repo="predictor", state="OPEN", perPage=100)
```

Group by overlapping title tokens; ask user which to close; close duplicates with `mcp__github__issue_write` update.
