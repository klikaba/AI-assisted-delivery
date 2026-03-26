# Enterprise Agentic Delivery Platform (.agency)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://img.shields.io/badge/test-deterministic-green.svg)](test/)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

**v0.7.0** | Portable, role-based Agentic SDLC for any host repository

This repository provides a governed AI agent workflow configuration designed to be installed into any host repository as a git submodule at `.agency/`.

**Built using the Klika AI Engineering Toolkit** | [View on GitHub](https://github.com/klikaba/AI-assisted-delivery)

---

## Quickstart

```bash
git submodule add https://github.com/klikaba/AI-assisted-delivery.git .agency
git submodule update --init --recursive
./.agency/bin/agency init --mode atlassian  # or: github | linear | standalone
git add .agency-project.json .agency-rules.md .gitignore
git commit -m "chore: configure .agency"
opencode --config opencode.jsonc
```

**Stuck?** Run `./.agency/bin/agency doctor` or read the [full guide](#install) below.

---

## Current State (What Works Today)

- **Tracker backends:** Atlassian (Jira), GitHub Issues, Linear, Standalone (fake/offline).
- **Docs providers (optional):** repo-backed Markdown (`docs.provider="repo"`, default), Atlassian (Confluence), or disabled (`none`).
- **SCM providers:** GitHub PR workflow via `gh` (optional) or disabled (`none`).
- **Stable capability tools for agents:** `tracker.*`, `docs.*`, `scm.*`, `workflow.*`, `tms.*` via local Agency MCP.
- **Test management (optional):** `tms.*` with TestRail backend (default: disabled).
- **Deterministic conformance:** 8 simulated E2E flows + trace snapshots for regression protection.

## What Needs To Happen Next

- Add more adapters: other trackers (e.g. more SaaS/on‑prem) and SCMs (GitLab/Bitbucket).
- Improve day-to-day team UX: “what’s next”/queue views and more structured linking of Spec/Plan/PR evidence.
- Harden governance/evidence: make gates and required artifacts more machine-verifiable across providers.

## Quickstart (Teams)

From your host repository root:

```bash
git submodule add https://github.com/klikaba/AI-assisted-delivery.git .agency
git submodule update --init --recursive

./.agency/bin/agency init --mode atlassian  # or: github | linear | standalone
git add .agency-project.json .agency-rules.md .gitignore
git commit -m "chore: configure .agency"

opencode --config opencode.jsonc
```

If you get stuck, run: `./.agency/bin/agency doctor`

## MVP: Jira + GitHub (Golden Path)

Goal: run one ticket from `ai-state:ready-for-plan` → Spec created/approved → PR created/linked.

1) Initialize in your host repo:

```bash
./.agency/bin/agency init --mode atlassian --docs atlassian
./.agency/bin/agency doctor
```

2) Configure Jira + GitHub auth:
- Set `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` (see `.agency/.env.example`).
- Set `CONFLUENCE_SPACE_KEY` (and optionally `CONFLUENCE_BASE_URL`) for specs in Confluence.
- Authenticate GitHub CLI: `gh auth login`
- Optional live verification: `AGENCY_DOCTOR_LIVE=1 ./.agency/bin/agency doctor`

3) Create/select a Jira issue and add label `ai-state:ready-for-plan`.

4) Run the Planning agent (via OpenCode) which will:
- create a Spec via `docs.create` (Confluence when `docs.provider=atlassian`, otherwise repo-backed markdown under `docs/agency`)
- comment on the Jira issue with `Spec: <id> <url>` so downstream agents can find it
- move labels forward (e.g. `ai-state:plan-review`)

5) Approve the spec, then run Governance Sync to apply `ai-state:approved`:
- In Confluence: set `Spec Status: APPROVED` on the spec page.
- Alternatively (if you prefer CLI-driven approval): `./.agency/bin/agency spec approve --id <specId>`
- In OpenCode: run **Project Manager Agent (Governance Sync)** (it syncs spec status back to Jira labels).

6) Run the Dev agent (via OpenCode) which will:
- verify spec status is `APPROVED`
- create/link a PR via GitHub (`scm.pr_create`, `scm.pr_link_ticket`)

