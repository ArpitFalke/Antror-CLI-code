import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { AgentLoop } from '../agent/loop.js';
import { AntrorSettings, PermissionMode } from '../config/types.js';
import { saveUserSettings, saveProjectSettings } from '../config/settings.js';
import { setTheme, getCurrentThemeName, ThemeName } from '../config/theme.js';
import { PermissionEngine } from '../permissions/engine.js';
import { getGitContext } from '../memory/git.js';

export interface CommandContext {
  agentLoop: AgentLoop;
  settings: AntrorSettings;
  permissionEngine: PermissionEngine;
  onClear: () => void;
  onOutput: (text: string) => void;
  cwd?: string;
}

export type CommandHandler = (args: string, context: CommandContext) => Promise<boolean | string>;

export interface CommandDef {
  name: string;
  description: string;
  usage?: string;
  handler: CommandHandler;
}

export const BUILTIN_COMMANDS: Record<string, CommandDef> = {
  '/help': {
    name: '/help',
    description: 'Show available slash commands, keyboard shortcuts, and input prefixes',
    handler: async (_args, ctx) => {
      const text = `
# Antror Code — Command Reference

### Built-in Slash Commands
| Command | Description |
|---|---|
| **/help** | Show this help guide |
| **/clear** | Clear conversation history and reset screen |
| **/compact [notes]** | Summarize and compress context history |
| **/config** | View current configuration and file precedence |
| **/model [name]** | View or switch active LLM model |
| **/theme [theme]** | Switch color theme (warm-orange, dark, light, colorblind) |
| **/init** | Analyze project repository and generate ANTROR.md |
| **/memory** | View or edit project memory file |
| **/permissions** | View or change current permission mode |
| **/agents** | List and manage autonomous sub-agents |
| **/mcp** | List and configure Model Context Protocol servers |
| **/hooks** | Inspect lifecycle hooks (PreToolUse, PostToolUse) |
| **/review** | Generate a code review of uncommitted git changes |
| **/resume** | Resume a previous persistent session |
| **/cost** | Display token usage and cost breakdown |
| **/status** | Display system and environment status |
| **/doctor** | Diagnose environment, tools, and API connectivity |
| **/login** | Save LLM API key |
| **/logout** | Remove saved API keys |
| **/vim** | Toggle Vim keybindings in input |
| **/export [file]** | Export conversation transcript to Markdown |
| **/bug** | Report an issue or bug |
| **/exit** | Exit the Antror Code CLI |

### Input Prefixes
- **\`/\`** : Slash commands with tab auto-completion
- **\`@\`** : Mention files or folders with fuzzy matching (\`@src/index.ts\`)
- **\`!\`** : Run direct bash shell command (\`!git status\`, \`!npm test\`)
- **\`#\`** : Save quick note to project memory (\`# Note: Use Vitest for tests\`)

### Keyboard Shortcuts
- **Esc** : Interrupt active model generation
- **Esc Esc** : Rewind and edit previous user message
- **Shift+Tab** : Cycle permission modes (default → acceptEdits → plan)
- **Up / Down** : Navigate input history
- **Ctrl+R** : Expand collapsed tool output or search history
- **Ctrl+C** : Clear input line (press twice to exit)
- **Ctrl+D** : Exit Antror Code
`;
      ctx.onOutput(text);
      return true;
    },
  },

  '/clear': {
    name: '/clear',
    description: 'Clear the terminal output and reset conversation context',
    handler: async (_args, ctx) => {
      ctx.agentLoop.context.messages = [];
      ctx.onClear();
      ctx.onOutput('Conversation context cleared.');
      return true;
    },
  },

  '/model': {
    name: '/model',
    description: 'View or switch the active LLM model',
    usage: '/model [model_name]',
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        ctx.onOutput(`Active model: **${ctx.settings.model}** (provider: ${ctx.settings.provider})`);
        return true;
      }
      ctx.settings.model = trimmed;
      ctx.onOutput(`Model switched to: **${trimmed}**`);
      return true;
    },
  },

  '/theme': {
    name: '/theme',
    description: 'Switch color theme (warm-orange, dark, light, colorblind)',
    usage: '/theme [warm-orange|dark|light|colorblind]',
    handler: async (args, ctx) => {
      const target = args.trim().toLowerCase();
      const valid = ['warm-orange', 'dark', 'light', 'colorblind'];
      if (!target || !valid.includes(target)) {
        ctx.onOutput(`Current theme: **${getCurrentThemeName()}**\nAvailable themes: ${valid.join(', ')}`);
        return true;
      }
      setTheme(target as ThemeName);
      ctx.settings.theme = target as any;
      saveUserSettings({ theme: target as any });
      ctx.onOutput(`Theme changed to **${target}**.`);
      return true;
    },
  },

  '/permissions': {
    name: '/permissions',
    description: 'View or switch permission mode',
    usage: '/permissions [default|acceptEdits|plan|bypassPermissions]',
    handler: async (args, ctx) => {
      const mode = args.trim() as PermissionMode;
      const valid: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
      if (!mode || !valid.includes(mode)) {
        ctx.onOutput(`Current permission mode: **${ctx.permissionEngine.getMode()}**\nAvailable modes: ${valid.join(', ')}`);
        return true;
      }
      ctx.permissionEngine.setMode(mode);
      ctx.settings.permissionMode = mode;
      ctx.onOutput(`Permission mode set to: **${mode}**`);
      return true;
    },
  },

  '/cost': {
    name: '/cost',
    description: 'Display token usage and estimated cost',
    handler: async (_args, ctx) => {
      const usage = ctx.agentLoop.context.totalUsage;
      const cost = ctx.agentLoop.context.totalCost;
      const text = `
### Session Usage & Cost Breakdown
- **Prompt Tokens**: ${usage.promptTokens.toLocaleString()}
- **Completion Tokens**: ${usage.completionTokens.toLocaleString()}
- **Cache Read Tokens**: ${(usage.cacheReadTokens || 0).toLocaleString()}
- **Cache Write Tokens**: ${(usage.cacheWriteTokens || 0).toLocaleString()}
- **Total Tokens**: ${usage.totalTokens.toLocaleString()}
- **Estimated Total Cost**: **$${cost.toFixed(4)}**
`;
      ctx.onOutput(text);
      return true;
    },
  },

  '/init': {
    name: '/init',
    description: 'Analyze repository and initialize project memory file (ANTROR.md)',
    handler: async (_args, ctx) => {
      const cwd = ctx.cwd || process.cwd();
      const files = fs.readdirSync(cwd);

      const hasPkg = files.includes('package.json');
      const hasPy = files.some(f => f.endsWith('.py') || f === 'pyproject.toml' || f === 'requirements.txt');
      const hasRust = files.includes('Cargo.toml');
      const hasGo = files.includes('go.mod');

      let techStack = 'Unknown';
      if (hasPkg) techStack = 'TypeScript / Node.js';
      else if (hasPy) techStack = 'Python';
      else if (hasRust) techStack = 'Rust';
      else if (hasGo) techStack = 'Go';

      const git = getGitContext(cwd);

      const memoryContent = `# Project Architecture & Memory (ANTROR.md)

## Tech Stack
- Primary ecosystem: ${techStack}
- Git branch: ${git.branch || 'main'}

## Architectural Guidelines
- Prefer editing existing files with exact matches rather than rewriting.
- Keep components modular and strictly typed.
- Write unit tests for new modules.

## Commands
${hasPkg ? '- Build: `npm run build`\n- Test: `npm test`' : '- Build / Test: see project scripts'}

## Notes
- Initialized by \`/init\` on ${new Date().toLocaleDateString()}.
`;

      const memoryPath = path.join(cwd, 'ANTROR.md');
      fs.writeFileSync(memoryPath, memoryContent, 'utf-8');
      ctx.onOutput(`Initialized project memory at **${memoryPath}**.`);
      return true;
    },
  },

  '/memory': {
    name: '/memory',
    description: 'View or add to project memory file',
    usage: '/memory [optional note to add]',
    handler: async (args, ctx) => {
      const cwd = ctx.cwd || process.cwd();
      const memoryPath = path.join(cwd, 'ANTROR.md');

      if (args.trim()) {
        const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const entry = `\n- [${timestamp}] ${args.trim()}\n`;
        if (fs.existsSync(memoryPath)) {
          fs.appendFileSync(memoryPath, entry, 'utf-8');
        } else {
          fs.writeFileSync(memoryPath, `# Project Memory\n\n## Notes\n${entry}`, 'utf-8');
        }
        ctx.onOutput(`Saved note to **ANTROR.md**.`);
        return true;
      }

      if (fs.existsSync(memoryPath)) {
        const content = fs.readFileSync(memoryPath, 'utf-8');
        ctx.onOutput(`### Project Memory (ANTROR.md)\n\n${content}`);
      } else {
        ctx.onOutput('No ANTROR.md found. Run `/init` to generate one, or type `# your note` to save a note.');
      }
      return true;
    },
  },

  '/doctor': {
    name: '/doctor',
    description: 'Diagnose environment, Node version, tools, and network connectivity',
    handler: async (_args, ctx) => {
      const nodeVer = process.version;
      const platform = process.platform;
      const cwd = ctx.cwd || process.cwd();
      const git = getGitContext(cwd);

      let hasRipgrep = false;
      try {
        execSync('rg --version', { stdio: 'ignore' });
        hasRipgrep = true;
      } catch {}

      const checks = [
        `✓ Node.js Version: ${nodeVer} (>=20 required)`,
        `✓ Platform: ${platform} (${process.arch})`,
        `✓ LLM Provider: ${ctx.settings.provider} (${ctx.settings.apiKey ? 'API Key configured' : 'No API key'})`,
        `✓ Ripgrep available: ${hasRipgrep ? 'Yes (native rg)' : 'No (pure JS fallback active)'}`,
        `✓ Git repository: ${git.isGitRepo ? `Yes (branch: ${git.branch})` : 'No'}`,
        `✓ Active theme: ${getCurrentThemeName()}`,
      ];

      ctx.onOutput(`### Antror Doctor\n\n${checks.join('\n')}`);
      return true;
    },
  },

  '/status': {
    name: '/status',
    description: 'View current session status and resource usage',
    handler: async (_args, ctx) => {
      const mem = process.memoryUsage();
      const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const text = `
### Session Status
- **Model**: ${ctx.settings.model}
- **Provider**: ${ctx.settings.provider}
- **Permission Mode**: ${ctx.permissionEngine.getMode()}
- **Messages in Context**: ${ctx.agentLoop.context.messages.length}
- **Heap Memory Used**: ${heapMB} MB
- **CWD**: ${ctx.cwd || process.cwd()}
`;
      ctx.onOutput(text);
      return true;
    },
  },

  '/login': {
    name: '/login',
    description: 'Configure and save LLM API Key',
    usage: '/login [api_key]',
    handler: async (args, ctx) => {
      const key = args.trim();
      if (!key) {
        ctx.onOutput('Please provide your API key: `/login <api-key>`');
        return true;
      }
      ctx.settings.apiKey = key;
      saveUserSettings({ apiKey: key });
      ctx.onOutput('API key securely saved to user configuration.');
      return true;
    },
  },

  '/logout': {
    name: '/logout',
    description: 'Clear saved API key',
    handler: async (_args, ctx) => {
      ctx.settings.apiKey = undefined;
      saveUserSettings({ apiKey: undefined });
      ctx.onOutput('API key cleared from user configuration.');
      return true;
    },
  },

  '/vim': {
    name: '/vim',
    description: 'Toggle Vim keybindings in the input prompt',
    handler: async (_args, ctx) => {
      ctx.settings.vimMode = !ctx.settings.vimMode;
      saveUserSettings({ vimMode: ctx.settings.vimMode });
      ctx.onOutput(`Vim keybindings: **${ctx.settings.vimMode ? 'ENABLED' : 'DISABLED'}**`);
      return true;
    },
  },

  '/exit': {
    name: '/exit',
    description: 'Exit Antror Code CLI',
    handler: async () => {
      process.exit(0);
    },
  },
};
