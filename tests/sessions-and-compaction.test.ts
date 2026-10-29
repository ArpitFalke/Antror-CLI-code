import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionStore } from '../src/sessions/store.js';
import { HistoryCompactor, estimateMessageTokens } from '../src/agent/compactor.js';
import { Message } from '../src/llm/types.js';

describe('Milestone 6: Sessions and Compaction', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antror-session-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('SessionStore persists messages as JSONL and saves metadata', () => {
    const store = new SessionStore(tmpDir, 'test_session_1');

    store.appendMessage({ role: 'user', content: 'First message' });
    store.appendMessage({ role: 'assistant', content: 'Second message' });
    store.saveMetadata({
      messageCount: 2,
      totalTokens: 120,
      totalCost: 0.001,
    });

    const messages = store.loadMessages();
    expect(messages.length).toBe(2);
    expect(messages[0].content).toBe('First message');
    expect(messages[1].content).toBe('Second message');

    const meta = store.loadMetadata();
    expect(meta).not.toBeNull();
    expect(meta?.messageCount).toBe(2);
    expect(meta?.totalTokens).toBe(120);
  });

  it('HistoryCompactor condenses long history into structured summary', () => {
    const largeToolContent = 'const code = "test";\n'.repeat(100); // ~2200 chars
    const messages: Message[] = [
      { role: 'user', content: 'Read src/server.ts and tell me what ports it uses.' },
      { role: 'assistant', content: 'Reading server.ts now.' },
      { role: 'tool', name: 'Read', tool_call_id: 'c1', content: largeToolContent },
      { role: 'assistant', content: 'The server uses port 3000.' },
      { role: 'user', content: 'Now create src/client.ts.' },
      { role: 'assistant', content: 'Creating client.ts now.' },
      { role: 'tool', name: 'Write', tool_call_id: 'c2', content: largeToolContent },
      { role: 'assistant', content: 'Client created.' },
      { role: 'user', content: 'What is the current status?' },
    ];

    const tokensBefore = estimateMessageTokens(messages);
    expect(tokensBefore).toBeGreaterThan(0);

    const result = HistoryCompactor.compact(messages, 'Focus on ports', 3);

    expect(result.compacted).toBe(true);
    expect(result.savedTokensEstimate).toBeGreaterThan(0);
    expect(result.newMessages.length).toBe(4); // 1 summary + 3 recent kept
    expect(result.newMessages[0].role).toBe('assistant');
    expect(typeof result.newMessages[0].content).toBe('string');
    expect(result.newMessages[0].content).toContain('Compact Conversation Summary');
    expect(result.newMessages[0].content).toContain('Focus on ports');
    expect(result.newMessages[3].content).toBe('What is the current status?');
  });
});
