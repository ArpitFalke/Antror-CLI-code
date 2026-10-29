import { describe, it, expect } from 'vitest';
import { PermissionEngine } from '../src/permissions/engine.js';
import { parseRule, matchesRule } from '../src/permissions/rules.js';
import { isPathSandboxed, isDangerousBashCommand } from '../src/permissions/sandbox.js';

describe('Milestone 4: Permission System', () => {
  it('rule parser converts pattern to regex and matches accurately', () => {
    const rule1 = parseRule('Bash(npm test:*)');
    expect(rule1).not.toBeNull();
    expect(matchesRule(rule1!, 'Bash', { command: 'npm test:unit' })).toBe(true);
    expect(matchesRule(rule1!, 'Bash', { command: 'rm -rf /' })).toBe(false);

    const rule2 = parseRule('Read(src/**)');
    expect(rule2).not.toBeNull();
    expect(matchesRule(rule2!, 'Read', { path: 'src/utils/math.ts' })).toBe(true);
    expect(matchesRule(rule2!, 'Read', { path: '.env' })).toBe(false);
  });

  it('rejects destructive commands automatically', () => {
    const danger = isDangerousBashCommand('rm -rf /');
    expect(danger.dangerous).toBe(true);

    const safe = isDangerousBashCommand('npm run build');
    expect(safe.dangerous).toBe(false);
  });

  it('rejects path escaping the project sandbox', () => {
    expect(isPathSandboxed('../../etc/passwd', process.cwd())).toBe(false);
    expect(isPathSandboxed('src/index.ts', process.cwd())).toBe(true);
  });

  it('plan mode allows read-only tools and rejects all mutations', async () => {
    const engine = new PermissionEngine({ mode: 'plan' });

    const readCheck = await engine.check('Read', { path: 'src/index.ts' });
    expect(readCheck.allowed).toBe(true);

    const grepCheck = await engine.check('Grep', { pattern: 'test' });
    expect(grepCheck.allowed).toBe(true);

    const writeCheck = await engine.check('Write', { path: 'src/index.ts', content: '' });
    expect(writeCheck.allowed).toBe(false);
    expect(writeCheck.reason).toContain('Plan mode is active (read-only)');

    const bashCheck = await engine.check('Bash', { command: 'npm install' });
    expect(bashCheck.allowed).toBe(false);
  });

  it('acceptEdits mode auto-approves file writes but prompts for bash', async () => {
    let promptCalled = false;
    const engine = new PermissionEngine({
      mode: 'acceptEdits',
      promptCallback: async () => {
        promptCalled = true;
        return { choice: 'yes' };
      },
    });

    const writeCheck = await engine.check('Write', { path: 'src/index.ts', content: 'test' });
    expect(writeCheck.allowed).toBe(true);
    expect(promptCalled).toBe(false);

    const bashCheck = await engine.check('Bash', { command: 'npm test' });
    expect(bashCheck.allowed).toBe(true);
    expect(promptCalled).toBe(true);
  });

  it('deny rules take precedence over allow rules', async () => {
    const engine = new PermissionEngine({
      mode: 'bypassPermissions',
      denyRules: ['Read(./.env*)'],
      allowRules: ['Read(*)'],
    });

    const check = await engine.check('Read', { path: './.env.local' });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Denied by configuration rule');
  });

  it('session approval memory remembers approved commands', async () => {
    let promptCount = 0;
    const engine = new PermissionEngine({
      mode: 'default',
      promptCallback: async () => {
        promptCount++;
        return { choice: 'yes_always' };
      },
    });

    const firstCheck = await engine.check('Bash', { command: 'git status' });
    expect(firstCheck.allowed).toBe(true);
    expect(promptCount).toBe(1);

    // Second check should not prompt again!
    const secondCheck = await engine.check('Bash', { command: 'git status' });
    expect(secondCheck.allowed).toBe(true);
    expect(promptCount).toBe(1);
  });
});
