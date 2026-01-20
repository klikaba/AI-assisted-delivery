# Enterprise Agentic Delivery Platform (.agency)

Current version: see `VERSION` (git tag: `v<version>`).

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

This creates/updates:

- `.agency/` (the submodule checkout)
- `.gitmodules` (tracked by the host repo)

Initial setup (writes host repo files, not the submodule):

```bash
./.agency/setup.sh
```

After setup, commit the generated repository rules file:

```bash
git add .agency-rules.md .gitignore
git commit -m "chore: configure .agency rules"
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

Then commit the updated submodule pointer in the host repo:

```bash
git add .agency
git commit -m "chore: bump .agency submodule"
```

## Prerequisites

- `git` (for submodules)
- `opencode` available on PATH
- `node` (required for `.agency/scripts/memory.js`)
- `npx` (used by `opencode.jsonc` to run `mcp-remote` for Atlassian MCP)

If `setup.sh` reports missing tools, you can still run setup and install the missing dependencies afterwards.

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

Recommended host repo policy:

- Commit `.agency-rules.md` (shared team rules)
- Do not commit `.agency-memory.json` (local runtime state)

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

## Basic Usage

1. Start OpenCode: `opencode --config .agency/opencode.jsonc`
2. Choose an agent (e.g. Product Owner, Planning, Developer).
3. Use Jira labels (`ai-state:*`) to move issues through the workflow.
4. Use Confluence `Spec Status` as the human approval gate.

## Migration From <= 0.3.x

Earlier versions nested everything under an internal `.agency/` directory. As of `0.4.0`, the repository root is what gets mounted at `.agency/`.

If you previously copied a folder instead of using a submodule, remove the old directory and install as a submodule.

## Confluence Workflow Contract

- Planning generates a spec page that includes a Page Properties table with `Spec Status: DRAFT`.
- Human reviewers update that property to `APPROVED` to open the governance gate.

## Environment

This repo includes `.env.example` as a safe starting point. In your host repo you typically create a `.env` (gitignored) with any required environment variables (e.g. Confluence space key).

Common variable:

- `CONFLUENCE_SPACE_KEY` (example default in `.env.example`)
