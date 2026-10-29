import { LLMProvider } from './provider.js';
import {
  Message,
  ToolDefinition,
  LLMStreamEvent,
  TokenUsage
} from './types.js';

export interface OllamaConfig {
  baseURL?: string;
  model?: string;
}

export class OllamaProvider implements LLMProvider {
  public readonly id = 'ollama';
  public readonly model: string;
  private readonly baseURL: string;

  constructor(config: OllamaConfig = {}) {
    this.baseURL = (config.baseURL || process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model || 'llama3.1';
  }

  public calculateCost(_usage: TokenUsage): number {
    return 0; // Local models are free!
  }

  public async *streamChat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamEvent> {
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'tool' ? 'tool' : msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));

    const payload: any = {
      model: this.model,
      messages: formattedMessages,
      stream: true,
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

    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama API Error (${res.status}): ${errText}`);
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
          if (!trimmed) continue;

          let data: any;
          try {
            data = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (data.message?.content) {
            yield { type: 'token', text: data.message.content };
          }

          if (data.message?.tool_calls && Array.isArray(data.message.tool_calls)) {
            for (const tc of data.message.tool_calls) {
              const id = `call_ollama_${Date.now()}`;
              yield {
                type: 'tool_call_start',
                id,
                name: tc.function?.name || ''
              };
              yield {
                type: 'tool_call_end',
                id,
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || {}
              };
            }
          }

          if (data.done) {
            usage.promptTokens = data.prompt_eval_count || 0;
            usage.completionTokens = data.eval_count || 0;
            usage.totalTokens = usage.promptTokens + usage.completionTokens;
            yield { type: 'usage', usage: { ...usage } };
            yield {
              type: 'done',
              finishReason: data.message?.tool_calls?.length ? 'tool_calls' : 'stop'
            };
          }
        }
      }
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
