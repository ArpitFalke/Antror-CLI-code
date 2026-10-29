import { MCPServerConfig } from '../config/types.js';
import { loadSettings, saveProjectSettings } from '../config/settings.js';
import { MCPClient } from './client.js';
import { ToolRegistry } from '../tools/registry.js';
import { BaseTool, ToolResult } from '../tools/base.js';
import { AgentContext } from '../agent/types.js';

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  public async loadAllAndRegister(registry: ToolRegistry): Promise<number> {
    const settings = loadSettings({}, this.cwd);
    const servers = settings.mcpServers || {};
    let totalTools = 0;

    for (const [name, config] of Object.entries(servers)) {
      try {
        const client = new MCPClient(name, config);
        this.clients.set(name, client);
        const tools = await client.connect();

        for (const toolDef of tools) {
          const originalName = toolDef.name.replace(`mcp_${name}_`, '');
          const mcpTool: BaseTool = {
            name: toolDef.name,
            description: toolDef.description,
            parameters: toolDef.parameters,
            execute: async (args: any, _ctx: AgentContext): Promise<ToolResult> => {
              return await client.callTool(originalName, args);
            },
            renderCall: (args: any) => `● ${toolDef.name}(${JSON.stringify(args).slice(0, 40)})`,
            renderResult: (res: ToolResult) => `⎿ ${res.output.slice(0, 80)}`,
          };
          registry.register(mcpTool);
          totalTools++;
        }
      } catch (err: any) {
        // Log MCP error gracefully without crashing
      }
    }

    return totalTools;
  }

  public static addServer(name: string, config: MCPServerConfig, cwd: string = process.cwd()): void {
    const settings = loadSettings({}, cwd);
    const servers = settings.mcpServers || {};
    servers[name] = config;
    saveProjectSettings({ mcpServers: servers }, cwd);
  }

  public static removeServer(name: string, cwd: string = process.cwd()): boolean {
    const settings = loadSettings({}, cwd);
    const servers = settings.mcpServers || {};
    if (servers[name]) {
      delete servers[name];
      saveProjectSettings({ mcpServers: servers }, cwd);
      return true;
    }
    return false;
  }

  public static listServers(cwd: string = process.cwd()): Record<string, MCPServerConfig> {
    const settings = loadSettings({}, cwd);
    return settings.mcpServers || {};
  }
}
