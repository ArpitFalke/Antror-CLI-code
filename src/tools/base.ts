import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export interface ToolResult {
  output: string;
  isError?: boolean;
  diff?: string;
  data?: any;
}

export interface BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameterSchema;

  execute(args: any, context: AgentContext): Promise<ToolResult>;

  /** Render the tool call line in the terminal, e.g. `● Read(src/index.ts)` */
  renderCall(args: any): string;

  /** Render the tool result summary, e.g. `⎿ Read 120 lines` */
  renderResult(result: ToolResult): string;
}
