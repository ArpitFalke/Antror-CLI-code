import { PermissionMode } from '../config/types.js';
import { parseRule, matchesRule, ParsedRule } from './rules.js';
import { isPathSandboxed, isDangerousBashCommand } from './sandbox.js';

export interface PermissionCheckResult {
  allowed: boolean;
  requiresPrompt: boolean;
  reason?: string;
}

export type InteractivePromptCallback = (
  toolName: string,
  args: Record<string, any>,
  details?: string
) => Promise<{ choice: 'yes' | 'yes_always' | 'no'; feedback?: string }>;

export class PermissionEngine {
  private mode: PermissionMode;
  private allowRules: ParsedRule[] = [];
  private denyRules: ParsedRule[] = [];
  private askRules: ParsedRule[] = [];
  private sessionApprovedCommands: Set<string> = new Set();
  private sessionApprovedFiles: Set<string> = new Set();
  private projectRoot: string;
  private promptCallback?: InteractivePromptCallback;

  constructor(options: {
    mode?: PermissionMode;
    allowRules?: string[];
    denyRules?: string[];
    askRules?: string[];
    projectRoot?: string;
    promptCallback?: InteractivePromptCallback;
  } = {}) {
    this.mode = options.mode || 'default';
    this.projectRoot = options.projectRoot || process.cwd();
    this.promptCallback = options.promptCallback;

    if (options.allowRules) {
      this.allowRules = options.allowRules.map(parseRule).filter((r): r is ParsedRule => r !== null);
    }
    if (options.denyRules) {
      this.denyRules = options.denyRules.map(parseRule).filter((r): r is ParsedRule => r !== null);
    }
    if (options.askRules) {
      this.askRules = options.askRules.map(parseRule).filter((r): r is ParsedRule => r !== null);
    }
  }

  public getMode(): PermissionMode {
    return this.mode;
  }

  public setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  public setPromptCallback(cb: InteractivePromptCallback): void {
    this.promptCallback = cb;
  }

  public async check(toolName: string, args: Record<string, any>): Promise<PermissionCheckResult> {
    // 1. Path Sandboxing Check
    if (args.path) {
      if (!isPathSandboxed(args.path, this.projectRoot)) {
        return {
          allowed: false,
          requiresPrompt: false,
          reason: `Access denied: path "${args.path}" escapes the project root sandbox (${this.projectRoot})`,
        };
      }
    }

    // 2. Critical Dangerous Command Detection (cannot be bypassed)
    if (toolName === 'Bash' && args.command) {
      const danger = isDangerousBashCommand(args.command);
      if (danger.dangerous) {
        return {
          allowed: false,
          requiresPrompt: false,
          reason: danger.reason,
        };
      }
    }

    // 3. Deny Rules check
    for (const rule of this.denyRules) {
      if (matchesRule(rule, toolName, args)) {
        return {
          allowed: false,
          requiresPrompt: false,
          reason: `Denied by configuration rule: ${rule.raw}`,
        };
      }
    }

    // 4. Session approved cache check
    if (toolName === 'Bash' && args.command && this.sessionApprovedCommands.has(args.command)) {
      return { allowed: true, requiresPrompt: false };
    }
    if (args.path && this.sessionApprovedFiles.has(args.path)) {
      return { allowed: true, requiresPrompt: false };
    }

    // 5. Ask Rules check (forces prompt)
    for (const rule of this.askRules) {
      if (matchesRule(rule, toolName, args)) {
        return this.handlePrompt(toolName, args, `Matched ask rule: ${rule.raw}`);
      }
    }

    // 6. Allow Rules check
    for (const rule of this.allowRules) {
      if (matchesRule(rule, toolName, args)) {
        return { allowed: true, requiresPrompt: false };
      }
    }

    // 7. Mode-specific behavior
    switch (this.mode) {
      case 'bypassPermissions':
        return { allowed: true, requiresPrompt: false };

      case 'plan':
        // In plan mode, read-only tools are allowed; all mutation tools are strictly forbidden!
        if (['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'ExitPlanMode'].includes(toolName)) {
          return { allowed: true, requiresPrompt: false };
        }
        return {
          allowed: false,
          requiresPrompt: false,
          reason: `Plan mode is active (read-only). File edits and terminal commands are disabled until the plan is approved.`,
        };

      case 'acceptEdits':
        // File mutations are auto-approved
        if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
          return { allowed: true, requiresPrompt: false };
        }
        if (['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'ExitPlanMode', 'Task'].includes(toolName)) {
          return { allowed: true, requiresPrompt: false };
        }
        // Bash still requires approval in acceptEdits mode
        return this.handlePrompt(toolName, args, 'Bash command requires confirmation');

      case 'default':
      default:
        // Read-only tools are auto-approved
        if (['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'ExitPlanMode', 'Task'].includes(toolName)) {
          return { allowed: true, requiresPrompt: false };
        }
        // Mutations and Bash require approval prompt
        return this.handlePrompt(toolName, args, 'Action requires user permission');
    }
  }

  private async handlePrompt(
    toolName: string,
    args: Record<string, any>,
    details: string
  ): Promise<PermissionCheckResult> {
    if (!this.promptCallback) {
      // Non-interactive fallback: deny risky action unless in acceptEdits/bypass
      return {
        allowed: false,
        requiresPrompt: true,
        reason: 'Action requires approval but no interactive prompt is available',
      };
    }

    const res = await this.promptCallback(toolName, args, details);

    if (res.choice === 'yes_always') {
      if (toolName === 'Bash' && args.command) {
        this.sessionApprovedCommands.add(args.command);
      } else if (args.path) {
        this.sessionApprovedFiles.add(args.path);
      }
      return { allowed: true, requiresPrompt: false };
    }

    if (res.choice === 'yes') {
      return { allowed: true, requiresPrompt: false };
    }

    return {
      allowed: false,
      requiresPrompt: false,
      reason: res.feedback || 'Permission denied by user',
    };
  }
}
