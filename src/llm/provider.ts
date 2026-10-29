import { Message, ToolDefinition, LLMStreamEvent, TokenUsage } from './types.js';

export interface LLMProvider {
  readonly id: string;
  readonly model: string;

  streamChat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamEvent>;

  calculateCost(usage: TokenUsage): number;
}
