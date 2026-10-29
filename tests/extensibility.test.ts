import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { HookRunner } from '../src/hooks/runner.js';
import { SubAgentLoader } from '../src/agent/sub-agent-loader.js';
import { SkillLoader } from '../src/skills/loader.js';
import { MCPManager } from '../src/mcp/manager.js';

describe('Milestone 7: Extensibility (Hooks, MCP, Sub-agents, Skills)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antror-ext-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('HookRunner executes PreToolUse command and handles pass/block', async () => {
    // A hook command that succeeds
    const passRunner = new HookRunner({
      PreToolUse: 'echo "OK"',
    }, tmpDir);

    const passRes = await passRunner.runPreToolUse('Read', { path: 'index.ts' });
    expect(passRes.blocked).toBe(false);

    // A hook command that exits with code 1 (blocking)
    const blockRunner = new HookRunner({
      PreToolUse: process.platform === 'win32' ? 'exit 1' : 'exit 1',
    }, tmpDir);

    const blockRes = await blockRunner.runPreToolUse('Bash', { command: 'drop database' });
    expect(blockRes.blocked).toBe(true);
    expect(blockRes.reason).toContain('failed with exit code');
  });

  it('SubAgentLoader loads agent definitions from .antror/agents/*.md', () => {
    const agentsDir = path.join(tmpDir, '.antror', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const agentFile = path.join(agentsDir, 'researcher.md');
    fs.writeFileSync(
      agentFile,
      `---
name: researcher
description: Deep codebase researcher
tools: [Read, Glob, Grep]
model: claude-3-5-sonnet-20241022
---
You are a meticulous researcher. Explore the codebase and report findings.
`,
      'utf-8'
    );

    const loaded = SubAgentLoader.loadAll(tmpDir);
    expect(loaded.has('researcher')).toBe(true);

    const agent = loaded.get('researcher')!;
    expect(agent.name).toBe('researcher');
    expect(agent.description).toBe('Deep codebase researcher');
    expect(agent.tools).toEqual(['Read', 'Glob', 'Grep']);
    expect(agent.systemPrompt).toContain('You are a meticulous researcher');
  });

  it('SkillLoader loads skills from .antror/skills/<name>/SKILL.md', () => {
    const skillDir = path.join(tmpDir, '.antror', 'skills', 'web-deploy');
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: web-deploy
description: Instructions for deploying to production
---
## Deployment steps
1. Run tests
2. Build bundle
3. Deploy to server
`,
      'utf-8'
    );

    const loaded = SkillLoader.loadAll(tmpDir);
    expect(loaded.has('web-deploy')).toBe(true);

    const skill = loaded.get('web-deploy')!;
    expect(skill.name).toBe('web-deploy');
    expect(skill.instructions).toContain('## Deployment steps');
  });

  it('MCPManager manages server configurations in project settings', () => {
    MCPManager.addServer('github', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      transport: 'stdio',
    }, tmpDir);

    const servers = MCPManager.listServers(tmpDir);
    expect(servers['github']).toBeDefined();
    expect(servers['github'].command).toBe('npx');

    const removed = MCPManager.removeServer('github', tmpDir);
    expect(removed).toBe(true);
    expect(MCPManager.listServers(tmpDir)['github']).toBeUndefined();
  });
});
