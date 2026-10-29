import { LLMProvider } from './provider.js';
import {
  Message,
  ToolDefinition,
  LLMStreamEvent,
  TokenUsage
} from './types.js';

export interface MockScriptStep {
  tokens?: string[];
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  finishReason?: 'stop' | 'tool_calls' | 'length';
}

export class MockLLMProvider implements LLMProvider {
  public readonly id = 'mock';
  public readonly model = 'mock-model-v1';
  private stepIndex = 0;
  private script: MockScriptStep[] = [];

  constructor(script: MockScriptStep[] = []) {
    this.script = script;
  }

  public setScript(script: MockScriptStep[]): void {
    this.script = script;
    this.stepIndex = 0;
  }

  public calculateCost(usage: TokenUsage): number {
    return (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  }

  public async *streamChat(
    _messages: Message[],
    _tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamEvent> {
    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'cancelled' };
      return;
    }

    const step = this.script[this.stepIndex] || {
      tokens: ['Hello! I am ready to help you.'],
      finishReason: 'stop'
    };
    this.stepIndex++;

    yield {
      type: 'usage',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cacheReadTokens: 20
      }
    };

    if (step.tokens) {
      for (const tok of step.tokens) {
        if (signal?.aborted) {
          yield { type: 'done', finishReason: 'cancelled' };
          return;
        }
        yield { type: 'token', text: tok };
      }
    }

    if (step.toolCalls) {
      for (const tc of step.toolCalls) {
        if (signal?.aborted) {
          yield { type: 'done', finishReason: 'cancelled' };
          return;
        }
        yield { type: 'tool_call_start', id: tc.id, name: tc.name };
        yield { type: 'tool_call_delta', id: tc.id, delta: JSON.stringify(tc.arguments) };
        yield { type: 'tool_call_end', id: tc.id, name: tc.name, arguments: tc.arguments };
      }
    }

    yield {
      type: 'done',
      finishReason: step.finishReason || (step.toolCalls?.length ? 'tool_calls' : 'stop')
    };
  }
}
