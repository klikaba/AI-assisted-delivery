# Release Notes

## 0.4.0

This release makes the repository installable as a true `.agency/` submodule and improves portability for real-world host repos.

Highlights:

- Submodule-ready layout: after `git submodule add <url> .agency`, config is available at `.agency/opencode.jsonc`.
- Host-aware setup: `./.agency/setup.sh` writes `.agency-rules.md` and `.agency-memory.json` into the host repo root, even if invoked from inside `.agency/`.
- Tooling-first memory: `node .agency/scripts/memory.js` emits JSON by default (use `--pretty` for formatted output).

Breaking changes:

- Repository file layout is flattened (the previous internal `.agency/` folder is removed).
