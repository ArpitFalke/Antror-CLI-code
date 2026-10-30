export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ImageContentSource {
  type: 'base64';
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // Base64 data
}

export type ContentPart =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: ImageContentSource };

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface Message {
  role: Role;
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: any;
    [key: string]: any;
  }>;
  required?: string[];
  [key: string]: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type LLMStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'tool_call_end'; id: string; name: string; arguments: Record<string, any> }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'error'; error: Error }
  | { type: 'done'; finishReason: 'stop' | 'tool_calls' | 'length' | 'cancelled' | 'error' };

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  usage: TokenUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'cancelled' | 'error';
}
