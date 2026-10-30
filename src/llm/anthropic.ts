import { LLMProvider } from './provider.js';
import {
  Message,
  ToolDefinition,
  LLMStreamEvent,
  TokenUsage,
  ContentPart
} from './types.js';
import { calculateCost } from './pricing.js';

export interface AnthropicConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicProvider implements LLMProvider {
  public readonly id = 'anthropic';
  public readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: AnthropicConfig = {}) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.baseURL = (config.baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 8192;
    this.temperature = config.temperature ?? 0;
  }

  public calculateCost(usage: TokenUsage): number {
    return calculateCost(this.model, usage);
  }

  public async *streamChat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamEvent> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is missing. Set ANTHROPIC_API_KEY environment variable or run `/login`.'
      );
    }

    // Separate system messages from conversational messages
    let systemPrompt: any = '';
    const conversationMessages: any[] = [];

    const systemParts: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        if (typeof msg.content === 'string') {
          systemParts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          systemParts.push(msg.content.map(p => ('text' in p ? p.text : '')).join('\n'));
        }
      }
    }

    if (systemParts.length > 0) {
      // Add prompt caching to system prompt
      systemPrompt = [
        {
          type: 'text',
          text: systemParts.join('\n\n'),
          cache_control: { type: 'ephemeral' }
        }
      ];
    }

    // Convert conversation messages to Anthropic format
    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'tool') {
        conversationMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id || '',
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            }
          ]
        });
      } else if (msg.role === 'assistant') {
        const contentBlocks: any[] = [];
        if (typeof msg.content === 'string' && msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text') {
              contentBlocks.push({ type: 'text', text: part.text });
            }
          }
        }

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {
              parsedArgs = { raw: tc.function.arguments };
            }
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: parsedArgs
            });
          }
        }

        if (contentBlocks.length > 0) {
          conversationMessages.push({
            role: 'assistant',
            content: contentBlocks
          });
        }
      } else if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          conversationMessages.push({
            role: 'user',
            content: msg.content
          });
        } else if (Array.isArray(msg.content)) {
          const blocks = msg.content.map((part: ContentPart) => {
            if (part.type === 'text') {
              return {
                type: 'text',
                text: part.text,
                ...(part.cache_control ? { cache_control: part.cache_control } : {})
              };
            } else if (part.type === 'image') {
              return {
                type: 'image',
                source: part.source
              };
            }
            return part;
          });
          conversationMessages.push({
            role: 'user',
            content: blocks
          });
        }
      }
    }

    // Convert tool definitions to Anthropic format
    let anthropicTools: any[] | undefined = undefined;
    if (tools && tools.length > 0) {
      anthropicTools = tools.map((t, idx) => {
        const toolObj: any = {
          name: t.name,
          description: t.description,
          input_schema: t.parameters
        };
        // Add cache control to the last tool definition for prompt caching
        if (idx === tools.length - 1) {
          toolObj.cache_control = { type: 'ephemeral' };
        }
        return toolObj;
      });
    }

    const payload: any = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: conversationMessages,
      stream: true
    };

    if (systemPrompt) payload.system = systemPrompt;
    if (anthropicTools && anthropicTools.length > 0) payload.tools = anthropicTools;

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API Error (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const usage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let currentToolId = '';
    let currentToolName = '';
    let currentToolArgs = '';
    let finishReason: 'stop' | 'tool_calls' | 'length' | 'cancelled' | 'error' = 'stop';

    try {
      while (true) {
        if (signal?.aborted) {
          yield { type: 'done', finishReason: 'cancelled' };
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (data.type === 'message_start' && data.message?.usage) {
            usage.promptTokens = data.message.usage.input_tokens || 0;
            usage.cacheReadTokens = data.message.usage.cache_read_input_tokens || 0;
            usage.cacheWriteTokens = data.message.usage.cache_creation_input_tokens || 0;
            yield { type: 'usage', usage: { ...usage } };
          } else if (data.type === 'content_block_start') {
            if (data.content_block?.type === 'tool_use') {
              currentToolId = data.content_block.id;
              currentToolName = data.content_block.name;
              currentToolArgs = '';
              yield {
                type: 'tool_call_start',
                id: currentToolId,
                name: currentToolName
              };
            }
          } else if (data.type === 'content_block_delta') {
            if (data.delta?.type === 'text_delta') {
              yield { type: 'token', text: data.delta.text };
            } else if (data.delta?.type === 'thinking_delta') {
              yield { type: 'thought', text: data.delta.thinking };
            } else if (data.delta?.type === 'input_json_delta') {
              currentToolArgs += data.delta.partial_json;
              yield {
                type: 'tool_call_delta',
                id: currentToolId,
                delta: data.delta.partial_json
              };
            }
          } else if (data.type === 'content_block_stop') {
            if (currentToolId) {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(currentToolArgs || '{}');
              } catch {
                parsedArgs = { raw: currentToolArgs };
              }
              yield {
                type: 'tool_call_end',
                id: currentToolId,
                name: currentToolName,
                arguments: parsedArgs
              };
              currentToolId = '';
              currentToolName = '';
              currentToolArgs = '';
              finishReason = 'tool_calls';
            }
          } else if (data.type === 'message_delta') {
            if (data.usage?.output_tokens) {
              usage.completionTokens = data.usage.output_tokens;
              usage.totalTokens = usage.promptTokens + usage.completionTokens;
              yield { type: 'usage', usage: { ...usage } };
            }
            if (data.delta?.stop_reason) {
              if (data.delta.stop_reason === 'tool_use') finishReason = 'tool_calls';
              else if (data.delta.stop_reason === 'max_tokens') finishReason = 'length';
              else finishReason = 'stop';
            }
          }
        }
      }

      usage.totalTokens = usage.promptTokens + usage.completionTokens;
      yield { type: 'usage', usage: { ...usage } };
      yield { type: 'done', finishReason };
    } catch (err: any) {
      if (signal?.aborted) {
        yield { type: 'done', finishReason: 'cancelled' };
      } else {
        yield { type: 'error', error: err };
        yield { type: 'done', finishReason: 'error' };
      }
    } finally {
      reader.releaseLock();
    }
  }
}
