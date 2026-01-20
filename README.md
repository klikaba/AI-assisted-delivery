# Enterprise Agentic Delivery Platform (.agency)

Current version: see `VERSION`.

This repository provides a portable, role-based Agentic SDLC configuration designed to be installed into any host repository as a git submodule mounted at `.agency/`.

Release notes: `RELEASE_NOTES.md`
Changelog: `CHANGELOG.md`

## What This Is

- A set of governed SDLC agent prompts (Product, Planning, Architecture, Dev, QA, Review, Security, DevOps, PM).
- A portable workflow contract built on Jira labels (`ai-state:*`) plus optional Jira status transitions.
- A lightweight context engine that merges shared rules + repo rules + local runtime memory.

## Install

From your host repository root:

```bash
git submodule add <THIS_REPO_URL> .agency
git submodule update --init --recursive
```

Initial setup (writes host repo files, not the submodule):

```bash
./.agency/setup.sh
```

Run OpenCode:

```bash
opencode --config .agency/opencode.jsonc
```

If you are developing this repository directly (not as a submodule), you can run:

```bash
opencode --config opencode.jsonc
```

Update the submodule later:

```bash
git submodule update --remote .agency
```

## Layout (As Installed In The Host Repo)

- `.agency/opencode.jsonc`: OpenCode config.
- `.agency/prompts/`: agent prompts.
- `.agency/rules.md`: shared/global rules.
- `.agency/scripts/memory.js`: context engine.
- `.agency/setup.sh`: setup wizard.

## Host Repo Files

These files live in your host repository root:

- `.agency-rules.md`: repository rules (commit this file).
- `.agency-memory.json`: local runtime memory/state (gitignored).

The setup script also ensures the host `.gitignore` ignores `.agency-memory.json` and `.opencode/`.

## Context Engine

Tooling-friendly output (pure JSON by default):

```bash
node .agency/scripts/memory.js
```

Pretty JSON output:

```bash
node .agency/scripts/memory.js --pretty
```

## Jira Workflow Contract

Portable state machine (labels):

- `ai-state:ready-for-plan`
- `ai-state:plan-review`
- `ai-state:approved`
- `ai-state:in-qa`
- `ai-state:verified`
- `ai-state:reviewed` / `ai-state:review-fail`
- `ai-state:security-pass` / `ai-state:security-fail`

Jira status transitions are treated as best-effort. Jira status names differ across projects; the prompts prioritize labels as the portable mechanism.

## Confluence Workflow Contract

- Planning generates a spec page that includes a Page Properties table with `Spec Status: DRAFT`.
- Human reviewers update that property to `APPROVED` to open the governance gate.

## Environment

This repo includes `.env.example` as a safe starting point. In your host repo you typically create a `.env` (gitignored) with any required environment variables (e.g. Confluence space key).
