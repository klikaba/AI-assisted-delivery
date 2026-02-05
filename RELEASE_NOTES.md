# Release Notes

## Unreleased

Highlights:

- (No changes yet.)

## 0.7.0

Workflow and QA automation release.

Highlights:

- New workflow UX tools (OpenCode-first): `workflow.queue`, `workflow.summary`, `workflow.gate_status`, `workflow.apply`, `workflow.sync_plan_review`.
- Modular OpenCode presets: generate `opencode.<preset>.jsonc` files and `OPENCODE_PRESETS.md`.
- Optional Test Management integration (`tms.*`) with configurable provider (default disabled) and TestRail backend support.

## 0.6.0

Portability and adoption release (docs provider defaults + Linear tracker support).

Highlights:

- Docs are now vendor-optional and portable by default:
  - Default `docs.provider="repo"` writes specs as Markdown under `docs/agency/`
  - Confluence remains available via `docs.provider="atlassian"`
- New Linear tracker mode (`tracker.mode="linear"`) via Linear GraphQL API.
- New capability introspection tool: `capabilities.get`.
- Improved onboarding and guardrails:
  - `agency labels` prints required `ai-state:*` workflow labels
  - Linear live doctor checks verify required labels exist (verify-only; no auto-creation)

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
