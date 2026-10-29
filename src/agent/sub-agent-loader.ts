import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFrontmatter } from '../commands/custom.js';

export interface SubAgentDefinition {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  systemPrompt: string;
  sourcePath: string;
}

export class SubAgentLoader {
  public static loadAll(cwd: string = process.cwd()): Map<string, SubAgentDefinition> {
    const agents = new Map<string, SubAgentDefinition>();

    const dirs = [
      path.join(os.homedir(), '.antror', 'agents'),
      path.join(cwd, '.antror', 'agents'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;

          const filePath = path.join(dir, file);
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(raw);

            const name = frontmatter.name || path.basename(file, '.md');
            let tools: string[] = ['Read', 'Glob', 'Grep', 'LS'];
            if (frontmatter.tools) {
              try {
                // Parse either [Read, Grep] or JSON array
                const cleaned = frontmatter.tools.replace(/[\[\]]/g, '');
                tools = cleaned.split(',').map(t => t.trim()).filter(Boolean);
              } catch {}
            }

            agents.set(name, {
              name,
              description: frontmatter.description || `Sub-agent ${name}`,
              tools,
              model: frontmatter.model,
              systemPrompt: body.trim(),
              sourcePath: filePath,
            });
          } catch {}
        }
      } catch {}
    }

    return agents;
  }
}
