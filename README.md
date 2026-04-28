# Enterprise Delivery OS

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://img.shields.io/badge/test-deterministic-green.svg)](test/)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/klikaba/AI-assisted-delivery?style=social)](https://github.com/klikaba/AI-assisted-delivery/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/klikaba/AI-assisted-delivery?style=social)](https://github.com/klikaba/AI-assisted-delivery/network/members)

**v0.7.0** | Portable, role-based Delivery OS for host repositories

Delivery OS is a governed SDLC workflow layer for AI agents. Install it as `.agency` in a host repository to standardize roles, approvals, tracker integrations, and repeatable handoffs.

| Key | Value |
| --- | --- |
| Install location | `.agency` inside the host repository |
| Best demo path | Jira + Confluence with `scm.provider="none"` |
| Bootstrap | `./.agency/bin/agency init --mode atlassian --docs atlassian` |

## At A Glance

- Role-based agents for Product, Planning, Developer, QA, Review, PM, Security, Architecture, and DevOps
- Human approval gates built into the workflow
- Portable integrations for Jira, Confluence, GitHub, Linear, and offline/fake modes

## Contents

- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [Demo Path](#demo-path)
- [Included Components](#included-components)
- [Workflow Roles](#workflow-roles)
- [Reference](#reference)
- [Get Help](#get-help)
- [Contribute](#contribute)
- [License](#license)

## Requirements

- Node.js 18+
- Git
- OpenCode CLI, install with `npm install -g opencode`

## Quickstart

Run the following from the host repository root, not from inside the `.agency` checkout.

```bash
# Install OpenCode CLI
npm install -g opencode

# Add Delivery OS as a git submodule in the host repository
git submodule add https://github.com/klikaba/AI-assisted-delivery.git .agency
git submodule update --init --recursive

# Initialize the host repository
./.agency/bin/agency init --mode atlassian --docs atlassian

# For the Jira + Confluence demo path, set scm.provider to "none"
# in .agency-project.json before running OpenCode.

# Commit the tracked generated configuration
git add .agency-project.json .agency-rules.md .gitignore
git commit -m "chore: configure .agency"

# Start OpenCode with the generated config
opencode --config opencode.jsonc
```

If you want the guided bootstrap instead:

```bash
./.agency/setup.sh
```

If you get stuck:

```bash
./.agency/bin/agency doctor
```

## Demo Path

The strongest current demo path is Jira + Confluence with `scm.provider="none"`.

Recommended flow:

1. Product refines a rough backlog item.
2. Planning creates the implementation spec and execution plan.
3. A human approves the spec in Confluence by changing `Spec Status`.
4. PM syncs approval back to Jira labels.
5. Dev, QA, Review, optional Security, and PM Release continue the governed workflow.

Primary workflow helpers:

- `workflow.product_refine`
- `workflow.plan_finalize`
- `workflow.dev_finalize`

Use the detailed operator sequence in [Delivery OS Demo Runbook](docs/DEMO_RUNBOOK.md).

## Included Components

- generated OpenCode config support
- a local Delivery OS MCP server
- provider adapters for Jira/Confluence, GitHub, Linear, and fake/offline mode
- governed role prompts for the Delivery OS workflow
- deterministic tests and simulated flows for regression protection

## Workflow Roles

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

## Reference

- [Delivery OS Overview](docs/DELIVERY_OS_OVERVIEW.md)
- [Delivery OS Demo Runbook](docs/DEMO_RUNBOOK.md)
- [Delivery OS Product Overview](docs/PRODUCT_OVERVIEW.md)
- [Delivery OS Technical Reference](docs/TECHNICAL_REFERENCE.md)
- [Delivery OS MCP Architecture](docs/architecture/agency-mcp-architecture.md)
- [Delivery OS Hardening Checklist](docs/architecture/agency-hardening-checklist.md)

## Get Help

For questions, issues, or support requests, email: **support@klika.ba**

## Contribute

- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](.github/SECURITY.md)
- [Issue Tracker](https://github.com/klikaba/AI-assisted-delivery/issues)

## License

Apache 2.0 with attribution requirement.

If you use this software in a product or service, include the attribution below in your documentation or About section:

```text
Built using the Klika AI Engineering Toolkit
https://github.com/klikaba/AI-assisted-delivery
```

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
