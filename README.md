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

After setup, commit the generated configuration files:

```bash
git add .agency-rules.md .agency-project.json .gitignore
git commit -m "chore: configure .agency"
```

Run OpenCode:

```bash
opencode --config opencode.jsonc
```

If you are developing this repository directly (not as a submodule), you can run:

```bash
node scripts/config.js --generate
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
- `gh` (GitHub CLI, required for GitHub tracker mode only)

If `setup.sh` reports missing tools, you can still run setup and install the missing dependencies afterwards.

## Layout (As Installed In The Host Repo)

- `.agency/defaults.json`: platform default configuration.
- `.agency/opencode.template.json`: reference for generated opencode.jsonc structure.
- `.agency/prompts/`: agent prompts (Atlassian mode).
- `.agency/prompts/github/`: agent prompts (GitHub mode).
- `.agency/prompts/standalone/`: agent prompts (standalone mode).
- `.agency/rules.md`: shared/global rules.
- `.agency/scripts/config.js`: configuration engine.
- `.agency/scripts/memory.js`: context engine.
- `.agency/setup.sh`: setup wizard.

## Host Repo Files

These files live in your host repository root:

- `.agency-project.json`: project configuration (commit this file).
- `.agency-org.json`: organization configuration (optional, commit if shared).
- `.agency-rules.md`: repository rules (commit this file).
- `.agency-memory.json`: local runtime memory/state (gitignored).
- `opencode.jsonc`: generated OpenCode config (gitignored).

The setup script ensures the host `.gitignore` ignores `.agency-memory.json`, `opencode.jsonc`, and `.opencode/`.

Recommended host repo policy:

- Commit `.agency-project.json` (shared project config)
- Commit `.agency-rules.md` (shared team rules)
- Do not commit `.agency-memory.json` (local runtime state)
- Do not commit `opencode.jsonc` (generated from config)

## Configuration

The platform uses a layered configuration system that merges settings from multiple sources:

1. **Platform defaults** (`.agency/defaults.json`) - base configuration
2. **Organization config** (`.agency-org.json`) - optional org-wide overrides
3. **Project config** (`.agency-project.json`) - project-specific settings
4. **Environment variables** - runtime overrides

### Project Configuration (`.agency-project.json`)

```json
{
  "version": "1.0",
  "tracker": {
    "mode": "atlassian"
  },
  "models": {
    "default": "openai/gpt-4o"
  },
  "tooling": {
    "test_command": "npm test",
    "lint_command": "npm run lint"
  },
  "agents": {
    "devops": { "enabled": false }
  }
}
```

### Tracker Modes

- `atlassian` - Jira + Confluence integration (default, full MCP support)
- `github` - GitHub Issues + PRs workflow (full prompts, no MCP configured)
- `standalone` - No external tracker, interactive local workflow

### Configuration CLI

```bash
# View resolved configuration
node .agency/scripts/config.js --pretty

# Validate configuration
node .agency/scripts/config.js --validate

# Regenerate opencode.jsonc
node .agency/scripts/config.js --generate
```

### Environment Variable Overrides

- `AGENCY_MODEL_DEFAULT` - Override default model
- `AGENCY_TRACKER_MODE` - Override tracker mode
- `AGENCY_TEST_COMMAND` - Override test command
- `AGENCY_LINT_COMMAND` - Override lint command

## Context Engine

The context engine merges rules, memory, and configuration into a single JSON payload for agents.

Tooling-friendly output (pure JSON by default):

```bash
node .agency/scripts/memory.js
```

Pretty JSON output:

```bash
node .agency/scripts/memory.js --pretty
```

Output includes:

- `projectRoot` - host repository path
- `memory` - runtime facts and learnings
- `config` - resolved configuration (merged from all layers)
- `rules` - global and local rules markdown
- `warnings` - any issues encountered

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

1. Run setup: `./.agency/setup.sh`
2. Commit config: `git add .agency-project.json .agency-rules.md && git commit`
3. Start OpenCode: `opencode --config opencode.jsonc`
4. Choose an agent (e.g. Product Owner, Planning, Developer).
5. Use Jira labels (`ai-state:*`) to move issues through the workflow.
6. Use Confluence `Spec Status` as the human approval gate.

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
