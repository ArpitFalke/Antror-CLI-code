import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';
import { AgentLoop } from '../agent/loop.js';
import { LLMProvider } from '../llm/provider.js';
import { ToolRegistry } from './registry.js';

export class TaskTool implements BaseTool {
  public readonly name = 'Task';
  public readonly description =
    'Launch an autonomous sub-agent with isolated context and a specific tool allowlist. Returns a final summary to the parent.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed instructions and goal for the sub-agent',
      },
      description: {
        type: 'string',
        description: 'Brief 2-5 word description of the subtask',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Allowlist of tool names the sub-agent can use (e.g. ["Read", "Glob", "Grep"])',
      },
    },
    required: ['prompt'],
  };

  private providerFactory: () => LLMProvider;
  private registryFactory: () => ToolRegistry;

  constructor(providerFactory: () => LLMProvider, registryFactory: () => ToolRegistry) {
    this.providerFactory = providerFactory;
    this.registryFactory = registryFactory;
  }

  public async execute(
    args: { prompt: string; description?: string; tools?: string[] },
    parentContext: AgentContext
  ): Promise<ToolResult> {
    const provider = this.providerFactory();
    const parentRegistry = this.registryFactory();

    // Create filtered tool registry for sub-agent
    const subRegistry = new ToolRegistry();
    const allowed = args.tools || ['Read', 'Glob', 'Grep', 'LS'];

    for (const toolName of allowed) {
      const tool = parentRegistry.get(toolName);
      if (tool && tool.name !== 'Task') {
        subRegistry.register(tool);
      }
    }

    const subLoop = new AgentLoop({
      provider,
      systemPrompt:
        'You are an autonomous sub-agent assisting Antror Code. Complete the assigned subtask thoroughly and provide a clear, concise summary of your findings or results.',
      tools: {
        getDefinitions: () => subRegistry.getDefinitions(),
        execute: (name, toolArgs, ctx) => subRegistry.execute(name, toolArgs, ctx),
      },
      maxRounds: 15,
    });

    try {
      const result = await subLoop.run(args.prompt);

      // Merge sub-agent token usage into parent context
      parentContext.totalUsage.promptTokens += subLoop.context.totalUsage.promptTokens;
      parentContext.totalUsage.completionTokens += subLoop.context.totalUsage.completionTokens;
      parentContext.totalUsage.totalTokens += subLoop.context.totalUsage.totalTokens;
      parentContext.totalCost += subLoop.context.totalCost;

      return {
        output: `Sub-agent completed:\n\n${result}`,
        data: {
          description: args.description || 'Subtask',
          tokens: subLoop.context.totalUsage.totalTokens,
        },
      };
    } catch (err: any) {
      return {
        output: `Sub-agent failed: ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● Task("${args.description || args.prompt.slice(0, 40)}")`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) return `⎿ Sub-agent failed: ${result.output}`;
    return `⎿ Sub-agent completed task (${result.data?.tokens || 0} tokens used)`;
  }
}
