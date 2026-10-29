import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface MemoryFile {
  filePath: string;
  scope: 'user' | 'parent' | 'project';
  content: string;
}

export class MemoryLoader {
  private visitedImports: Set<string> = new Set();

  /**
   * Recursively resolve `@import <relative-path>` directives
   */
  public resolveImports(content: string, baseDir: string): string {
    const lines = content.split('\n');
    const resolvedLines: string[] = [];

    for (const line of lines) {
      const match = line.trim().match(/^@import\s+([^\s]+)/);
      if (match) {
        const importTarget = match[1].replace(/["']/g, '');
        const targetPath = path.resolve(baseDir, importTarget);

        if (this.visitedImports.has(targetPath)) {
          resolvedLines.push(`<!-- Cycle detected for import: ${importTarget} -->`);
          continue;
        }

        if (fs.existsSync(targetPath)) {
          this.visitedImports.add(targetPath);
          try {
            const importedContent = fs.readFileSync(targetPath, 'utf-8');
            const nested = this.resolveImports(importedContent, path.dirname(targetPath));
            resolvedLines.push(`<!-- Imported from ${importTarget} -->\n${nested}`);
          } catch (err: any) {
            resolvedLines.push(`<!-- Failed to import ${importTarget}: ${err.message} -->`);
          }
        } else {
          resolvedLines.push(`<!-- Import target not found: ${importTarget} -->`);
        }
      } else {
        resolvedLines.push(line);
      }
    }

    return resolvedLines.join('\n');
  }

  /**
   * Auto-load memory files hierarchically:
   * 1. User level: ~/.antror/ANTROR.md
   * 2. Parent directories walking down to project root
   * 3. Project root: ./ANTROR.md or ./CLAUDE.md
   */
  public loadHierarchicalMemory(projectRoot: string = process.cwd()): MemoryFile[] {
    this.visitedImports.clear();
    const results: MemoryFile[] = [];

    // 1. User level memory
    const userMemoryPath = path.join(os.homedir(), '.antror', 'ANTROR.md');
    if (fs.existsSync(userMemoryPath)) {
      try {
        const raw = fs.readFileSync(userMemoryPath, 'utf-8');
        const resolved = this.resolveImports(raw, path.dirname(userMemoryPath));
        results.push({ filePath: userMemoryPath, scope: 'user', content: resolved });
      } catch {}
    }

    // 2. Project root memory (ANTROR.md or CLAUDE.md)
    const projectAntror = path.join(projectRoot, 'ANTROR.md');
    const projectClaude = path.join(projectRoot, 'CLAUDE.md');

    const projectMemoryPath = fs.existsSync(projectAntror)
      ? projectAntror
      : fs.existsSync(projectClaude)
      ? projectClaude
      : null;

    if (projectMemoryPath) {
      try {
        const raw = fs.readFileSync(projectMemoryPath, 'utf-8');
        const resolved = this.resolveImports(raw, path.dirname(projectMemoryPath));
        results.push({ filePath: projectMemoryPath, scope: 'project', content: resolved });
      } catch {}
    }

    return results;
  }

  /**
   * Save a note to the project memory file (# shortcut)
   */
  public appendNote(note: string, projectRoot: string = process.cwd()): string {
    const memoryPath = path.join(projectRoot, 'ANTROR.md');
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const entry = `\n- [${timestamp}] ${note.trim()}\n`;

    if (!fs.existsSync(memoryPath)) {
      const header = '# Project Memory (ANTROR.md)\n\nKey conventions, architectural decisions, and project notes.\n\n## Notes\n';
      fs.writeFileSync(memoryPath, header + entry, 'utf-8');
    } else {
      fs.appendFileSync(memoryPath, entry, 'utf-8');
    }

    return memoryPath;
  }
}
