import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFrontmatter } from '../commands/custom.js';

export interface SkillDefinition {
  name: string;
  description: string;
  instructions: string;
  folderPath: string;
}

export class SkillLoader {
  public static loadAll(cwd: string = process.cwd()): Map<string, SkillDefinition> {
    const skills = new Map<string, SkillDefinition>();

    const dirs = [
      path.join(os.homedir(), '.antror', 'skills'),
      path.join(cwd, '.antror', 'skills'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const subdirs = fs.readdirSync(dir, { withFileTypes: true });
        for (const sd of subdirs) {
          if (!sd.isDirectory()) continue;

          const skillMd = path.join(dir, sd.name, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            try {
              const raw = fs.readFileSync(skillMd, 'utf-8');
              const { frontmatter, body } = parseFrontmatter(raw);

              skills.set(sd.name, {
                name: frontmatter.name || sd.name,
                description: frontmatter.description || `Skill ${sd.name}`,
                instructions: body.trim(),
                folderPath: path.join(dir, sd.name),
              });
            } catch {}
          }
        }
      } catch {}
    }

    return skills;
  }
}
