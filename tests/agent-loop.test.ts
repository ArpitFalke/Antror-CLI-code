import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../src/agent/loop.js';
import { MockLLMProvider } from '../src/llm/mock.js';
import { AgentEvent } from '../src/agent/types.js';

describe('Milestone 1: LLM Streaming Client and Agent Loop', () => {
  it('streams text tokens and tracks usage/cost', async () => {
    const mock = new MockLLMProvider([
      {
        tokens: ['Hello', ' world! ', 'How can I assist you?'],
        finishReason: 'stop'
      }
    ]);

    const loop = new AgentLoop({
      provider: mock,
      systemPrompt: 'You are Antror Code.',
    });

    const events: AgentEvent[] = [];
    const result = await loop.run('Hi', (ev) => {
      events.push(ev);
    });

    expect(result).toBe('Hello world! How can I assist you?');
    expect(events.some(e => e.type === 'agent_start')).toBe(true);
    expect(events.some(e => e.type === 'thinking_start')).toBe(true);
    expect(events.filter(e => e.type === 'token').length).toBe(3);
    expect(events.some(e => e.type === 'usage')).toBe(true);
    expect(events.some(e => e.type === 'agent_stop')).toBe(true);
    expect(loop.context.totalUsage.totalTokens).toBeGreaterThan(0);
    expect(loop.context.totalCost).toBeGreaterThan(0);
  });

  it('handles multi-turn tool calling until model finishes', async () => {
    const mock = new MockLLMProvider([
      // Turn 1: Model decides to call Read tool
      {
        toolCalls: [
          {
            id: 'call_1',
            name: 'Read',
            arguments: { path: 'test.txt' }
          }
        ],
        finishReason: 'tool_calls'
      },
      // Turn 2: Model receives tool result and provides final response
      {
        tokens: ['I have read the file. Content is: sample file content.'],
        finishReason: 'stop'
      }
    ]);

    let executedTool = '';
    const loop = new AgentLoop({
      provider: mock,
      systemPrompt: 'You are Antror Code.',
      tools: {
        getDefinitions: () => [
          {
            name: 'Read',
            description: 'Read file contents',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' }
              },
              required: ['path']
            }
          }
        ],
        execute: async (name, args) => {
          executedTool = name;
          return { output: 'sample file content' };
        }
      }
    });

    const events: AgentEvent[] = [];
    const result = await loop.run('Read test.txt please', (ev) => {
      events.push(ev);
    });

    expect(executedTool).toBe('Read');
    expect(result).toBe('I have read the file. Content is: sample file content.');
    expect(events.some(e => e.type === 'tool_execution_start')).toBe(true);
    expect(events.some(e => e.type === 'tool_execution_end')).toBe(true);

    // Messages history should contain user -> assistant(tool_call) -> tool(result) -> assistant(final)
    expect(loop.context.messages.length).toBe(4);
    expect(loop.context.messages[0].role).toBe('user');
    expect(loop.context.messages[1].role).toBe('assistant');
    expect(loop.context.messages[2].role).toBe('tool');
    expect(loop.context.messages[3].role).toBe('assistant');
  });

  it('can be interrupted cleanly via interrupt()', async () => {
    const mock = new MockLLMProvider([
      {
        tokens: ['Start', 'ing long calculation...'],
        finishReason: 'stop'
      }
    ]);

    const loop = new AgentLoop({
      provider: mock,
      systemPrompt: 'You are Antror Code.',
    });

    const runPromise = loop.run('Do heavy task', () => {
      loop.interrupt();
    });

    await runPromise;
    expect(loop.context.messages.length).toBeGreaterThan(0);
  });
});
