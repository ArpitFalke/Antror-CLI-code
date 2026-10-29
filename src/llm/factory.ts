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
        model: settings.model || 'gemini-1.5-pro',
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'anthropic':
      return new AnthropicProvider({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
        model: settings.model,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'openai':
      return new OpenAIProvider({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
        model: settings.model,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      });

    case 'ollama':
      return new OllamaProvider({
        baseURL: settings.baseURL,
        model: settings.model,
      });

    default:
      return new AnthropicProvider({
        apiKey: settings.apiKey,
        model: settings.model,
      });
  }
}

export { MockLLMProvider, GeminiProvider };
