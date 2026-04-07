# Enterprise Agentic Delivery Platform (.agency)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://img.shields.io/badge/test-deterministic-green.svg)](test/)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

**v0.7.0** | Portable, role-based Agentic SDLC for any host repository

`.agency` is a governed SDLC workflow layer for AI agents.

It gives teams:

- stable role prompts over a shared workflow contract
- provider-agnostic tools over Jira, Confluence, GitHub, Linear, and optional TMS systems
- human approval gates instead of fully autonomous agent execution
- a portable workflow state machine based on `ai-state:*` labels plus spec approval

## Start Here

- [Product Overview](docs/PRODUCT_OVERVIEW.md)
- [Demo Runbook](docs/DEMO_RUNBOOK.md)
- [Technical Reference](docs/TECHNICAL_REFERENCE.md)
- [Agency MCP Architecture](docs/architecture/agency-mcp-architecture.md)
- [Agency Hardening Checklist](docs/architecture/agency-hardening-checklist.md)

## Quickstart

```bash
git submodule add https://github.com/klikaba/AI-assisted-delivery.git .agency
git submodule update --init --recursive
./.agency/bin/agency init --mode atlassian  # or: github | linear | standalone
git add .agency-project.json .agency-rules.md .gitignore
git commit -m "chore: configure .agency"
opencode --config opencode.jsonc
```

If you get stuck:

```bash
./.agency/bin/agency doctor
```

## Demo Path

The strongest current demo path is Jira + Confluence.

High-level flow:

1. Product refines a rough backlog item.
2. Planning creates the implementation spec and execution plan.
3. A human approves the spec in Confluence by changing `Spec Status`.
4. PM syncs approval back to Jira labels.
5. Dev, QA, Review, optional Security, and PM Release continue the governed workflow.

Use the detailed operator sequence in [Demo Runbook](docs/DEMO_RUNBOOK.md).

## What This Repository Contains

- generated OpenCode config support
- local Agency MCP server
- provider adapters for Jira/Confluence, GitHub, Linear, and fake/offline mode
- governed role prompts for the SDLC workflow
- deterministic tests and simulated flows for regression protection

## Current Product Shape

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

## Contributing

- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](.github/SECURITY.md)
- [Issue Tracker](https://github.com/klikaba/AI-assisted-delivery/issues)

## License

Apache 2.0 with attribution requirement.

See:

- [LICENSE](LICENSE)
- [NOTICE](NOTICE)

