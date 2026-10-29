import { BaseTool, ToolResult } from './base.js';
import { ToolDefinition } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { EditTool, MultiEditTool } from './edit.js';
import { NotebookEditTool } from './notebook-edit.js';
import { BashTool } from './bash.js';
import { GlobTool, GrepTool, LSTool } from './file-search.js';
import { WebFetchTool, WebSearchTool } from './web.js';
import { TodoWriteTool } from './todo.js';
import { ExitPlanModeTool } from './plan.js';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  public register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  public unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  public get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  public getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  public getDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  public async execute(
    name: string,
    args: Record<string, any>,
    context: AgentContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        output: `Error: Unknown tool "${name}"`,
        isError: true,
      };
    }

    try {
      return await tool.execute(args, context);
    } catch (err: any) {
      return {
        output: `Error in tool "${name}": ${err.message || String(err)}`,
        isError: true,
      };
    }
  }

  public renderCall(name: string, args: Record<string, any>): string {
    const tool = this.tools.get(name);
    if (tool && tool.renderCall) {
      return tool.renderCall(args);
    }
    return `● ${name}(${JSON.stringify(args).slice(0, 50)})`;
  }

  public renderResult(name: string, result: ToolResult): string {
    const tool = this.tools.get(name);
    if (tool && tool.renderResult) {
      return tool.renderResult(result);
    }
    return `⎿ ${result.output.slice(0, 80)}`;
  }

  public static createDefault(options: {
    cwd?: string;
  } = {}): ToolRegistry {
    const registry = new ToolRegistry();

    registry.register(new ReadTool());
    registry.register(new WriteTool());
    registry.register(new EditTool());
    registry.register(new MultiEditTool());
    registry.register(new NotebookEditTool());

    const bash = new BashTool();
    if (options.cwd) bash.setCwd(options.cwd);
    registry.register(bash);

    registry.register(new GlobTool());
    registry.register(new GrepTool());
    registry.register(new LSTool());
    registry.register(new WebFetchTool());
    registry.register(new WebSearchTool());
    registry.register(new TodoWriteTool());
    registry.register(new ExitPlanModeTool());

    return registry;
  }
}
