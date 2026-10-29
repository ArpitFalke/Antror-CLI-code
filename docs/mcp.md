# Antror Code — Model Context Protocol (MCP) Integration

Antror Code natively implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing dynamic tool expansion from any standard MCP server.

---

## Supported Transports

- **`stdio`**: Standard Input/Output subprocess communication using JSON-RPC 2.0.
- **`http` / `sse`**: Remote MCP server connection via HTTP/SSE.

---

## Managing MCP Servers via CLI

### 1. Add an MCP Server
```bash
# Add a local filesystem server
antror mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .

# Add GitHub MCP server
antror mcp add github npx -y @modelcontextprotocol/server-github

# Add Postgres MCP server
antror mcp add db npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb
```

### 2. List Configured Servers
```bash
antror mcp list
```

### 3. Remove an MCP Server
```bash
antror mcp remove filesystem
```

---

## How Dynamic MCP Tools Work Inside the Agent

When Antror Code launches:
1. It connects to all configured MCP servers defined in settings.
2. It sends `initialize` and calls `tools/list`.
3. Each remote tool is dynamically converted into an internal Antror tool prefixed with `mcp_<server>_<toolName>`.
4. The tool schema is registered into the LLM's available tools.
5. When the model invokes an MCP tool, Antror routes the execution over JSON-RPC 2.0 and formats the result back to the agent loop!
