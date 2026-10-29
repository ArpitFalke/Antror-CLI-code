import { spawn, ChildProcess } from 'node:child_process';
import { MCPServerConfig } from '../config/types.js';
import { ToolDefinition } from '../llm/types.js';
import { BaseTool, ToolResult } from '../tools/base.js';
import { AgentContext } from '../agent/types.js';

export class MCPClient {
  public readonly serverName: string;
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number | string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private tools: ToolDefinition[] = [];

  constructor(serverName: string, config: MCPServerConfig) {
    this.serverName = serverName;
    this.config = config;
  }

  public async connect(): Promise<ToolDefinition[]> {
    const transport = this.config.transport || (this.config.command ? 'stdio' : 'http');

    if (transport === 'stdio') {
      return this.connectStdio();
    } else {
      return this.connectHttp();
    }
  }

  private async connectStdio(): Promise<ToolDefinition[]> {
    if (!this.config.command) {
      throw new Error(`MCP server "${this.serverName}" has no command specified for stdio transport.`);
    }

    const isWin = process.platform === 'win32';
    const child = spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWin,
    });

    this.process = child;
    let buffer = '';

    child.stdout?.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line.trim());
          if (res.id && this.pendingRequests.has(res.id)) {
            const { resolve, reject } = this.pendingRequests.get(res.id)!;
            this.pendingRequests.delete(res.id);
            if (res.error) {
              reject(new Error(res.error.message || JSON.stringify(res.error)));
            } else {
              resolve(res.result);
            }
          }
        } catch {}
      }
    });

    // 1. Initialize
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'AntrorCode', version: '1.0.0' },
    });

    // 2. Discover tools
    const toolsResult = await this.sendRequest('tools/list', {});
    this.tools = (toolsResult?.tools || []).map((t: any) => ({
      name: `mcp_${this.serverName}_${t.name}`,
      description: `[MCP: ${this.serverName}] ${t.description || ''}`,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    }));

    return this.tools;
  }

  private async connectHttp(): Promise<ToolDefinition[]> {
    const url = this.config.url;
    if (!url) throw new Error(`MCP server "${this.serverName}" has no url configured.`);

    const res = await fetch(`${url}/tools/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    if (!res.ok) {
      throw new Error(`MCP server HTTP error (${res.status}): ${await res.text()}`);
    }

    const data: any = await res.json();
    this.tools = (data.result?.tools || []).map((t: any) => ({
      name: `mcp_${this.serverName}_${t.name}`,
      description: `[MCP: ${this.serverName}] ${t.description || ''}`,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    }));

    return this.tools;
  }

  public async callTool(originalToolName: string, args: Record<string, any>): Promise<ToolResult> {
    const transport = this.config.transport || (this.config.command ? 'stdio' : 'http');

    if (transport === 'stdio') {
      try {
        const result = await this.sendRequest('tools/call', {
          name: originalToolName,
          arguments: args,
        });

        const textParts = (result?.content || [])
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('\n');

        return {
          output: textParts || JSON.stringify(result),
          isError: Boolean(result?.isError),
        };
      } catch (err: any) {
        return {
          output: `MCP tool execution failed: ${err.message}`,
          isError: true,
        };
      }
    } else {
      const url = this.config.url;
      const res = await fetch(`${url}/tools/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'tools/call',
          params: { name: originalToolName, arguments: args },
        }),
      });

      const data: any = await res.json();
      return {
        output: JSON.stringify(data.result),
        isError: Boolean(data.error),
      };
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error('MCP server process stdin is not open.'));
      }

      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process.stdin.write(msg);
    });
  }

  public disconnect(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch {}
      this.process = null;
    }
  }
}
