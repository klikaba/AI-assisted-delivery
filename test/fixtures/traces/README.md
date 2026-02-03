# Trace Fixtures

These files are **golden snapshots** of simulated agent flows. They assert the
**tool-call sequence and argument shapes**, not the exact values.

If behavior changes intentionally, update these snapshots by running:

```bash
node scripts/update-traces.js
```

Do not edit these files by hand unless you know exactly why.
