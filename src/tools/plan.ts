import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class ExitPlanModeTool implements BaseTool {
  public readonly name = 'ExitPlanMode';
  public readonly description =
    'Signal that planning is complete and propose transitioning from Plan mode to execution mode with the final plan.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      planSummary: {
        type: 'string',
        description: 'Detailed summary of the plan, affected files, approach, and verification steps',
      },
    },
    required: ['planSummary'],
  };

  public async execute(args: { planSummary: string }, _context: AgentContext): Promise<ToolResult> {
    return {
      output: `Plan mode exited. Proposed Plan:\n\n${args.planSummary}\n\nReady for user approval.`,
      data: { plan: args.planSummary, exitRequested: true },
    };
  }

  public renderCall(_args: any): string {
    return `● ExitPlanMode()`;
  }

  public renderResult(_result: ToolResult): string {
    return `⎿ Plan ready for approval`;
  }
}
