# Enterprise Delivery OS

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://img.shields.io/badge/test-deterministic-green.svg)](test/)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/klikaba/AI-assisted-delivery?style=social)](https://github.com/klikaba/AI-assisted-delivery/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/klikaba/AI-assisted-delivery?style=social)](https://github.com/klikaba/AI-assisted-delivery/network/members)

**v0.7.0** | Portable, role-based Delivery OS for any host repository

Delivery OS is a governed SDLC workflow layer for AI agents.

It is installed as `.agency` in host repositories.

## Why Delivery OS?

Delivery OS enables organizations to accelerate software delivery using AI agents **without sacrificing governance, security, or accountability**. It provides:

- **Controlled Automation** – Agents execute tasks only within approved states
- **Human-in-the-Loop Governance** – All critical transitions require explicit human approval
- **Security by Default** – Continuous scanning, policy enforcement, and auditability
- **Enterprise Compatibility** – Works with existing tools (Jira, Confluence, GitHub, Linear)
- **Portability** – Repository-agnostic, versioned, and upgradeable

It gives teams:

- stable role prompts over a shared workflow contract
- provider-agnostic tools over Jira, Confluence, GitHub, Linear, and optional TMS systems
- human approval gates instead of fully autonomous agent execution
- a portable workflow state machine based on `ai-state:*` labels plus spec approval
- product-owned stage helpers for governed completion of Product, Planning, and Dev work

## Prerequisites

- **Node.js 18+** – For running the Delivery OS MCP server and CLI tools
- **Git** – For submodule installation and version control
- **OpenCode CLI** – For agent orchestration (install with `npm install -g opencode`)

## Start Here

- [Delivery OS Overview](docs/DELIVERY_OS_OVERVIEW.md)
- [Delivery OS Demo Runbook](docs/DEMO_RUNBOOK.md)
- [Delivery OS Product Overview](docs/PRODUCT_OVERVIEW.md)
- [Delivery OS Technical Reference](docs/TECHNICAL_REFERENCE.md)
- [Delivery OS MCP Architecture](docs/architecture/agency-mcp-architecture.md)
- [Delivery OS Hardening Checklist](docs/architecture/agency-hardening-checklist.md)

## Quickstart

```bash
# Install OpenCode CLI (agent orchestration)
npm install -g opencode

# Add Delivery OS as a git submodule
git submodule add https://github.com/klikaba/AI-assisted-delivery.git .agency
git submodule update --init --recursive

# Initialize for your tracker backend
./.agency/bin/agency init --mode atlassian  # or: github | linear | standalone

# Commit the generated configuration
git add .agency-project.json .agency-rules.md .gitignore
git commit -m "chore: configure .agency"

# Start OpenCode with the generated config
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

The current product-owned completion helpers are:

- `workflow.product_refine`
- `workflow.plan_finalize`
- `workflow.dev_finalize`

Use the detailed operator sequence in [Delivery OS Demo Runbook](docs/DEMO_RUNBOOK.md).

## What This Repository Contains

- generated OpenCode config support
- local Delivery OS MCP server
- provider adapters for Jira/Confluence, GitHub, Linear, and fake/offline mode
- governed role prompts for the Delivery OS workflow
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

## Support

For questions, issues, or support requests, email: **support@klika.ba**

## Contributing

- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](.github/SECURITY.md)
- [Issue Tracker](https://github.com/klikaba/AI-assisted-delivery/issues)

## License

Apache 2.0 with attribution requirement.

**If you use this software in a product or service, you must include the following attribution in your documentation, "About" section, or equivalent:**

```
"Built using the Klika AI Engineering Toolkit"
https://github.com/klikaba/AI-assisted-delivery
```

See:

- [LICENSE](LICENSE)
- [NOTICE](NOTICE)
