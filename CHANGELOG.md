# Changelog

All notable changes to this project will be documented in this file.

This project follows Semantic Versioning (SemVer) with the caveat that `0.x` releases may include breaking changes between minor versions.

## Unreleased

- (No changes yet.)

## 0.7.0 - 2026-02-05

### Added
- Workflow UX tools: `workflow.queue`, `workflow.summary`, `workflow.gate_status`, `workflow.apply`, `workflow.sync_plan_review`
- Modular OpenCode presets generation (`opencode.<preset>.jsonc`) and `OPENCODE_PRESETS.md`
- Optional Test Management integration (`tms.*`) with TestRail backend and strict QA evidence gating (`TestCases: ...`)
- Agency CLI commands: `next`, `open`, `spec approve`, `labels`, `presets`

### Changed
- Default docs provider changed to `repo` (Markdown files under `docs/agency/`)
- Documentation improvements for CLI usage and testing

## 0.6.0 - 2026-02-04

- Add Linear tracker integration (`tracker.mode = "linear"`) via Linear GraphQL API.
- Add repo-backed docs provider (`docs.provider = "repo"`, default) writing specs as Markdown under `docs.repo.dir`.
- Add capability introspection tool: `capabilities.get`.
- Improve spec linking conventions (`Spec: <id> <url>`) with legacy parsing support.
- Improve onboarding and live checks (Linear label verification, `agency labels` helper).

## 0.5.0 - 2026-02-03

- Add stable, vendor-agnostic capability tools via local Agency MCP: `tracker.*`, `docs.*`, `scm.*`.
- Add GitHub PR workflow integration (`scm.provider = "github"`) implemented via `gh` with non-interactive safeguards.
- Add deterministic conformance suite and trace snapshots (including SCM PR flow) to protect client customizations.
- Improve team UX: `bin/agency` wrapper, `agency init/generate/doctor/test`, and clearer doctor output.
- Add an OpenCode agent-run smoke test harness (gated) to validate tool-call behavior end-to-end.

## 0.4.0 - 2026-01-20

- BREAKING: Flatten repository layout so the repo can be installed directly as a `.agency/` git submodule.
- Improve portability: `.agency/setup.sh` detects the host repo root when run from inside the submodule.
- Improve tooling support: `.agency/scripts/memory.js` now defaults to pure JSON output and is safe to run from any working directory.
- Jira portability: prompts treat Jira status transitions as best-effort (labels remain the portable state machine).
- Docs: update installation/paths to match submodule-first usage.

## 0.4.1 - 2026-01-20

- Docs: expand installation, prerequisites, and migration guidance.

## 0.3.0

- Previous release.
