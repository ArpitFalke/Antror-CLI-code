export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export type OutputFormat = 'text' | 'json' | 'stream-json';

export type LLMProviderType =
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'deepseek'
  | 'openrouter'
  | 'mistral'
  | 'ollama'
  | 'custom';

export interface AntrorSettings {
  provider: LLMProviderType;
  model: string;
  apiKey?: string;
  baseURL?: string;
  permissionMode: PermissionMode;
  theme: 'dark' | 'light' | 'colorblind' | 'warm-orange';
  maxTokens?: number;
  temperature?: number;
  systemPromptAddendum?: string;
  hooks?: {
    PreToolUse?: string;
    PostToolUse?: string;
    UserPromptSubmit?: string;
    Stop?: string;
    SessionStart?: string;
  };
  mcpServers?: Record<string, MCPServerConfig>;
  allowRules?: string[];
  denyRules?: string[];
  askRules?: string[];
  vimMode?: boolean;
  telemetry?: boolean;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: 'stdio' | 'sse' | 'http';
}

export interface CLIOptions {
  prompt?: string;
  print?: boolean;
  outputFormat?: OutputFormat;
  continue?: boolean;
  resume?: boolean;
  model?: string;
  provider?: LLMProviderType;
  permissionMode?: PermissionMode;
  theme?: string;
  maxTokens?: number;
}