Helper commands:
- Queue view: `./.agency/bin/agency next --label ai-state:ready-for-plan --limit 10`
- Ticket summary: `./.agency/bin/agency open --id <JIRA_KEY>`
- Spec approval: `./.agency/bin/agency spec approve --id <specId>`

### Operator Script (OpenCode TUI)

This is the “happy path” your team runs day-to-day in the OpenCode TUI.

1) Start OpenCode from your host repo root:
   - `opencode --config opencode.jsonc`
2) In Jira, add label `ai-state:ready-for-plan` to a ticket.
3) In OpenCode, run **Planning Agent**:
   - Select the ticket when prompted.
   - Approve “create Spec + JSON Plan” when it asks to proceed.
4) In Confluence, set `Spec Status: APPROVED` on the newly created spec page.
5) In OpenCode, run **Project Manager Agent (Governance Sync)**:
   - It should sync the approved spec back to Jira by applying `ai-state:approved`.
6) In OpenCode, run **Developer Agent**:
   - It verifies `ai-state:approved` + `Spec Status: APPROVED`, implements, then opens/links a GitHub PR.
   - It moves the ticket to `ai-state:in-qa`.
7) In OpenCode, run **QA Engineer Agent**:
   - On PASS: it moves the ticket to `ai-state:verified`.
8) In OpenCode, run **Code Reviewer Agent**:
   - On PASS: it adds `ai-state:reviewed`.

## What This Is

- A set of governed SDLC agent prompts (Product, Planning, Architecture, Dev, QA, Review, Security, DevOps, PM).
- A portable workflow contract built on `ai-state:*` labels plus optional status transitions (best-effort).
- A lightweight context engine that merges shared rules + repo rules + local runtime memory.

## How This Is Meant To Be Used (Mental Model)

This repo is not an “agent that runs your SDLC automatically”. It’s a **portable workflow contract + adapters**:

1. Your team uses an issue tracker (Jira/GitHub/Linear) as the system of record for work.
2. Agents interact with that system through stable tools (`tracker.*`, `docs.*`, `scm.*`) instead of vendor-specific APIs.
3. Work progresses through a label-driven state machine (`ai-state:*`) and a human-controlled spec approval gate (`Spec Status`).

## Install

From your host repository root:

```bash
git submodule add https://github.com/klikaba/AI-assisted-delivery.git .agency
git submodule update --init --recursive
```

This creates/updates:

- `.agency/` (the submodule checkout)
- `.gitmodules` (tracked by the host repo)

Initial setup (writes host repo files, not the submodule):

```bash
./.agency/bin/agency init --mode atlassian
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

Legacy setup wizard (optional):

```bash
./.agency/setup.sh
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
- `node` (required for `.agency/scripts/*` tooling, including Agency MCP)
- `npx` (optional; only needed if you set `tracker.atlassian.backend` to `mcp` in config)
- `gh` (GitHub CLI, required if you use `tracker.mode=github` and/or `scm.provider=github`)

If `setup.sh` reports missing tools, you can still run setup and install the missing dependencies afterwards.

## Layout (As Installed In The Host Repo)

- `.agency/defaults.json`: platform default configuration.
- `.agency/opencode.template.json`: reference for generated opencode.jsonc structure.
- `.agency/prompts/`: agent prompts (Atlassian mode).
- `.agency/prompts/github/`: agent prompts (GitHub mode).
- `.agency/prompts/linear/`: agent prompts (Linear mode).
- `.agency/prompts/standalone/`: agent prompts (standalone mode).
- `.agency/rules.md`: shared/global rules.
- `.agency/bin/agency`: team-friendly CLI (`init`, `generate`, `doctor`, `labels`, `test --profile`).
- `.agency/scripts/config.js`: configuration engine.
- `.agency/scripts/memory.js`: context engine.
- `.agency/scripts/agency-mcp.js`: local MCP server exposing stable capability tools (`tracker.*`, `docs.*`, `scm.*`, `workflow.*`, `tms.*`, `capabilities.get`).
- `.agency/scripts/agency.js`: integration CLI (debugging/manual use; same capability surface).
- `.agency/setup.sh`: setup wizard.

## Host Repo Files

These files live in your host repository root:

