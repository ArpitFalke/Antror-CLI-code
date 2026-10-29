import { LLMProvider } from '../llm/provider.js';
import { Message, ToolDefinition, TokenUsage, ToolCall } from '../llm/types.js';
import { AgentEvent, AgentEventHandler, AgentContext, ToolExecutionResult } from './types.js';

export interface AgentLoopOptions {
  provider: LLMProvider;
  systemPrompt: string;
  tools?: {
    getDefinitions(): ToolDefinition[];
    execute(name: string, args: Record<string, any>, context: AgentContext): Promise<{ output: string; isError?: boolean; diff?: string }>;
  };
  permissionChecker?: (name: string, args: Record<string, any>) => Promise<boolean>;
  hooks?: {
    preToolUse?: (name: string, args: Record<string, any>) => Promise<boolean | { modifiedArgs?: Record<string, any> }>;
    postToolUse?: (name: string, result: ToolExecutionResult) => Promise<void>;
  };
  maxRounds?: number;
  initialMessages?: Message[];
}

const WHIMSICAL_VERBS = [
  'Thinking',
  'Pondering',
  'Analyzing',
  'Synthesizing',
  'Investigating',
  'Architecting',
  'Reasoning',
  'Deciphering',
  'Brainstorming',
  'Reflecting',
  'Evaluating',
];

export class AgentLoop {
  private provider: LLMProvider;
  private systemPrompt: string;
  private tools?: AgentLoopOptions['tools'];
  private permissionChecker?: AgentLoopOptions['permissionChecker'];
  private hooks?: AgentLoopOptions['hooks'];
  private maxRounds: number;
  public context: AgentContext;
  private abortController: AbortController | null = null;

  constructor(options: AgentLoopOptions) {
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.permissionChecker = options.permissionChecker;
    this.hooks = options.hooks;
    this.maxRounds = options.maxRounds || 50;

    this.context = {
      messages: options.initialMessages ? [...options.initialMessages] : [],
      totalUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      totalCost: 0,
      filesRead: new Set<string>(),
      fileVersions: new Map<string, number>(),
    };
  }

