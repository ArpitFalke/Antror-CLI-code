import { TokenUsage } from './types.js';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Models
  'claude-3-5-sonnet-20241022': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-3-5-sonnet-20240620': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-3-5-haiku-20241022': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1.0,
  },
  'claude-3-opus-20240229': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  // OpenAI Models
  'gpt-4o': {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    cacheReadPerMillion: 1.25,
  },
  'gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheReadPerMillion: 0.075,
  },
  'o1-mini': {
    inputPerMillion: 3.0,
    outputPerMillion: 12.0,
  },
  'o1-preview': {
    inputPerMillion: 15.0,
    outputPerMillion: 60.0,
  },
  // Google Gemini Models
  'gemini-3.5-flash': {
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
  },
  'gemini-3.5-flash-lite': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
  'gemini-3.8-flash': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
  },
  'gemini-3.1-pro-preview': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  },
  'gemini-flash-latest': {
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
  },
  'gemini-pro-latest': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  },
};

export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model] || {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  };

  const inputCost = (usage.promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost = pricing.cacheReadPerMillion && usage.cacheReadTokens
    ? (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion
    : 0;
  const cacheWriteCost = pricing.cacheWritePerMillion && usage.cacheWriteTokens
    ? (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion
    : 0;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
