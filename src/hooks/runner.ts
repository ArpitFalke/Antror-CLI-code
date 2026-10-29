import { execSync } from 'node:child_process';
import { AntrorSettings } from '../config/types.js';
import { ToolExecutionResult } from '../agent/types.js';

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SessionStart';

export interface HookResult {
  blocked: boolean;
  reason?: string;
  modifiedArgs?: Record<string, any>;
  output?: string;
}

export class HookRunner {
  private hooks: NonNullable<AntrorSettings['hooks']>;
  private cwd: string;

  constructor(hooks: AntrorSettings['hooks'] = {}, cwd: string = process.cwd()) {
    this.hooks = hooks || {};
    this.cwd = cwd;
  }

  public async runPreToolUse(toolName: string, toolArgs: Record<string, any>): Promise<HookResult> {
    const hookCmd = this.hooks.PreToolUse;
    if (!hookCmd) return { blocked: false };

    return this.executeHook('PreToolUse', hookCmd, {
      toolName,
      arguments: toolArgs,
    });
  }

  public async runPostToolUse(toolName: string, result: ToolExecutionResult): Promise<void> {
    const hookCmd = this.hooks.PostToolUse;
    if (!hookCmd) return;

    await this.executeHook('PostToolUse', hookCmd, {
      toolName,
      result,
    });
  }

  public async runUserPromptSubmit(prompt: string): Promise<HookResult> {
    const hookCmd = this.hooks.UserPromptSubmit;
    if (!hookCmd) return { blocked: false };

    return this.executeHook('UserPromptSubmit', hookCmd, { prompt });
  }

  public async runSessionStart(sessionId: string): Promise<void> {
    const hookCmd = this.hooks.SessionStart;
    if (!hookCmd) return;

    await this.executeHook('SessionStart', hookCmd, { sessionId });
  }

  public async runStop(): Promise<void> {
    const hookCmd = this.hooks.Stop;
    if (!hookCmd) return;

    await this.executeHook('Stop', hookCmd, {});
  }

  private executeHook(
    eventName: HookEventName,
    command: string,
    payload: Record<string, any>
  ): HookResult {
    const isWin = process.platform === 'win32';
    const jsonStr = JSON.stringify(payload);

    try {
      const env = {
        ...process.env,
        ANTROR_HOOK_EVENT: eventName,
        ANTROR_HOOK_PAYLOAD: jsonStr,
      };

      const stdout = execSync(isWin ? `powershell.exe -NoProfile -Command "${command}"` : command, {
        cwd: this.cwd,
        env,
        input: jsonStr,
        encoding: 'utf-8',
        timeout: 15000,
      });

      // If hook outputs JSON with modifiedArgs or block instruction
      if (stdout.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.block === true) {
            return { blocked: true, reason: parsed.reason || 'Blocked by hook' };
          }
          if (parsed.modifiedArgs) {
            return { blocked: false, modifiedArgs: parsed.modifiedArgs, output: stdout };
          }
        } catch {}
      }

      return { blocked: false, output: stdout };
    } catch (err: any) {
      // Non-zero exit code blocks execution
      return {
        blocked: true,
        reason: `Hook ${eventName} failed with exit code ${err.status}: ${err.stderr || err.message}`,
      };
    }
  }
}
