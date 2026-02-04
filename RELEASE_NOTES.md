# Release Notes

## 0.5.0

Stabilization release for real team usage across Jira + docs (Confluence optional) + GitHub.

Highlights:

- Stable capability layer exposed to agents via local Agency MCP:
  - Tracker: `tracker.search/get/comment/transition/set_labels`
  - Docs: `docs.create/get/update`
  - SCM (GitHub PRs via `gh`): `scm.pr_create/pr_get/pr_comment/pr_set_labels/pr_link_ticket`
- Repo-by-repo customization with confidence:
  - Profile conformance runner (`agency test --profile ...`)
  - Deterministic simulated E2E flows + trace snapshots
- Improved operator workflow:
  - `./.agency/bin/agency init|generate|doctor|test`
  - Doctor checks that explain required tools and validate `gh` auth in live mode.
- Gated OpenCode agent-run smoke test: `npm run e2e:agent`

## 0.4.1

Documentation-focused patch release.

Highlights:

- Expanded installation and update instructions for host repositories using `.agency/` as a git submodule.
- Added prerequisites and basic usage guidance.
- Clarified migration and repo policy: commit `.agency-rules.md`; keep `.agency-memory.json` local.

## 0.4.0

This release makes the repository installable as a true `.agency/` submodule and improves portability for real-world host repos.

Highlights:

- Submodule-ready layout: after `git submodule add <url> .agency`, config is available at `.agency/opencode.jsonc`.
- Host-aware setup: `./.agency/setup.sh` writes `.agency-rules.md` and `.agency-memory.json` into the host repo root, even if invoked from inside `.agency/`.
- Tooling-first memory: `node .agency/scripts/memory.js` emits JSON by default (use `--pretty` for formatted output).

Breaking changes:

- Repository file layout is flattened (the previous internal `.agency/` folder is removed).

Migration note:

- Install this repo as a submodule mounted at `.agency/`.
- Ensure your host repo commits `.agency-rules.md` (repo-level rules) and does NOT commit `.agency-memory.json` (local runtime memory).
