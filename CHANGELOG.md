# Changelog

All notable changes to this project will be documented in this file.

This project follows Semantic Versioning (SemVer) with the caveat that `0.x` releases may include breaking changes between minor versions.

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
