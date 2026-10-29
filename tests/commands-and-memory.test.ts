import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MemoryLoader } from '../src/memory/loader.js';
import { parseFrontmatter, interpolateCommand, CustomCommandLoader } from '../src/commands/custom.js';
import { CommandRegistry } from '../src/commands/registry.js';
import { AgentLoop } from '../src/agent/loop.js';
import { MockLLMProvider } from '../src/llm/mock.js';
import { DEFAULT_SETTINGS } from '../src/config/settings.js';
import { PermissionEngine } from '../src/permissions/engine.js';

describe('Milestone 5: Slash Commands and Memory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antror-memory-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('resolves @import directives and prevents infinite import loops', () => {
    const fileA = path.join(tmpDir, 'A.md');
    const fileB = path.join(tmpDir, 'B.md');

    fs.writeFileSync(fileA, 'Content of A\n@import B.md\nEnd A');
    fs.writeFileSync(fileB, 'Content of B\n@import A.md\nEnd B');

    const loader = new MemoryLoader();
    const resolved = loader.resolveImports(fs.readFileSync(fileA, 'utf-8'), tmpDir);

    expect(resolved).toContain('Content of A');
    expect(resolved).toContain('Content of B');
    expect(resolved).toContain('Cycle detected');
  });

  it('appends note to ANTROR.md on # prefix', () => {
    const loader = new MemoryLoader();
    const savedPath = loader.appendNote('Important guideline: use strict mode', tmpDir);

    expect(fs.existsSync(savedPath)).toBe(true);
    const content = fs.readFileSync(savedPath, 'utf-8');
    expect(content).toContain('Important guideline: use strict mode');
  });

  it('parses frontmatter and interpolates $ARGUMENTS and @file in custom commands', () => {
    const testFile = path.join(tmpDir, 'data.txt');
    fs.writeFileSync(testFile, 'AlphaBetaGamma');

    const rawTemplate = `---
description: Test custom command
---
Inspect argument: $ARGUMENTS
File content: @${path.basename(testFile)}
`;

    const { frontmatter, body } = parseFrontmatter(rawTemplate);
    expect(frontmatter.description).toBe('Test custom command');

    const interpolated = interpolateCommand(body, 'my-arg-123', tmpDir);
    expect(interpolated).toContain('Inspect argument: my-arg-123');
    expect(interpolated).toContain('AlphaBetaGamma');
  });

  it('executes built-in slash commands via CommandRegistry', async () => {
    const registry = new CommandRegistry(tmpDir);
    const outputs: string[] = [];

    const mockProvider = new MockLLMProvider();
    const agentLoop = new AgentLoop({ provider: mockProvider, systemPrompt: '' });
    const settings = { ...DEFAULT_SETTINGS };
    const permissionEngine = new PermissionEngine();

    const res = await registry.execute('/help', {
      agentLoop,
      settings,
      permissionEngine,
      onClear: () => {},
      onOutput: (msg) => { outputs.push(msg); },
      cwd: tmpDir,
    });

    expect(res.handled).toBe(true);
    expect(outputs[0]).toContain('Antror Code — Command Reference');
  });
});
