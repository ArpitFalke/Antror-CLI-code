import { LLMProvider } from './provider.js';
import {
  Message,
  ToolDefinition,
  LLMStreamEvent,
  TokenUsage,
  ContentPart
} from './types.js';
import { calculateCost } from './pricing.js';

export interface OpenAIConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class OpenAIProvider implements LLMProvider {
  public readonly id = 'openai';
  public readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: OpenAIConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
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
    if (!this.apiKey && !this.baseURL.includes('localhost') && !this.baseURL.includes('127.0.0.1')) {
      throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY environment variable or run `/login`.');
    }

    const formattedMessages = messages.map(msg => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
          ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
          ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
          ...(msg.name ? { name: msg.name } : {})
        };
      }

      // Convert content parts (text and base64 images)
      const parts = (msg.content as ContentPart[]).map(p => {
        if (p.type === 'text') {
          return { type: 'text', text: p.text };
        } else if (p.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${p.source.media_type};base64,${p.source.data}`
            }
          };
        }
        return p;
      });

      return {
        role: msg.role,
        content: parts,
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
        ...(msg.name ? { name: msg.name } : {})
      };
    });

    const payload: any = {
      model: this.model,
      messages: formattedMessages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true,
      stream_options: { include_usage: true }
    };

    if (tools && tools.length > 0) {
      payload.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (this.apiKey) {
      headers['authorization'] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API Error (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const usage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
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

          if (data.usage) {
            usage.promptTokens = data.usage.prompt_tokens || usage.promptTokens;
            usage.completionTokens = data.usage.completion_tokens || usage.completionTokens;
            usage.totalTokens = data.usage.total_tokens || (usage.promptTokens + usage.completionTokens);
            if (data.usage.prompt_tokens_details?.cached_tokens) {
              usage.cacheReadTokens = data.usage.prompt_tokens_details.cached_tokens;
            }
            yield { type: 'usage', usage: { ...usage } };
          }

          const choice = data.choices?.[0];
          if (!choice) continue;

          if (choice.finish_reason) {
            if (choice.finish_reason === 'tool_calls') finishReason = 'tool_calls';
            else if (choice.finish_reason === 'length') finishReason = 'length';
            else finishReason = 'stop';
          }

          const delta = choice.delta;
          if (!delta) continue;

          if (delta.reasoning_content) {
            yield { type: 'thought', text: delta.reasoning_content };
          } else if (delta.thought) {
            yield { type: 'thought', text: delta.thought };
          }

          if (delta.content) {
            yield { type: 'token', text: delta.content };
          }

          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let current = pendingToolCalls.get(idx);
              if (!current) {
                current = {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  name: tc.function?.name || '',
                  arguments: ''
                };
                pendingToolCalls.set(idx, current);
                yield {
                  type: 'tool_call_start',
                  id: current.id,
                  name: current.name
                };
              }

              if (tc.function?.arguments) {
                current.arguments += tc.function.arguments;
                yield {
                  type: 'tool_call_delta',
                  id: current.id,
                  delta: tc.function.arguments
                };
              }
            }
          }
        }
      }

      // Finish any pending tool calls
      for (const [, tc] of pendingToolCalls) {
        let parsed = {};
        try {
          parsed = JSON.parse(tc.arguments || '{}');
        } catch {
          parsed = { raw: tc.arguments };
        }
        yield {
          type: 'tool_call_end',
          id: tc.id,
          name: tc.name,
          arguments: parsed
        };
        finishReason = 'tool_calls';
      }

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
