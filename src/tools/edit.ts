import fs from 'node:fs';
import path from 'node:path';
import { createPatch } from 'diff';
import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class EditTool implements BaseTool {
  public readonly name = 'Edit';
  public readonly description =
    'Perform exact string replacement in a file. File MUST be Read first. old_string must be completely unique in the file.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path of the file to edit (relative or absolute)',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to replace. Must appear exactly once in the file.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text.',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  };

  public async execute(
    args: { path: string; old_string: string; new_string: string },
    context: AgentContext
  ): Promise<ToolResult> {
    const filePath = path.resolve(process.cwd(), args.path);

    if (!fs.existsSync(filePath)) {
      return {
        output: `Error: File "${args.path}" does not exist. Use Write to create new files.`,
        isError: true,
      };
    }

    // Safety Rule 1: Must be Read first
    if (!context.filesRead.has(filePath)) {
      return {
        output: `Safety rejection: File "${args.path}" was not read first. You must call Read("${args.path}") before making edits.`,
        isError: true,
      };
    }

    // Safety Rule 2: Reject stale edits
    const currentStat = fs.statSync(filePath);
    const recordedMtime = context.fileVersions.get(filePath);
    if (recordedMtime && Math.abs(currentStat.mtimeMs - recordedMtime) > 10) {
      return {
        output: `Safety rejection: File "${args.path}" was modified externally since it was read. Call Read("${args.path}") again to inspect recent changes.`,
        isError: true,
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Uniqueness check
    if (args.old_string === args.new_string) {
      return {
        output: 'Error: old_string and new_string are identical. No change made.',
        isError: true,
      };
    }

    const occurrences = content.split(args.old_string).length - 1;

    if (occurrences === 0) {
      return {
        output: `Error: old_string not found in "${args.path}". Please ensure exact matching including whitespace, newlines, and indentation.`,
        isError: true,
      };
    }

    if (occurrences > 1) {
      return {
        output: `Error: old_string occurs ${occurrences} times in "${args.path}". Edits require exact uniqueness. Include more surrounding context lines to make old_string unique.`,
        isError: true,
      };
    }

    // Perform replacement
    const updatedContent = content.replace(args.old_string, args.new_string);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Update safety context
    const newStat = fs.statSync(filePath);
    context.fileVersions.set(filePath, newStat.mtimeMs);

    // Compute diff
    const patch = createPatch(args.path, content, updatedContent, 'before', 'after');

    const additions = (args.new_string.match(/\n/g) || []).length;
    const removals = (args.old_string.match(/\n/g) || []).length;

    return {
      output: `Successfully updated ${args.path}`,
      diff: patch,
      data: {
        path: args.path,
        additions,
        removals,
      },
    };
  }

  public renderCall(args: any): string {
    return `● Edit(${args.path})`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) {
      return `⎿ ${result.output}`;
    }
    const data = result.data;
    return `⎿ Updated ${data?.path || 'file'} (${data?.additions || 0} additions, ${data?.removals || 0} removals)`;
  }
}

export class MultiEditTool implements BaseTool {
  public readonly name = 'MultiEdit';
  public readonly description =
    'Perform multiple sequential exact string replacements in a single file.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path of the file to edit',
      },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string' },
            new_string: { type: 'string' },
          },
          required: ['old_string', 'new_string'],
        },
        description: 'Array of exact string replacements to apply in order',
      },
    },
    required: ['path', 'edits'],
  };

  public async execute(
    args: { path: string; edits: Array<{ old_string: string; new_string: string }> },
    context: AgentContext
  ): Promise<ToolResult> {
    const editTool = new EditTool();
    let lastResult: ToolResult = { output: 'No edits specified' };

    for (let i = 0; i < args.edits.length; i++) {
      const edit = args.edits[i];
      const res = await editTool.execute(
        { path: args.path, old_string: edit.old_string, new_string: edit.new_string },
        context
      );
      if (res.isError) {
        return {
          output: `Error at edit step ${i + 1}/${args.edits.length}: ${res.output}`,
          isError: true,
        };
      }
      lastResult = res;
    }

    return {
      output: `Successfully applied ${args.edits.length} edits to ${args.path}`,
      diff: lastResult.diff,
      data: {
        path: args.path,
        count: args.edits.length,
      },
    };
  }

  public renderCall(args: any): string {
    return `● MultiEdit(${args.path}, ${args.edits?.length || 0} edits)`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) {
      return `⎿ ${result.output}`;
    }
    return `⎿ Applied ${result.data?.count || 0} edits to ${result.data?.path}`;
  }
}
