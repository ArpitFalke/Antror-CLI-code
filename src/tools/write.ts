import fs from 'node:fs';
import path from 'node:path';
import { createPatch } from 'diff';
import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class WriteTool implements BaseTool {
  public readonly name = 'Write';
  public readonly description =
    'Write complete contents to a file. Overwrites existing file or creates a new one. Existing files MUST be Read first. Generates unified diff.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path of the file to write (relative to project root or absolute)',
      },
      content: {
        type: 'string',
        description: 'Complete new contents of the file',
      },
    },
    required: ['path', 'content'],
  };

  public async execute(args: { path: string; content: string }, context: AgentContext): Promise<ToolResult> {
    const filePath = path.resolve(process.cwd(), args.path);
    const fileExists = fs.existsSync(filePath);

    let oldContent = '';

    if (fileExists) {
      // Safety Rule 1: Must be Read first
      if (!context.filesRead.has(filePath)) {
        return {
          output: `Safety rejection: File "${args.path}" exists but was not read first. You must call Read("${args.path}") before writing or modifying it.`,
          isError: true,
        };
      }

      // Safety Rule 2: Reject stale writes if changed on disk
      const currentStat = fs.statSync(filePath);
      const recordedMtime = context.fileVersions.get(filePath);
      if (recordedMtime && Math.abs(currentStat.mtimeMs - recordedMtime) > 10) {
        return {
          output: `Safety rejection: File "${args.path}" was modified externally since it was read. Call Read("${args.path}") again to see recent changes before writing.`,
          isError: true,
        };
      }

      oldContent = fs.readFileSync(filePath, 'utf-8');
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(filePath, args.content, 'utf-8');

      // Update safety context
      const newStat = fs.statSync(filePath);
      context.filesRead.add(filePath);
      context.fileVersions.set(filePath, newStat.mtimeMs);

      // Generate diff
      const patch = createPatch(args.path, oldContent, args.content, 'before', 'after');

      const oldLines = oldContent ? oldContent.split('\n').length : 0;
      const newLines = args.content.split('\n').length;
      const additions = Math.max(0, newLines - oldLines);
      const removals = Math.max(0, oldLines - newLines);

      return {
        output: fileExists
          ? `Successfully updated ${args.path} (${newLines} lines)`
          : `Successfully created ${args.path} (${newLines} lines)`,
        diff: patch,
        data: {
          path: args.path,
          created: !fileExists,
          lines: newLines,
          additions,
          removals,
        },
      };
    } catch (err: any) {
      return {
        output: `Error writing file "${args.path}": ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● Write(${args.path})`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) {
      return `⎿ ${result.output}`;
    }
    const data = result.data;
    if (data?.created) {
      return `⎿ Created ${data.path} with ${data.lines} lines`;
    }
    return `⎿ Updated ${data?.path || 'file'} with ${data?.additions || 0} additions and ${data?.removals || 0} removals`;
  }
}
