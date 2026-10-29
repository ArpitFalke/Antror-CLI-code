import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AntrorSettings, CLIOptions, PermissionMode, LLMProviderType } from './types.js';

export const DEFAULT_SETTINGS: AntrorSettings = {
  provider: 'gemini',
  model: 'gemini-1.5-flash',
  permissionMode: 'acceptEdits',
  theme: 'warm-orange',
  maxTokens: 8192,
  temperature: 0,
  vimMode: false,
  telemetry: false,
  allowRules: [],
  denyRules: [],
  askRules: [],
  hooks: {},
  mcpServers: {},
};

export function getUserConfigDir(): string {
  const home = os.homedir();
  return path.join(home, '.antror');
}

export function getProjectConfigDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.antror');
}

function loadJsonFile<T>(filePath: string): Partial<T> | null {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // Ignore JSON parse errors in config gracefully
  }
  return null;
}

export function loadSettings(cliOpts: CLIOptions = {}, cwd: string = process.cwd()): AntrorSettings {
  // Precedence:
  // 1. Enterprise settings
  // 2. CLI flags
  // 3. Local project (.antror/settings.json)
  // 4. Shared project (.antror/config.json)
  // 5. User settings (~/.antror/settings.json)
  // 6. Defaults

  const enterprisePath = process.platform === 'win32'
    ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'Antror', 'settings.json')
    : '/etc/antror/settings.json';

  const userPath = path.join(getUserConfigDir(), 'settings.json');
  const sharedProjectPath = path.join(getProjectConfigDir(cwd), 'config.json');
  const localProjectPath = path.join(getProjectConfigDir(cwd), 'settings.json');

  const enterpriseConfig = loadJsonFile<AntrorSettings>(enterprisePath) || {};
  const userConfig = loadJsonFile<AntrorSettings>(userPath) || {};
  const sharedProjectConfig = loadJsonFile<AntrorSettings>(sharedProjectPath) || {};
  const localProjectConfig = loadJsonFile<AntrorSettings>(localProjectPath) || {};

  // Resolve env vars
  const envProvider = (process.env.ANTROR_PROVIDER as LLMProviderType) ||
    (process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : undefined);
  const envModel = process.env.ANTROR_MODEL;
  const envApiKey = process.env.ANTROR_API_KEY ||
    (envProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);
  const envBaseURL = process.env.ANTROR_BASE_URL ||
    (envProvider === 'openai' ? process.env.OPENAI_BASE_URL : undefined);

  // Merge according to precedence
  const merged: AntrorSettings = {
    ...DEFAULT_SETTINGS,
    ...userConfig,
    ...sharedProjectConfig,
    ...localProjectConfig,
  };

  // Environment variables override files
  if (envProvider) merged.provider = envProvider;
  if (envModel) merged.model = envModel;
  if (envApiKey) merged.apiKey = envApiKey;
  if (envBaseURL) merged.baseURL = envBaseURL;

  // CLI options override env and files
  if (cliOpts.provider) merged.provider = cliOpts.provider;
  if (cliOpts.model) merged.model = cliOpts.model;
  if (cliOpts.permissionMode) merged.permissionMode = cliOpts.permissionMode;
  if (cliOpts.theme && (['dark', 'light', 'colorblind', 'warm-orange'] as const).includes(cliOpts.theme as any)) {
    merged.theme = cliOpts.theme as any;
  }
  if (cliOpts.maxTokens) merged.maxTokens = cliOpts.maxTokens;

  // Enterprise overrides everything if present
  const finalSettings = {
    ...merged,
    ...enterpriseConfig,
  };

  return finalSettings;
}

export function saveUserSettings(settings: Partial<AntrorSettings>): void {
  const dir = getUserConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, 'settings.json');
  const existing = loadJsonFile<AntrorSettings>(filePath) || {};
  const updated = { ...existing, ...settings };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
}

export function saveProjectSettings(settings: Partial<AntrorSettings>, cwd: string = process.cwd()): void {
  const dir = getProjectConfigDir(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, 'settings.json');
  const existing = loadJsonFile<AntrorSettings>(filePath) || {};
  const updated = { ...existing, ...settings };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
}
