# Atlassian MCP Integration

This project uses the official **Atlassian Model Context Protocol (MCP)** server to connect deeply with Jira and Confluence.

## How it works
The `opencode.jsonc` configuration file defines a local MCP server that spawns the official Atlassian connector:

```json
"mcp": {
  "atlassian": {
    "type": "local",
    "command": ["npx", "-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"],
    "enabled": true
  }
}
```

## Setup
1.  When you first use an agent in the OpenCode TUI, `mcp-remote` will prompt you to authenticate via your browser.
2.  Once authorized, the agents gain safe, scoped access to your Jira Issues and Confluence Pages.
