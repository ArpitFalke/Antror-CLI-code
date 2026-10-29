import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { AgentLoop } from './agent/loop.js';
import { createLLMProvider } from './llm/factory.js';
import { ToolRegistry } from './tools/registry.js';
import { PermissionEngine } from './permissions/engine.js';
import { buildSystemPrompt } from './agent/system-prompt.js';
import { loadSettings, saveUserSettings } from './config/settings.js';
import { SessionStore } from './sessions/store.js';
import { CommandRegistry } from './commands/registry.js';
import { HookRunner } from './hooks/runner.js';
import { MCPManager } from './mcp/manager.js';
import { CLIOptions, OutputFormat } from './config/types.js';
import { AgentEvent, ToolExecutionResult } from './agent/types.js';
import { ensureProviderConfigured } from './config/login-prompt.js';

export async function runInteractive(options: CLIOptions): Promise<void> {
  const cwd = process.cwd();
  let settings = loadSettings(options, cwd);

  // Ensure provider and API key are configured interactively on first run
  settings = await ensureProviderConfigured(settings);

  const provider = createLLMProvider(settings);

  const toolRegistry = ToolRegistry.createDefault({ cwd });

  // Connect and register dynamic MCP servers
  const mcpManager = new MCPManager(cwd);
  await mcpManager.loadAllAndRegister(toolRegistry);

  const hookRunner = new HookRunner(settings.hooks, cwd);

  const permissionEngine = new PermissionEngine({
    mode: settings.permissionMode,
    allowRules: settings.allowRules,
    denyRules: settings.denyRules,
    askRules: settings.askRules,
    projectRoot: cwd,
    promptCallback: async (toolName, args, details) => {
      // Allow execution in interactive sessions
      return { choice: 'yes' };
    },
  });

  const sessionStore = new SessionStore(cwd);

  // Resume or continue previous session if requested
  let initialMessages: any[] = [];
  if (options.continue) {
    const sessions = SessionStore.listProjectSessions(cwd);
    if (sessions.length > 0) {
      const lastSessionStore = new SessionStore(cwd, sessions[0].id);
      initialMessages = lastSessionStore.loadMessages();
    }
  }

  const systemPrompt = buildSystemPrompt({
    cwd,
    permissionMode: settings.permissionMode,
    userSystemPromptAddendum: settings.systemPromptAddendum,
  });

  const agentLoop = new AgentLoop({
    provider,
    systemPrompt,
    initialMessages,
    tools: {
      getDefinitions: () => toolRegistry.getDefinitions(),
      execute: (name, args, ctx) => toolRegistry.execute(name, args, ctx),
    },
    permissionChecker: async (name, args) => {
      const check = await permissionEngine.check(name, args);
      return check.allowed;
    },
    hooks: {
      preToolUse: async (name, args) => {
        const res = await hookRunner.runPreToolUse(name, args);
        if (res.blocked) return false;
        return { modifiedArgs: res.modifiedArgs };
      },
      postToolUse: async (name, result) => {
        await hookRunner.runPostToolUse(name, result);
        if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
          const filePath = result.arguments?.path;
          if (filePath) sessionStore.saveCheckpoint(filePath);
        }
      },
    },
  });

  const commandRegistry = new CommandRegistry(cwd);

  await hookRunner.runSessionStart(sessionStore.getSessionId());

  // Render Ink UI App
  const instance = render(
    React.createElement(App, {
      agentLoop,
      toolRegistry,
      initialPrompt: options.prompt,
      version: '1.0.0',
      model: settings.model,
      cwd,
      permissionMode: settings.permissionMode,
      onPermissionChange: (mode) => {
        permissionEngine.setMode(mode);
        settings.permissionMode = mode;
      },
      onCommand: async (cmdStr) => {
        let outputMsg = '';
        const res = await commandRegistry.execute(cmdStr, {
          agentLoop,
          settings,
          permissionEngine,
          onClear: () => { instance.clear(); },
          onOutput: (msg) => { outputMsg = msg; },
          cwd,
        });

        if (outputMsg) {
          process.stdout.write('\n' + outputMsg + '\n\n');
        }

        if (res.promptToRun) {
          await agentLoop.run(res.promptToRun);
        }

        return res.handled;
      },
    })
  );

  await instance.waitUntilExit();
}

export async function runNonInteractive(prompt: string, options: CLIOptions): Promise<void> {
  const cwd = process.cwd();
  const settings = loadSettings(options, cwd);
  const provider = createLLMProvider(settings);
  const toolRegistry = ToolRegistry.createDefault({ cwd });
  const format: OutputFormat = options.outputFormat || 'text';

  const permissionEngine = new PermissionEngine({
    mode: options.permissionMode || 'bypassPermissions', // Non-interactive defaults to bypass if specified
    allowRules: settings.allowRules,
    denyRules: settings.denyRules,
    askRules: settings.askRules,
    projectRoot: cwd,
  });

  const systemPrompt = buildSystemPrompt({
    cwd,
    permissionMode: settings.permissionMode,
  });

  const toolCallsMade: Array<{ name: string; args: any; result?: any }> = [];

  const agentLoop = new AgentLoop({
    provider,
    systemPrompt,
    tools: {
      getDefinitions: () => toolRegistry.getDefinitions(),
      execute: async (name, args, ctx) => {
        const res = await toolRegistry.execute(name, args, ctx);
        toolCallsMade.push({ name, args, result: res });
        return res;
      },
    },
    permissionChecker: async (name, args) => {
      const check = await permissionEngine.check(name, args);
      return check.allowed;
    },
  });

  const startTime = Date.now();

  if (format === 'stream-json') {
    // Stream JSON-lines directly for IDEs / SDK wrappers
    const result = await agentLoop.run(prompt, async (event: AgentEvent) => {
      const line = JSON.stringify({
        event: event.type,
        timestamp: Date.now(),
        data: event,
      });
      process.stdout.write(line + '\n');
    });

    const summaryLine = JSON.stringify({
      event: 'complete',
      timestamp: Date.now(),
      data: {
        content: result,
        durationMs: Date.now() - startTime,
        usage: agentLoop.context.totalUsage,
        cost: agentLoop.context.totalCost,
      },
    });
    process.stdout.write(summaryLine + '\n');
    return;
  }

  const result = await agentLoop.run(prompt);

  if (format === 'json') {
    const output = {
      content: result,
      toolCalls: toolCallsMade,
      usage: agentLoop.context.totalUsage,
      cost: agentLoop.context.totalCost,
      durationMs: Date.now() - startTime,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    // Default format: text
    process.stdout.write(result + '\n');
  }
}
