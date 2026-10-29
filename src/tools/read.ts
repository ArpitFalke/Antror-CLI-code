import fs from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class ReadTool implements BaseTool {
  public readonly name = 'Read';
  public readonly description =
    'Read file contents. Supports line ranges, images, PDFs, and Jupyter notebooks (.ipynb). Always read a file before editing or overwriting it.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (relative to project root or absolute)',
      },
      offset: {
        type: 'number',
        description: 'The 1-based line number to start reading from (optional)',
      },
      limit: {
        type: 'number',
        description: 'The maximum number of lines to read (optional)',
      },
    },
    required: ['path'],
  };

  public async execute(args: { path: string; offset?: number; limit?: number }, context: AgentContext): Promise<ToolResult> {
    const filePath = path.resolve(process.cwd(), args.path);

    if (!fs.existsSync(filePath)) {
      return {
        output: `Error: File not found at path "${args.path}"`,
        isError: true,
      };
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return {
        output: `Error: Path "${args.path}" is a directory. Use LS to inspect directory contents.`,
        isError: true,
      };
    }

    // Record that this file was read and its mtime
    context.filesRead.add(filePath);
    context.fileVersions.set(filePath, stat.mtimeMs);

    const ext = path.extname(filePath).toLowerCase();

    // Handle Images
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
      const buffer = fs.readFileSync(filePath);
      const b64 = buffer.toString('base64');
      const sizeKb = (stat.size / 1024).toFixed(1);
      return {
        output: `[Image file: ${args.path} (${sizeKb} KB, MIME: image/${ext.replace('.', '')})]`,
        data: {
          type: 'image',
          mimeType: `image/${ext.replace('.', '')}`,
          base64: b64,
        },
      };
    }

    // Handle Jupyter Notebooks (.ipynb)
    if (ext === '.ipynb') {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const nb = JSON.parse(raw);
        const cellOutputs: string[] = [];
        const cells = nb.cells || [];
        cells.forEach((cell: any, idx: number) => {
          const cellType = cell.cell_type || 'code';
          const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source || '';
          cellOutputs.push(`--- Cell [${idx + 1}] (${cellType}) ---\n${src}`);
        });
        return {
          output: cellOutputs.join('\n\n'),
        };
      } catch (err: any) {
        return {
          output: `Error parsing Jupyter notebook: ${err.message}`,
          isError: true,
        };
      }
    }

    // Handle Text Files
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      let start = 1;
      if (args.offset && args.offset > 0) {
        start = Math.min(args.offset, totalLines);
      }

      let count = totalLines - start + 1;
      if (args.limit && args.limit > 0) {
        count = Math.min(args.limit, count);
      }

      const selectedLines = lines.slice(start - 1, start - 1 + count);
      const formatted = selectedLines
        .map((line, idx) => {
          const lineNum = (start + idx).toString().padStart(5, ' ');
          return `${lineNum} | ${line}`;
        })
        .join('\n');

      return {
        output: formatted,
        data: {
          totalLines,
          startLine: start,
          readLines: count,
        },
      };
    } catch (err: any) {
      return {
        output: `Error reading file: ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    const range = args.offset || args.limit ? `:${args.offset || 1}+${args.limit || 'all'}` : '';
    return `● Read(${args.path}${range})`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) {
      return `⎿ ${result.output}`;
    }
    if (result.data?.readLines) {
      return `⎿ Read ${result.data.readLines} lines (total ${result.data.totalLines} lines)`;
    }
    return `⎿ Read ${result.output.split('\n').length} lines`;
  }
}
