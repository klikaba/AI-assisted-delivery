# Agency Hardening Checklist

## Canonical Architecture

- Agents use the local `agency` MCP only
- `agency` owns workflow semantics and evidence handling
- Provider adapters are implementation details behind `agency`
- Direct vendor MCPs are optional operator tools, not part of the normal workflow path

## Required Runtime Preconditions

### Atlassian

- `ATLASSIAN_SITE`
- `ATLASSIAN_EMAIL`
- `ATLASSIAN_API_TOKEN`
- `CONFLUENCE_SPACE_KEY`

### GitHub

- `gh auth login` completed when `scm.provider="github"`

## Canonical Preflight

Run before demos or live sessions:

```bash
npm run doctor:demo
```

This validates:

1. local env presence
2. resolved config
3. Atlassian auth on the same path used by `agency`
4. `agency` tracker search on the live Jira queue
5. GitHub CLI auth when SCM is enabled

## Readiness Criteria

The system is considered ready when:

1. `npm run doctor:demo` passes
2. `node scripts/agency.js tracker search --label ai-state:ready-for-plan --json` returns real Jira data
3. `node --test test/config.test.js` passes
4. `node --test test/agency.mcp.test.js` passes
5. `node --test test/agency.cli.test.js` passes

## Known Non-Goals

- Direct vendor MCPs are not required for agent workflows
- OpenCode should not depend on vendor-native tool calls for normal operation
- Demo success should not depend on mixing `agency` and direct Atlassian tools