  public setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  public setSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }

  public interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private getRandomVerb(): string {
    return WHIMSICAL_VERBS[Math.floor(Math.random() * WHIMSICAL_VERBS.length)];
  }

  public async run(
    userInput: string | Message,
    onEvent: AgentEventHandler = () => {}
  ): Promise<string> {
    const startTime = Date.now();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Append user input
    if (typeof userInput === 'string') {
      this.context.messages.push({ role: 'user', content: userInput });
      await onEvent({ type: 'agent_start', prompt: userInput });
    } else {
      this.context.messages.push(userInput);
      await onEvent({
        type: 'agent_start',
        prompt: typeof userInput.content === 'string' ? userInput.content : '[Multimodal input]'
      });
    }

    let rounds = 0;
    let finalAssistantText = '';

    try {
      while (rounds < this.maxRounds) {
        if (signal.aborted) {
          await onEvent({
            type: 'agent_stop',
            finishReason: 'cancelled',
            totalTokens: this.context.totalUsage.totalTokens,
            totalCost: this.context.totalCost,
            durationMs: Date.now() - startTime
          });
          return finalAssistantText;
        }

        rounds++;
        await onEvent({ type: 'thinking_start', verb: this.getRandomVerb() });

        // Prepare full message list with system prompt
        const messagesToSend: Message[] = [
          { role: 'system', content: this.systemPrompt },
          ...this.context.messages
        ];

        const toolDefinitions = this.tools?.getDefinitions() || [];

        // Stream chat with exponential backoff on retries
        let streamResult = await this.streamWithRetry(messagesToSend, toolDefinitions, signal, onEvent);

        if (streamResult.aborted) {
          await onEvent({
            type: 'agent_stop',
            finishReason: 'cancelled',
            totalTokens: this.context.totalUsage.totalTokens,
            totalCost: this.context.totalCost,
            durationMs: Date.now() - startTime
          });
          return finalAssistantText;
        }

        finalAssistantText = streamResult.content;

        // If assistant had text content or tool calls, append to message history
        const assistantMessage: Message = {
          role: 'assistant',
          content: streamResult.content,
        };

        if (streamResult.toolCalls.length > 0) {
          assistantMessage.tool_calls = streamResult.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }));
        }

        this.context.messages.push(assistantMessage);

        // If no tool calls, model is done!
        if (streamResult.toolCalls.length === 0) {
          break;
        }

        // Execute tool calls
        for (const tc of streamResult.toolCalls) {
          if (signal.aborted) break;

          await onEvent({
            type: 'tool_execution_start',
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments
          });

          // Check permissions
          let allowed = true;
          if (this.permissionChecker) {
            allowed = await this.permissionChecker(tc.name, tc.arguments);
          }

          if (!allowed) {
            const rejectedResult: ToolExecutionResult = {
              toolCallId: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              output: `Action rejected: permission denied by user for ${tc.name}`,
              isError: true,
              durationMs: 0
            };
            await onEvent({ type: 'tool_execution_end', result: rejectedResult });
            this.context.messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: rejectedResult.output
            });
            continue;
          }

          // PreToolUse Hook
          let toolArgs = tc.arguments;
          if (this.hooks?.preToolUse) {
            const hookRes = await this.hooks.preToolUse(tc.name, toolArgs);
            if (hookRes === false) {
              const blockedResult: ToolExecutionResult = {
                toolCallId: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                output: `PreToolUse hook blocked execution of ${tc.name}`,
                isError: true,
                durationMs: 0
              };
              await onEvent({ type: 'tool_execution_end', result: blockedResult });
              this.context.messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: blockedResult.output
              });
              continue;
            }
            if (typeof hookRes === 'object' && hookRes.modifiedArgs) {
              toolArgs = hookRes.modifiedArgs;
            }
          }

          // Execute tool
          const toolStart = Date.now();
          let execOutput = '';
          let isError = false;
          let diff: string | undefined;

          try {
            if (this.tools) {
              const res = await this.tools.execute(tc.name, toolArgs, this.context);
              execOutput = res.output;
              isError = Boolean(res.isError);
              diff = res.diff;
            } else {
              execOutput = `Tool ${tc.name} is not registered`;
              isError = true;
            }
          } catch (err: any) {
            execOutput = `Tool execution error: ${err.message || String(err)}`;
            isError = true;
          }

          const execResult: ToolExecutionResult = {
            toolCallId: tc.id,
            name: tc.name,
            arguments: toolArgs,
            output: execOutput,
            isError,
            diff,
            durationMs: Date.now() - toolStart
          };

          await onEvent({ type: 'tool_execution_end', result: execResult });

          // PostToolUse Hook
          if (this.hooks?.postToolUse) {
            await this.hooks.postToolUse(tc.name, execResult);
          }

          // Append tool result message
          this.context.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: execOutput
          });
        }
      }

      await onEvent({
        type: 'agent_stop',
        finishReason: 'stop',
        totalTokens: this.context.totalUsage.totalTokens,
        totalCost: this.context.totalCost,
        durationMs: Date.now() - startTime
      });
      return finalAssistantText;
    } catch (err: any) {
      await onEvent({ type: 'error', message: err.message || String(err), fatal: true });
      return `Error: ${err.message || String(err)}`;
    } finally {
      this.abortController = null;
    }
  }

  private async streamWithRetry(
    messages: Message[],
    tools: ToolDefinition[],
    signal: AbortSignal,
    onEvent: AgentEventHandler
  ): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }>; aborted?: boolean }> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        let content = '';
        const toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

        const stream = this.provider.streamChat(messages, tools, signal);

        for await (const event of stream) {
          if (signal.aborted) {
            return { content, toolCalls, aborted: true };
          }

          if (event.type === 'token') {
            content += event.text;
            await onEvent({ type: 'token', text: event.text });
          } else if (event.type === 'tool_call_start') {
            await onEvent({ type: 'tool_call_start', id: event.id, name: event.name });
          } else if (event.type === 'tool_call_delta') {
            await onEvent({ type: 'tool_call_delta', id: event.id, delta: event.delta });
          } else if (event.type === 'tool_call_end') {
            toolCalls.push({
              id: event.id,
              name: event.name,
              arguments: event.arguments
            });
            await onEvent({
              type: 'tool_call_ready',
              id: event.id,
              name: event.name,
              arguments: event.arguments
            });
          } else if (event.type === 'usage') {
            this.context.totalUsage.promptTokens += event.usage.promptTokens;
            this.context.totalUsage.completionTokens += event.usage.completionTokens;
            this.context.totalUsage.totalTokens =
              this.context.totalUsage.promptTokens + this.context.totalUsage.completionTokens;
            if (event.usage.cacheReadTokens) {
              this.context.totalUsage.cacheReadTokens = (this.context.totalUsage.cacheReadTokens || 0) + event.usage.cacheReadTokens;
            }
            if (event.usage.cacheWriteTokens) {
              this.context.totalUsage.cacheWriteTokens = (this.context.totalUsage.cacheWriteTokens || 0) + event.usage.cacheWriteTokens;
            }

            const stepCost = this.provider.calculateCost(event.usage);
            this.context.totalCost += stepCost;

            await onEvent({
              type: 'usage',
              usage: { ...this.context.totalUsage },
              cost: this.context.totalCost
            });
          } else if (event.type === 'error') {
            throw event.error;
          }
        }

        return { content, toolCalls };
      } catch (err: any) {
        if (signal.aborted) {
          return { content: '', toolCalls: [], aborted: true };
        }

        // Retry on rate-limits (429) or temporary server errors (500, 502, 503)
        const isRetryable =
          err.message?.includes('429') ||
          err.message?.includes('500') ||
          err.message?.includes('502') ||
          err.message?.includes('503') ||
          err.message?.includes('ECONNRESET') ||
          err.message?.includes('fetch failed');

        if (isRetryable && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await onEvent({
            type: 'status',
            text: `Rate limited or temporary error. Retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`
          });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  }
}
