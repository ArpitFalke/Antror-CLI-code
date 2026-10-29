import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class GlobTool implements BaseTool {
  public readonly name = 'Glob';
  public readonly description =
    'Find files matching a glob pattern (e.g. "**/*.ts", "src/**/*.tsx", "tests/*.test.js").';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match against files',
      },
      path: {
        type: 'string',
        description: 'Directory to search within (defaults to current directory)',
      },
    },
    required: ['pattern'],
  };

  public async execute(args: { pattern: string; path?: string }, _context: AgentContext): Promise<ToolResult> {
    const cwd = args.path ? path.resolve(process.cwd(), args.path) : process.cwd();

    try {
      const matches = await glob(args.pattern, {
        cwd,
        nodir: true,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'legacy/**'],
      });

      if (matches.length === 0) {
        return {
          output: `No files matched pattern "${args.pattern}"`,
          data: { matches: [] },
        };
      }

      return {
        output: matches.join('\n'),
        data: { matches, count: matches.length },
      };
    } catch (err: any) {
      return {
        output: `Error evaluating glob pattern: ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● Glob(${args.pattern})`;
  }

  public renderResult(result: ToolResult): string {
    const count = result.data?.count ?? result.output.split('\n').filter(Boolean).length;
    return `⎿ Found ${count} files`;
  }
}

export class GrepTool implements BaseTool {
  public readonly name = 'Grep';
  public readonly description =
    'Search for regex pattern across files. Uses ripgrep when available, with pure JS fallback.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex or text pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in (defaults to current directory)',
      },
      include: {
        type: 'string',
        description: 'File glob pattern to filter search (e.g. "*.ts")',
      },
    },
    required: ['pattern'],
  };

  public async execute(
    args: { pattern: string; path?: string; include?: string },
    _context: AgentContext
  ): Promise<ToolResult> {
    const targetDir = args.path ? path.resolve(process.cwd(), args.path) : process.cwd();

    // Check if ripgrep (rg) is available
    let hasRg = false;
    try {
      execSync('rg --version', { stdio: 'ignore' });
      hasRg = true;
    } catch {
      hasRg = false;
    }

    if (hasRg) {
      try {
        const globFlag = args.include ? `--glob "${args.include}"` : '';
        const cmd = `rg -n --no-heading --color=never -g "!node_modules" -g "!.git" -g "!dist" ${globFlag} "${args.pattern.replace(/"/g, '\\"')}" "${targetDir}"`;
        const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        return {
          output: output.trim() || 'No matches found.',
          data: { matchCount: output.split('\n').filter(Boolean).length },
        };
      } catch (err: any) {
        if (err.status === 1) {
          return { output: 'No matches found.', data: { matchCount: 0 } };
        }
        // Fall back to pure JS search on error
      }
    }

    // Pure JS recursive Grep Fallback
    try {
      const regex = new RegExp(args.pattern, 'i');
      const results: string[] = [];

      const searchFile = (filePath: string) => {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
          lines.forEach((line, idx) => {
            if (regex.test(line)) {
              results.push(`${relPath}:${idx + 1}:${line.trimEnd()}`);
            }
          });
        } catch {
          // Skip binary or unreadable files
        }
      };

      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (['node_modules', '.git', 'dist', 'legacy'].includes(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            if (!args.include || fullPath.endsWith(args.include.replace(/^\*/, ''))) {
              searchFile(fullPath);
            }
          }
        }
      };

      if (fs.existsSync(targetDir)) {
        const stat = fs.statSync(targetDir);
        if (stat.isDirectory()) {
          walk(targetDir);
        } else {
          searchFile(targetDir);
        }
      }

      const MAX_MATCHES = 200;
      let outputText = '';
      if (results.length === 0) {
        outputText = 'No matches found.';
      } else if (results.length > MAX_MATCHES) {
        outputText =
          results.slice(0, MAX_MATCHES).join('\n') +
          `\n\n... and ${results.length - MAX_MATCHES} more matches (truncated)`;
      } else {
        outputText = results.join('\n');
      }

      return {
        output: outputText,
        data: { matchCount: results.length },
      };
    } catch (err: any) {
      return {
        output: `Error executing search: ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● Grep(/${args.pattern}/)`;
  }

  public renderResult(result: ToolResult): string {
    const count = result.data?.matchCount ?? 0;
    return `⎿ Found ${count} match${count === 1 ? '' : 'es'}`;
  }
}

export class LSTool implements BaseTool {
  public readonly name = 'LS';
  public readonly description =
    'List contents of a directory with file sizes and directory indicators.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (defaults to current directory)',
      },
    },
  };

  public async execute(args: { path?: string }, _context: AgentContext): Promise<ToolResult> {
    const dirPath = args.path ? path.resolve(process.cwd(), args.path) : process.cwd();

    if (!fs.existsSync(dirPath)) {
      return {
        output: `Error: Directory not found at "${args.path || '.'}"`,
        isError: true,
      };
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const rows: string[] = [];

      for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        try {
          const stat = fs.statSync(full);
          const isDir = entry.isDirectory();
          const marker = isDir ? '📁' : '📄';
          const sizeStr = isDir ? '<DIR>' : `${(stat.size / 1024).toFixed(1)} KB`;
          const suffix = isDir ? '/' : '';
          rows.push(`${marker} ${entry.name}${suffix.padEnd(30 - entry.name.length, ' ')} \t${sizeStr}`);
        } catch {
          rows.push(`❓ ${entry.name}`);
        }
      }

      return {
        output: rows.join('\n'),
        data: { count: entries.length, path: dirPath },
      };
    } catch (err: any) {
      return {
        output: `Error reading directory: ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● LS(${args.path || '.'})`;
  }

  public renderResult(result: ToolResult): string {
    return `⎿ Found ${result.data?.count || 0} items`;
  }
}
