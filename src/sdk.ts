import { AgentLoop } from './agent/loop.js';
import { createLLMProvider } from './llm/factory.js';
import { ToolRegistry } from './tools/registry.js';
import { PermissionEngine } from './permissions/engine.js';
import { buildSystemPrompt } from './agent/system-prompt.js';
import { loadSettings } from './config/settings.js';
import { SessionStore } from './sessions/store.js';
import { AgentEvent, ToolExecutionResult } from './agent/types.js';
import { AntrorSettings, PermissionMode } from './config/types.js';

export interface AntrorClientOptions {
  cwd?: string;
  model?: string;
  provider?: 'anthropic' | 'openai' | 'ollama';
  apiKey?: string;
  baseURL?: string;
  permissionMode?: PermissionMode;
  systemPromptAddendum?: string;
}

export interface ChatCallbacks {
  onToken?: (text: string) => void;
  onThought?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, any>) => void;
  onToolResult?: (result: ToolExecutionResult) => void;
  onEvent?: (event: AgentEvent) => void;
}

export class AntrorClient {
  public readonly cwd: string;
  public readonly settings: AntrorSettings;
  public readonly toolRegistry: ToolRegistry;
  public readonly permissionEngine: PermissionEngine;
  public readonly agentLoop: AgentLoop;
  public readonly sessionStore: SessionStore;

  constructor(options: AntrorClientOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.settings = loadSettings({
      model: options.model,
      provider: options.provider,
      permissionMode: options.permissionMode,
    }, this.cwd);

    if (options.apiKey) this.settings.apiKey = options.apiKey;
    if (options.baseURL) this.settings.baseURL = options.baseURL;

    const provider = createLLMProvider(this.settings);
    this.toolRegistry = ToolRegistry.createDefault({ cwd: this.cwd });

    this.permissionEngine = new PermissionEngine({
      mode: this.settings.permissionMode,
      allowRules: this.settings.allowRules,
      denyRules: this.settings.denyRules,
      askRules: this.settings.askRules,
      projectRoot: this.cwd,
    });

    const systemPrompt = buildSystemPrompt({
      cwd: this.cwd,
      permissionMode: this.settings.permissionMode,
      userSystemPromptAddendum: options.systemPromptAddendum,
    });

    this.sessionStore = new SessionStore(this.cwd);

    this.agentLoop = new AgentLoop({
      provider,
      systemPrompt,
      tools: {
        getDefinitions: () => this.toolRegistry.getDefinitions(),
        execute: (name, args, ctx) => this.toolRegistry.execute(name, args, ctx),
      },
      permissionChecker: async (name, args) => {
        const check = await this.permissionEngine.check(name, args);
        return check.allowed;
      },
    });
  }

  public async chat(prompt: string, callbacks: ChatCallbacks = {}): Promise<string> {
    this.sessionStore.appendMessage({ role: 'user', content: prompt });

    const result = await this.agentLoop.run(prompt, async (event: AgentEvent) => {
      if (callbacks.onEvent) callbacks.onEvent(event);

      if (event.type === 'thought' && callbacks.onThought) {
        callbacks.onThought(event.text);
      } else if (event.type === 'token' && callbacks.onToken) {
        callbacks.onToken(event.text);
      } else if (event.type === 'tool_execution_start' && callbacks.onToolCall) {
        callbacks.onToolCall(event.name, event.arguments);
      } else if (event.type === 'tool_execution_end' && callbacks.onToolResult) {
        callbacks.onToolResult(event.result);
      }
    });

    this.sessionStore.appendMessage({ role: 'assistant', content: result });
    this.sessionStore.saveMetadata({
      totalTokens: this.agentLoop.context.totalUsage.totalTokens,
      totalCost: this.agentLoop.context.totalCost,
      messageCount: this.agentLoop.context.messages.length,
    });

    return result;
  }

  public interrupt(): void {
    this.agentLoop.interrupt();
  }

  public getMessages() {
    return this.agentLoop.context.messages;
  }
}