- `.agency-project.json`: project configuration (commit this file).
- `.agency-org.json`: organization configuration (optional, commit if shared).
- `.agency-rules.md`: repository rules (commit this file).
- `.agency-memory.json`: local runtime memory/state (gitignored). If you want to run with no memory, set it to `[]` (or leave it empty) and it will be respected.
- `opencode.jsonc`: generated OpenCode config (gitignored).

The setup script ensures the host `.gitignore` ignores `.agency-memory.json`, `opencode.jsonc`, and `.opencode/`.

Note: This `.agency` repository tracks its own `opencode.jsonc` as a reference/example. In a host repository, treat `opencode.jsonc` as generated output and keep it untracked.

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
  "scm": {
    "provider": "github"
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

- `atlassian` - Jira integration (default). Uses Atlassian Cloud REST APIs.
- `github` - GitHub Issues workflow. Uses `gh` CLI.
- `linear` - Linear Issues workflow. Uses Linear GraphQL API.
- `standalone` - No external tracker; workflows can run offline using the fake backend for testing.

### Linear Setup Notes

Linear mode uses `ai-state:*` labels for the portable workflow. Create the `ai-state:*` labels in Linear (Workspace Settings → Labels) before running the flow (doctor live checks verify they exist). You can print the list with `./.agency/bin/agency labels --mode linear`.

### Docs Providers (Optional)

Docs are a separate, vendor-agnostic capability surface (`docs.*`).

- `repo` (default) - Writes specs/pages as Markdown files under `docs.repo.dir` in the host repo.
- `atlassian` - Uses Confluence pages via the Atlassian backend (requires Confluence env vars).
- `none` - Disables `docs.*` tools.

### Jira + GitHub Together (Recommended)

Most teams use:

- Atlassian (Jira) as the system of record for work: `tracker.*`
- A docs provider for specs/approvals: `docs.*` (default is `repo`; optional `atlassian` for Confluence)
- GitHub for PR workflow: `scm.*` (via `gh`)

Configure that per-repo with:

```json
{
  "version": "1.0",
  "tracker": { "mode": "atlassian" },
  "scm": { "provider": "github" }
}
```

### Atlassian Backend Selection

Atlassian supports two backend modes:

- `tracker.atlassian.backend = "api"` (default): uses Jira/Confluence REST APIs directly.
- `tracker.atlassian.backend = "mcp"`: uses `mcp-remote` with `tracker.atlassian.mcp_url` (experimental).

### Configuration CLI

```bash
# View resolved configuration
node .agency/scripts/config.js --pretty

# Validate configuration
node .agency/scripts/config.js --validate

# Regenerate opencode.jsonc
node .agency/scripts/config.js --generate

# Generate OpenCode presets (multiple opencode.<preset>.jsonc files + OPENCODE_PRESETS.md)
node .agency/scripts/config.js --generate --presets

# List available presets
./.agency/bin/agency presets
```

### Environment Variable Overrides

- `AGENCY_MODEL_DEFAULT` - Override default model
- `AGENCY_TRACKER_MODE` - Override tracker mode
- `AGENCY_TEST_COMMAND` - Override test command
- `AGENCY_LINT_COMMAND` - Override lint command
- `AGENCY_DOCS_PROVIDER` - Override docs provider (none/repo/atlassian)
- `AGENCY_DOCS_DIR` - Override repo docs dir (relative to host root)
- `AGENCY_TMS_PROVIDER` - Override test management provider (none/testrail)

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

## Integration Layer (Agency MCP)

This platform exposes a stable, vendor-agnostic tool surface to agents via a local MCP server:

- **Tracker tools:** `tracker.search`, `tracker.get`, `tracker.comment`, `tracker.transition`, `tracker.set_labels`
- **Docs tools:** `docs.create`, `docs.get`, `docs.update`
- **SCM tools:** `scm.pr_create`, `scm.pr_get`, `scm.pr_comment`, `scm.pr_set_labels`, `scm.pr_link_ticket`
- **Workflow tools:** `workflow.queue`, `workflow.gate_status`, `workflow.summary`, `workflow.apply`, `workflow.sync_plan_review`
- **TMS tools:** `tms.suite_ensure`, `tms.case_create`
- **Capabilities:** `capabilities.get`

The `opencode.jsonc` generator enables this MCP server automatically via `mcp.agency`.

Note: Some MCP clients namespace tool names by server id. This server also exposes aliases like `agency.tracker.search`.

For debugging or scripting, you can also call the same capabilities via the CLI:

```bash
node .agency/scripts/agency.js tracker search --label ai-state:ready-for-plan --json
```

## Agency CLI (`./.agency/bin/agency`)

Team-friendly commands for day-to-day operations:

```bash
# Initialize host repo configuration
./.agency/bin/agency init --mode atlassian  # or: github | linear | standalone

# Generate/regenerate opencode.jsonc
./.agency/bin/agency generate

# Generate all OpenCode presets
./.agency/bin/agency generate --presets

# List available presets
./.agency/bin/agency presets

# Run sanity checks (offline)
./.agency/bin/agency doctor

# Run conformance tests
./.agency/bin/agency test                          # Full test suite
./.agency/bin/agency test --profile <profile-path> # Profile conformance

# Print required workflow labels
./.agency/bin/agency labels --mode atlassian       # or: github | linear | standalone

# Show "what's next" queue (live, requires tracker access)
./.agency/bin/agency next --label ai-state:ready-for-plan --limit 10

# Show ticket summary with gate status (live)
./.agency/bin/agency open --id JIRA-123

# Approve a spec (docs provider)
./.agency/bin/agency spec approve --id <specId>
```

## Testing & Conformance

For maintainability and safe client customization, this repository includes deterministic, network-free end-to-end simulations and trace snapshots.

**Simulated Flows (8 total):**
- `planning` - ready-for-plan → plan-review
- `pm-sync` - Sync spec approval to tracker labels
- `dev-complete` - approved → in-qa (with SCM PR creation)
- `qa-verify` - in-qa → verified (or back to approved on fail)
- `review` - verified → reviewed (or back to approved on fail)
- `security-audit` - verified → security-pass/fail
- `release` - All gates pass → Done
- `scm-pr` - PR creation/linking flow

**Host repo checks:**

```bash
# Offline sanity checks
./.agency/bin/agency doctor

# Regenerate opencode.jsonc
./.agency/bin/agency generate

# Profile conformance tests (client/team config)
./.agency/bin/agency test --profile .agency/profiles/atlassian
```

**Client profile template:**
- `.agency/profiles/_template/`

**Developing `.agency` itself:**

```bash
# Run full test suite (unit + simulated E2E)
npm test

# Update trace snapshots when changes are intentional
npm run test:update-traces
```

**Optional live checks (real auth + network):**

```bash
# Live doctor (validates tools, auth, labels)
AGENCY_DOCTOR_LIVE=1 ./.agency/bin/agency doctor

# Live E2E (manual/nightly, requires AGENCY_LIVE_E2E=1)
node .agency/scripts/live-e2e/run.js
```

**Agent-run E2E (OpenCode smoke test):**

```bash
# Gated: requires OpenCode installed + model/provider access
npm run e2e:agent
```

## Workflow Contract (Portable)

**Portable state machine (labels):**

```text
ready-for-plan
→ plan-review
→ approved
→ in-qa
→ verified
   ├─→ reviewed / review-fail       (Code Reviewer Agent)
   └─→ security-pass / security-fail (Security Engineer Agent, optional)
→ release                       (Project Manager Agent)
```

**Notes:**
- Status transitions are treated as best-effort. Status names differ across projects; the prompts prioritize labels as the portable mechanism.
- Review and Security audits both start from `verified` and can run in parallel.
- Release requires: `verified` + `reviewed` + `security-pass` (if `config.workflow.gates.security_audit=true`).

### Required Labels (Preflight)

- Print the canonical list: `./.agency/bin/agency labels --mode <atlassian|github|linear|standalone>`
- Jira: labels are free-form (no pre-creation required).
- GitHub + Linear: labels must exist before they can be applied.

## Basic Usage (Day-to-Day)

1. Initialize: `./.agency/bin/agency init --mode <atlassian|github|linear|standalone>`
2. Commit host config: `git add .agency-project.json .agency-rules.md .gitignore && git commit`
3. Start OpenCode (primary UX): `opencode --config opencode.jsonc`
4. Choose an agent (e.g. Product Owner, Planning, Developer) and follow its dashboard protocol.
5. Optional terminal helpers (outside OpenCode) for navigation:
   - Queue: `./.agency/bin/agency next`
   - Ticket summary: `./.agency/bin/agency open --id <JIRA_KEY>`
6. Use `ai-state:*` labels to move issues through the workflow; keep your Jira statuses/board as-is.
7. Use `Spec Status` (via your configured docs provider) as the human approval gate.

### OpenCode Presets (Modular TUI)

If you don’t want the full SDLC menu in the OpenCode TUI, you can generate focused configs and start OpenCode with one role at a time:

1. Generate all presets: `./.agency/bin/agency generate --presets`
   - List presets: `./.agency/bin/agency presets`
   - Generates `OPENCODE_PRESETS.md` with copy/paste commands
2. Start OpenCode with a preset, for example:
   - Planning only: `opencode --config opencode.planning.jsonc`
   - Dev only: `opencode --config opencode.dev.jsonc`
   - QA only: `opencode --config opencode.qa.jsonc`

### Recommended First Ticket Walkthrough

1. Pick an issue/ticket and add label `ai-state:ready-for-plan`.
2. Run the **Planning Agent**:
   - Creates a Spec (`docs.create`, `Spec Status: DRAFT`)
   - Comments on the ticket with a Spec reference (prefer `Spec: <id> <url>`)
   - Posts the JSON plan as a comment
   - Moves label to `ai-state:plan-review`
3. Human review: update `Spec Status` to `APPROVED` (or `CHANGES REQUESTED`).
4. Run **PM (Governance Sync)** to sync `Spec Status` back to ticket labels:
   - `APPROVED` -> `ai-state:approved`
   - `CHANGES REQUESTED` -> `ai-state:ready-for-plan`
5. Run **Developer Agent**, then **QA**, then **Review/Security**, then **PM Release**.

## Migration From <= 0.3.x

Earlier versions nested everything under an internal `.agency/` directory. As of `0.4.0`, the repository root is what gets mounted at `.agency/`.

If you previously copied a folder instead of using a submodule, remove the old directory and install as a submodule.

## Spec Workflow Contract (Docs)

- Planning generates a spec that includes `Spec Status: DRAFT` (encoding depends on docs provider).
- Human reviewers update `Spec Status` to `APPROVED` (or `CHANGES REQUESTED`) to open/close the governance gate.

## QA Test Cases (Optional: TestRail / TMS)

If you enable a test management system (`tms.provider`, default: `none`), the QA flow becomes strict:

- QA must first create/save test cases in the TMS (default adapter: TestRail).
- QA must comment on the ticket with a machine-parseable marker: `TestCases: ...`
- Only then can QA mark verification (`ai-state:verified`) using `QA: PASS` + `workflow.apply` (which enforces the evidence marker when TMS is enabled).

## Environment

This repo includes `.env.example` as a safe starting point. In your host repo you typically create a `.env` (gitignored) with any required environment variables (e.g. Confluence space key).

Common variables:

- Atlassian (Jira REST): `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`
- Confluence docs provider (only when `docs.provider="atlassian"`): `CONFLUENCE_SPACE_KEY` (and optionally `CONFLUENCE_BASE_URL`)
- Linear tracker: `LINEAR_API_KEY` (or `LINEAR_ACCESS_TOKEN`)
- TestRail (only when `tms.provider="testrail"` / `AGENCY_TMS_PROVIDER=testrail`): `TESTRAIL_HOST`, `TESTRAIL_USERNAME`, `TESTRAIL_API_KEY`, `TESTRAIL_PROJECT_ID` (optional: `TESTRAIL_SUITE_ID`, `TESTRAIL_SECTION_ID`)

---

## Community & Support

- **Issues:** [Report a bug](https://github.com/klikaba/AI-assisted-delivery/issues/new?template=bug_report.yml) or [request a feature](https://github.com/klikaba/AI-assisted-delivery/issues/new?template=feature_request.yml)
- **Security:** Report vulnerabilities to [contact@klika.ba](.github/SECURITY.md)
- **Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
- **License:** Apache 2.0 with attribution requirement (see [LICENSE](LICENSE) and [NOTICE](NOTICE))

### Want to Contribute?

We welcome contributions! Good first areas:
- **New adapters:** GitLab, Bitbucket, Azure DevOps
- **UX improvements:** Queue views, better Spec/Plan/PR linking
- **Testing:** More conformance profiles and edge cases

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
