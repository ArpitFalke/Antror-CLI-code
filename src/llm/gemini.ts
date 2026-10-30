import { LLMProvider } from './provider.js';
import {
  Message,
  ToolDefinition,
  LLMStreamEvent,
  TokenUsage,
  ContentPart
} from './types.js';

export function cleanGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(cleanGeminiSchema);

  const cleaned: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema' || k === 'additionalProperties') continue;
    if (k === 'type' && typeof v === 'string') {
      cleaned[k] = v.toUpperCase();
    } else {
      cleaned[k] = cleanGeminiSchema(v);
    }
  }
  return cleaned;
}

export function normalizeGeminiModel(model: string = 'gemini-3.5-flash'): string {
  const m = model.toLowerCase().trim();
  if (m.includes('3.5') && m.includes('lite')) {
    return 'gemini-3.5-flash-lite';
  }
  if (m.includes('3.5') || m.includes('3.5-flash') || m.includes('3.5 flash')) {
    return 'gemini-3.5-flash';
  }
  if (m.includes('3.8')) {
    return 'gemini-3.8-flash';
  }
  if (m.includes('3.7')) {
    return 'gemini-3.7-flash';
  }
  if (m.includes('3.1') || m.includes('3.1-pro')) {
    return 'gemini-3.1-pro-preview';
  }
  if (m.includes('pro-latest') || m === 'pro' || m === 'gemini-pro') {
    return 'gemini-3.1-pro-preview';
  }
  if (m.includes('flash-latest') || m === 'flash' || m === 'gemini-flash') {
    return 'gemini-3.5-flash';
  }
  // Deprecated/retired models automatically migrate to current active models
  if (m.includes('1.5-pro') || m.includes('2.5-pro')) {
    return 'gemini-3.1-pro-preview';
  }
  if (m.includes('1.5-flash') || m.includes('2.5-flash') || m.includes('2.0-flash')) {
    return 'gemini-3.5-flash';
  }
  return model || 'gemini-3.5-flash';
}

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class GeminiProvider implements LLMProvider {
  public readonly id = 'gemini';
  public readonly model: string;
  private readonly apiKey: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: GeminiConfig = {}) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.model = normalizeGeminiModel(config.model || 'gemini-3.5-flash');
    this.maxTokens = config.maxTokens || 8192;
    this.temperature = config.temperature ?? 0;
  }

  public calculateCost(usage: TokenUsage): number {
    // Gemini 1.5 Pro: $1.25 / 1M prompt (<128k), $5.00 / 1M completion
    return (usage.promptTokens / 1_000_000) * 1.25 + (usage.completionTokens / 1_000_000) * 5.0;
  }

  public async *streamChat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamEvent> {
    if (!this.apiKey) {
      throw new Error(
        'Google Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable or run `/login`.'
      );
    }

    // Separate system messages
    let systemInstruction: any = null;
    const contents: any[] = [];

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
      systemInstruction = {
        parts: [{ text: systemParts.join('\n\n') }]
      };
    }

    // Convert messages to Gemini format
    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool',
                response: {
                  content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                }
              }
            }
          ]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (typeof msg.content === 'string' && msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {
              parsedArgs = { raw: tc.function.arguments };
            }
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: parsedArgs
              }
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      } else if (msg.role === 'user') {
        const parts: any[] = [];
        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const p of msg.content as ContentPart[]) {
            if (p.type === 'text') {
              parts.push({ text: p.text });
            } else if (p.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: p.source.media_type,
                  data: p.source.data
                }
              });
            }
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'user', parts });
        }
      }
    }

    const payload: any = {
      contents,
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
      }
    };

    if (systemInstruction) payload.systemInstruction = systemInstruction;

    if (tools && tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: cleanGeminiSchema(t.parameters)
          }))
        }
      ];
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    if (!res.body) throw new Error('Response body is null');

    const usage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
          if (!dataStr) continue;

          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (data.usageMetadata) {
            usage.promptTokens = data.usageMetadata.promptTokenCount || usage.promptTokens;
            usage.completionTokens = data.usageMetadata.candidatesTokenCount || usage.completionTokens;
            usage.totalTokens = data.usageMetadata.totalTokenCount || (usage.promptTokens + usage.completionTokens);
            yield { type: 'usage', usage: { ...usage } };
          }

          const candidate = data.candidates?.[0];
          if (!candidate) continue;

          const parts = candidate.content?.parts || [];
          for (const part of parts) {
            if (part.thought || part.role === 'thought') {
              if (part.text) {
                yield { type: 'thought', text: part.text };
              }
            } else if (part.text) {
              yield { type: 'token', text: part.text };
            }
            if (part.functionCall) {
              const callId = part.functionCall.id || `call_gemini_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              yield {
                type: 'tool_call_start',
                id: callId,
                name: part.functionCall.name
              };
              yield {
                type: 'tool_call_end',
                id: callId,
                name: part.functionCall.name,
                arguments: part.functionCall.args || {}
              };
              finishReason = 'tool_calls';
            }
          }
        }
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
