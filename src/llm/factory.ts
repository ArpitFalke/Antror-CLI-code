import { LLMProvider } from './provider.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';
import { GeminiProvider } from './gemini.js';
import { MockLLMProvider } from './mock.js';
import { AntrorSettings } from '../config/types.js';

export function createLLMProvider(settings: AntrorSettings): LLMProvider {
  switch (settings.provider) {
    case 'gemini':
      return new GeminiProvider({
        apiKey: settings.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: settings.model || 'gemini-3.5-flash',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'anthropic':
      return new AnthropicProvider({
        apiKey: settings.apiKey || process.env.ANTHROPIC_API_KEY,
        baseURL: settings.baseURL,
        model: settings.model || 'claude-3-5-sonnet-20241022',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'openai':
      return new OpenAIProvider({
        apiKey: settings.apiKey || process.env.OPENAI_API_KEY,
        baseURL: settings.baseURL || 'https://api.openai.com/v1',
        model: settings.model || 'gpt-4o',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'groq':
      return new OpenAIProvider({
        apiKey: settings.apiKey || process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
        model: settings.model || 'llama-3.3-70b-versatile',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'deepseek':
      return new OpenAIProvider({
        apiKey: settings.apiKey || process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
        model: settings.model || 'deepseek-chat',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'openrouter':
      return new OpenAIProvider({
        apiKey: settings.apiKey || process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        model: settings.model || 'anthropic/claude-3.5-sonnet',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'mistral':
      return new OpenAIProvider({
        apiKey: settings.apiKey || process.env.MISTRAL_API_KEY,
        baseURL: 'https://api.mistral.ai/v1',
        model: settings.model || 'mistral-large-latest',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'ollama':
      return new OllamaProvider({
        baseURL: settings.baseURL || 'http://localhost:11434',
        model: settings.model || 'llama3.1',
      });

    case 'custom':
      return new OpenAIProvider({
        apiKey: settings.apiKey || 'custom-key',
        baseURL: settings.baseURL || 'http://localhost:1234/v1',
        model: settings.model || 'default-model',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    default:
      return new AnthropicProvider({
        apiKey: settings.apiKey,
        model: settings.model,
      });
  }
}

/**
 * Lightweight connection test to verify credentials and model connectivity.
 */
export async function testConnection(settings: AntrorSettings): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const provider = createLLMProvider(settings);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const stream = provider.streamChat([
      { role: 'user', content: 'Reply with the word "OK"' }
    ], [], controller.signal);

    let received = '';
    for await (const evt of stream) {
      if (evt.type === 'token') {
        received += evt.text;
        if (received.length >= 2) break;
      }
    }
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    return {
      success: true,
      message: `Connection successful (${received.trim() || 'OK'})`,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      message: err.message || String(err),
      latencyMs,
    };
  }
}

export { MockLLMProvider, GeminiProvider };
