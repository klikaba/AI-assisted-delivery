# Agency MCP Architecture

## Decision

`agency` remains the single agent-facing workflow layer.

Agents should use:

- `workflow.*`
- `tracker.*`
- `docs.*`
- `scm.*`
- `tms.*`

Agents should not depend on vendor-native MCP tools for normal workflow execution.

## Rationale

The value of this project is not "connect to Jira" or "connect to GitHub".
The value is a portable, governed SDLC workflow that stays stable across providers.

That requires:

1. A stable tool contract for prompts
2. Workflow semantics in one place
3. Provider adapters hidden behind that contract

## Boundaries

### Agency MCP

Owns:

- workflow state transitions
- evidence parsing and gate evaluation
- ticket/spec/PR/test-case linkage
- provider-agnostic tool names and prompt contracts

### Provider Adapters

Own:

- Jira/Confluence/GitHub/Linear/TestRail transport details
- authentication details
- provider-specific payload mapping

Adapters are implementation details behind `agency`.

## Direct Vendor MCPs

Direct vendor MCPs are optional operator tools.

They may be enabled in OpenCode for:

- debugging
- manual inspection
- one-off vendor-native operations

They are not the canonical path for agent workflows.

## Atlassian

Current canonical implementation:

- `agency` uses the Atlassian REST-backed adapter
- credentials come from local env (`.env.local` / `.env`)

Optional operator tool:

- direct Atlassian MCP in OpenCode
- enabled explicitly via `opencode.vendor_mcp.atlassian.enabled=true`

## Configuration Rule

- `tracker.atlassian.backend` controls the Agency workflow adapter
- `opencode.vendor_mcp.atlassian.*` controls whether OpenCode exposes the direct Atlassian MCP

These concerns are intentionally separate.

## Operational Guidance

For normal use:

1. run agents through `agency`
2. rely on provider adapters behind `agency`
3. use direct vendor MCPs only when necessary

For demos:

1. preflight the exact `agency` workflow path
2. avoid mixing direct vendor MCP calls into the primary flow
