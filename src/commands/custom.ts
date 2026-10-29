import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

export interface CustomCommand {
  name: string;
  description: string;
  template: string;
  sourcePath: string;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawFm = match[1];
  const body = match[2];
  const fm: Record<string, string> = {};

  for (const line of rawFm.split('\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
      fm[key] = val;
    }
  }

  return { frontmatter: fm, body };
}

export function interpolateCommand(template: string, userArgs: string = '', cwd: string = process.cwd()): string {
  let result = template;

  // 1. Interpolate $ARGUMENTS
  result = result.replace(/\$ARGUMENTS/g, userArgs);

  // 2. Interpolate @file mentions: `@src/index.ts`
  result = result.replace(/@([a-zA-Z0-9_\-\.\/]+)/g, (fullMatch, filePath) => {
    const resolved = path.resolve(cwd, filePath);
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        const fileContent = fs.readFileSync(resolved, 'utf-8');
        return `\n\`\`\`${path.extname(filePath).slice(1)}\n${fileContent}\n\`\`\`\n`;
      }
    } catch {}
    return fullMatch;
  });

  // 3. Interpolate !bash commands: `!git status`
  result = result.replace(/!([a-zA-Z0-9_\-\.\s\|&;]+)/g, (fullMatch, cmd) => {
    try {
      const isWin = process.platform === 'win32';
      const shell = isWin ? 'powershell.exe' : '/bin/bash';
      const shellArgs = isWin ? ['-NoProfile', '-Command', cmd.trim()] : ['-c', cmd.trim()];
      const out = execSync(isWin ? `powershell.exe -NoProfile -Command "${cmd.trim()}"` : cmd.trim(), {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return out.trim();
    } catch (err: any) {
      return `[Command execution error: ${err.message}]`;
    }
  });

  return result;
}

export class CustomCommandLoader {
  public static loadAll(cwd: string = process.cwd()): Map<string, CustomCommand> {
    const commands = new Map<string, CustomCommand>();

    const dirs = [
      path.join(os.homedir(), '.antror', 'commands'),
      path.join(cwd, '.antror', 'commands'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;

          const filePath = path.join(dir, file);
          const cmdName = '/' + path.basename(file, '.md');
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(raw);

            commands.set(cmdName, {
              name: cmdName,
              description: frontmatter.description || `Custom command from ${file}`,
              template: body.trim(),
              sourcePath: filePath,
            });
          } catch {}
        }
      } catch {}
    }

    return commands;
  }
}
