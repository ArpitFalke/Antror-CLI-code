import { Message, ToolCall, TokenUsage } from '../llm/types.js';

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  arguments: Record<string, any>;
  output: string;
  isError?: boolean;
  diff?: string;
  durationMs: number;
}

export type AgentEvent =
  | { type: 'agent_start'; prompt: string; sessionResume?: boolean }
  | { type: 'thinking_start'; verb: string }
  | { type: 'token'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'tool_call_ready'; id: string; name: string; arguments: Record<string, any> }
  | { type: 'tool_execution_start'; id: string; name: string; arguments: Record<string, any> }
  | { type: 'tool_execution_end'; result: ToolExecutionResult }
  | { type: 'usage'; usage: TokenUsage; cost: number }
  | { type: 'agent_stop'; finishReason: string; totalTokens: number; totalCost: number; durationMs: number }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'status'; text: string };

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

export interface AgentContext {
  messages: Message[];
  totalUsage: TokenUsage;
  totalCost: number;
  filesRead: Set<string>; // Files read during session for safety check
  fileVersions: Map<string, number>; // mtime/hash tracking for stale edit detection
}
