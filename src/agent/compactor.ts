import { Message } from '../llm/types.js';

export interface CompactionResult {
  compacted: boolean;
  savedTokensEstimate: number;
  newMessages: Message[];
  summaryText: string;
}

export function estimateMessageTokens(messages: Message[]): number {
  let charCount = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') {
      charCount += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if ('text' in p) charCount += p.text.length;
      }
    }
    if (m.tool_calls) {
      charCount += JSON.stringify(m.tool_calls).length;
    }
  }
  // Standard rule of thumb: ~4 characters per token in English/code
  return Math.ceil(charCount / 4);
}

export class HistoryCompactor {
  public static compact(
    messages: Message[],
    customInstructions?: string,
    preserveRecentCount: number = 4
  ): CompactionResult {
    // If messages are too few, no compaction needed
    if (messages.length <= preserveRecentCount + 2) {
      return {
        compacted: false,
        savedTokensEstimate: 0,
        newMessages: messages,
        summaryText: 'History is already small; no compaction required.',
      };
    }

    const beforeTokens = estimateMessageTokens(messages);

    // Split into messages to compact and messages to keep
    const toCompact = messages.slice(0, messages.length - preserveRecentCount);
    const toKeep = messages.slice(messages.length - preserveRecentCount);

    // Extract key actions, files mentioned, and achievements
    const filesMentioned = new Set<string>();
    const actionsTaken: string[] = [];

    for (const m of toCompact) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

      // Search for file paths like src/foo.ts
      const fileMatches = text.match(/\b(?:[a-zA-Z0-9_\-\.\/]+\.(?:ts|tsx|js|jsx|json|md|html|css|py|rs|go))\b/g);
      if (fileMatches) {
        fileMatches.forEach(f => filesMentioned.add(f));
      }

      if (m.role === 'tool' && m.name) {
        actionsTaken.push(`Used ${m.name}`);
      } else if (m.role === 'user') {
        const shortUser = text.slice(0, 60).replace(/\n/g, ' ');
        actionsTaken.push(`User asked: "${shortUser}..."`);
      }
    }

    const instructionLine = customInstructions ? `\nUser Compact Instructions: ${customInstructions}` : '';
    const filesList = Array.from(filesMentioned).slice(0, 15).join(', ');

    const summary = `[Compact Conversation Summary:
- Context: Early turns compacted to free context window.${instructionLine}
- Files Referenced/Modified: ${filesList || 'Various project files'}
- Key Activities: ${actionsTaken.slice(0, 8).join('; ') || 'Code exploration and modifications'}
- Status: Recent conversational context and active tasks preserved.]`;

    const summaryMessage: Message = {
      role: 'assistant',
      content: summary,
    };

    const newMessages: Message[] = [summaryMessage, ...toKeep];
    const afterTokens = estimateMessageTokens(newMessages);
    const saved = Math.max(0, beforeTokens - afterTokens);

    return {
      compacted: true,
      savedTokensEstimate: saved,
      newMessages,
      summaryText: summary,
    };
  }

  public static shouldAutoCompact(messages: Message[], thresholdTokens: number = 120000): boolean {
    const currentEstimate = estimateMessageTokens(messages);
    return currentEstimate >= thresholdTokens;
  }
}
