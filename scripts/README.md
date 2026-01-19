# Demo Helper Scripts

This directory contains utility scripts to help manage the demo lifecycle.

## `reset-demo.sh`

**The "Big Red Button" for your demo.**

Use this script to wipe the slate clean before starting a new presentation.

**What it does:**
1.  **Deletes Feature Branches:** Removes any local `feature/*` branches to prevent git conflicts.
2.  **Wipes Memory:** Resets `platform-mock/memory.json` to an empty state.
3.  **Resets Target App:** Reverts `demo-target/` to the current `HEAD`, deleting any generated code or tests.
4.  **Fresh Install:** Re-installs dependencies (`npm ci`) to ensure a clean environment.

**Usage:**
```bash
./scripts/reset-demo.sh
```

**⚠️ Note:** This script does **NOT** delete data from Jira or Confluence. You must archive/delete those tickets manually between runs.
