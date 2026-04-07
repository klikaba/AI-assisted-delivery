# Technical Reference

## Current Capability Surface

`agency` exposes a stable agent-facing tool contract through the local MCP server:

- `tracker.*`
- `docs.*`
- `scm.*`
- `tms.*`
- `workflow.*`
- `plan.*`
- `capabilities.get`

## Core Workflow Contract

Portable workflow labels:

```text
ready-for-plan
→ plan-review
→ approved
→ in-qa
→ verified
   ├─→ reviewed / review-fail
   └─→ security-pass / security-fail
→ release
```

Notes:

- Jira/board statuses are best-effort
- labels are the portable workflow mechanism
- `Spec Status` is the human approval gate

## Workflow Helpers

- `workflow.queue`
- `workflow.gate_status`
- `workflow.summary`
- `workflow.apply`
- `workflow.sync_plan_review`
- `workflow.qa_decide`
- `workflow.review_decide`
- `workflow.security_decide`
- `workflow.release`

## Plan Artifact Contract

Execution plans are first-class artifacts via:

- `plan.get`
- `plan.publish`

Execution plan contract:

```json
{
  "version": "1.0",
  "ticket": {
    "id": "SCRUM-7",
    "key": "SCRUM-7",
    "title": "Ticket title",
    "url": null
  },
  "acceptanceCriteria": ["AC-1"],
  "filesToTouch": ["path/to/file"],
  "steps": [
    {
      "id": "1",
      "description": "Implement the required change.",
      "acRefs": ["AC-1"]
    }
  ]
}
```

- `plan.version` must be exactly `"1.0"`.
- `plan.ticket` must be an object, not a string.
- `plan.steps` must be an array of objects with `id`, `description`, and `acRefs`.

Current model:

- the implementation spec is the primary planning artifact
- the execution plan is a secondary machine-readable artifact
- when using Confluence, the execution plan lives on the linked spec page

## Role Model

Core workflow roles:

- Product Owner
- Planning
- Developer
- QA
- Code Reviewer
- Project Manager

Conditional role:

- Security

Optional specialist roles:

- Architecture
- DevOps

## Human Approval Model

Expected interaction pattern:

1. agent lists eligible work
2. human selects the ticket
3. agent prepares a proposed action
4. human approves
5. workflow helper applies the governed change

## Configuration Layers

Configuration merges from:

1. `defaults.json`
2. `.agency-org.json`
3. `.agency-project.json`
4. environment variables

## Tracker Modes

- `atlassian`
- `github`
- `linear`
- `standalone`

## Docs Providers

- `repo`
- `atlassian`
- `none`

## SCM Providers

- `github`
- `none`

## TMS Providers

- `testrail`
- `none`

## Environment

Common variables:

- Atlassian: `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`
- Confluence: `CONFLUENCE_SPACE_KEY`, optional `CONFLUENCE_BASE_URL`
- GitHub CLI auth when `scm.provider="github"`
- TestRail env vars when `tms.provider="testrail"`

## Important Files

- `scripts/agency-mcp.js`
- `scripts/agency.js`
- `scripts/config.js`
- `scripts/memory.js`
- `prompts/`
- `defaults.json`

## Useful Commands

```bash
# Initialize host repo configuration
./.agency/bin/agency init --mode atlassian

# Validate configuration
node .agency/scripts/config.js --validate

# Regenerate OpenCode config
node .agency/scripts/config.js --generate

# Run offline doctor
./.agency/bin/agency doctor

# Show queue
./.agency/bin/agency next --label ai-state:ready-for-plan --limit 10

# Show ticket summary
./.agency/bin/agency open --id JIRA-123

# Update ticket title/body
./.agency/bin/agency tracker update --id JIRA-123 --title "Refined title" --body "Refined description"
```

## Architecture Docs

For deeper implementation rationale:

- [Product Overview](PRODUCT_OVERVIEW.md)
- [Agency MCP Architecture](architecture/agency-mcp-architecture.md)
- [Agency Hardening Checklist](architecture/agency-hardening-checklist.md)
