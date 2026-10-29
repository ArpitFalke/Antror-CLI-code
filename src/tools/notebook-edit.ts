import fs from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class NotebookEditTool implements BaseTool {
  public readonly name = 'NotebookEdit';
  public readonly description =
    'Edit or replace a specific cell in a Jupyter Notebook (.ipynb) by cell index.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path of the .ipynb file',
      },
      cell_index: {
        type: 'number',
        description: '1-based index of the cell to modify',
      },
      new_source: {
        type: 'string',
        description: 'New source code or markdown for the cell',
      },
      cell_type: {
        type: 'string',
        enum: ['code', 'markdown'],
        description: 'Optionally change the cell type',
      },
    },
    required: ['path', 'cell_index', 'new_source'],
  };

  public async execute(
    args: { path: string; cell_index: number; new_source: string; cell_type?: string },
    context: AgentContext
  ): Promise<ToolResult> {
    const filePath = path.resolve(process.cwd(), args.path);

    if (!fs.existsSync(filePath)) {
      return { output: `Error: File not found at "${args.path}"`, isError: true };
    }

    if (!context.filesRead.has(filePath)) {
      return {
        output: `Safety rejection: Notebook "${args.path}" was not read first. Use Read("${args.path}") first.`,
        isError: true,
      };
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const nb = JSON.parse(raw);
      const cells = nb.cells || [];

      const targetIdx = args.cell_index - 1;
      if (targetIdx < 0 || targetIdx >= cells.length) {
        return {
          output: `Error: cell_index ${args.cell_index} is out of bounds (notebook has ${cells.length} cells).`,
          isError: true,
        };
      }

      cells[targetIdx].source = args.new_source.split('\n').map((l, i, arr) => i < arr.length - 1 ? l + '\n' : l);
      if (args.cell_type) {
        cells[targetIdx].cell_type = args.cell_type;
      }

      fs.writeFileSync(filePath, JSON.stringify(nb, null, 2), 'utf-8');
      const newStat = fs.statSync(filePath);
      context.fileVersions.set(filePath, newStat.mtimeMs);

      return {
        output: `Successfully updated cell ${args.cell_index} in ${args.path}`,
        data: { cell_index: args.cell_index, path: args.path },
      };
    } catch (err: any) {
      return { output: `Error modifying notebook: ${err.message}`, isError: true };
    }
  }

  public renderCall(args: any): string {
    return `● NotebookEdit(${args.path}, cell ${args.cell_index})`;
  }

  public renderResult(result: ToolResult): string {
    return `⎿ ${result.output}`;
  }
}
