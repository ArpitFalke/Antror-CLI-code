import readline from 'node:readline/promises';
import { AntrorSettings, LLMProviderType } from './types.js';
import { saveUserSettings } from './settings.js';
import { testConnection } from '../llm/factory.js';

export async function promptProviderSetup(currentSettings: AntrorSettings): Promise<AntrorSettings> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.clear();
    console.log(`\x1b[38;2;255;107;53m
  █████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██████╗ 
 ██╔══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██╔══██╗
 ███████║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██████╔╝
 ██╔══██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██╔══██╗
 ██║  ██║██║ ╚████║   ██║   ██║  ██║╚██████╔╝██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝\x1b[0m

  \x1b[1mAntror Code — AI Model Configuration\x1b[0m
  Current: \x1b[36m${currentSettings.provider}\x1b[0m (\x1b[33m${currentSettings.model}\x1b[0m)

  Select AI Provider:
  \x1b[32m1.\x1b[0m \x1b[1mGoogle Gemini\x1b[0m (Gemini 3.5 Flash, 3.8 Flash, 3.1 Pro)
  \x1b[33m2.\x1b[0m \x1b[1mAnthropic Claude\x1b[0m (Claude 3.5 Sonnet, 3.7 Sonnet, Haiku)
  \x1b[36m3.\x1b[0m \x1b[1mOpenAI\x1b[0m (GPT-4o, o1, o3-mini)
  \x1b[35m4.\x1b[0m \x1b[1mGroq\x1b[0m (Llama 3.3 70B — Ultra-Fast 500+ tok/s)
  \x1b[34m5.\x1b[0m \x1b[1mDeepSeek\x1b[0m (DeepSeek V3, DeepSeek R1 Reasoning)
  \x1b[38;5;208m6.\x1b[0m \x1b[1mOpenRouter\x1b[0m (Access to 200+ models)
  \x1b[38;5;141m7.\x1b[0m \x1b[1mMistral AI\x1b[0m (Mistral Large, Codestral)
  \x1b[38;5;244m8.\x1b[0m \x1b[1mLocal Ollama\x1b[0m (100% Free, runs offline)
  \x1b[90m9.\x1b[0m \x1b[1mCustom OpenAI Endpoint\x1b[0m (LM Studio, vLLM, text-gen-ui)
`);

    const choice = (await rl.question('Select a provider [1-9] (default: 1): ')).trim() || '1';

    let selectedProvider: LLMProviderType = 'gemini';
    let defaultModel = 'gemini-3.5-flash';
    let baseURL: string | undefined = undefined;

    if (choice === '1') {
      selectedProvider = 'gemini';
      console.log('\nChoose Google Gemini model:');
      console.log('  1. gemini-3.5-flash       (Recommended: Ultra fast & smart)');
      console.log('  2. gemini-3.5-flash-lite  (Fastest & low cost)');
      console.log('  3. gemini-3.8-flash       (Next-gen speed)');
      console.log('  4. gemini-3.1-pro-preview (Deep reasoning)');
      console.log('  5. Custom Model Name      (Type or paste your own)');
      const mChoice = (await rl.question('Select model [1-5] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'gemini-3.5-flash-lite';
      else if (mChoice === '3') defaultModel = 'gemini-3.8-flash';
      else if (mChoice === '4') defaultModel = 'gemini-3.1-pro-preview';
      else if (mChoice === '5') {
        defaultModel = (await rl.question('Enter custom model name: ')).trim() || 'gemini-3.5-flash';
      } else defaultModel = 'gemini-3.5-flash';

    } else if (choice === '2') {
      selectedProvider = 'anthropic';
      console.log('\nChoose Anthropic Claude model:');
      console.log('  1. claude-3-5-sonnet-20241022 (Recommended)');
      console.log('  2. claude-3-5-haiku-20241022  (Fast & lightweight)');
      console.log('  3. claude-3-opus-20240229     (Deep reasoning)');
      console.log('  4. Custom Model Name          (Type or paste your own)');
      const mChoice = (await rl.question('Select model [1-4] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'claude-3-5-haiku-20241022';
      else if (mChoice === '3') defaultModel = 'claude-3-opus-20240229';
      else if (mChoice === '4') {
        defaultModel = (await rl.question('Enter custom model name: ')).trim() || 'claude-3-5-sonnet-20241022';
      } else defaultModel = 'claude-3-5-sonnet-20241022';

    } else if (choice === '3') {
      selectedProvider = 'openai';
      console.log('\nChoose OpenAI model:');
      console.log('  1. gpt-4o             (Recommended)');
      console.log('  2. gpt-4o-mini        (Fast & economical)');
      console.log('  3. o1-mini            (Reasoning)');
      console.log('  4. Custom Model Name  (Type or paste your own)');
      const mChoice = (await rl.question('Select model [1-4] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'gpt-4o-mini';
      else if (mChoice === '3') defaultModel = 'o1-mini';
      else if (mChoice === '4') {
        defaultModel = (await rl.question('Enter custom model name: ')).trim() || 'gpt-4o';
      } else defaultModel = 'gpt-4o';

    } else if (choice === '4') {
      selectedProvider = 'groq';
      console.log('\nChoose Groq model:');
      console.log('  1. llama-3.3-70b-versatile  (Recommended)');
      console.log('  2. llama-3.1-8b-instant     (Ultra-fast)');
      console.log('  3. mixtral-8x7b-32768');
      console.log('  4. Custom Model Name        (Type or paste your own)');
      const mChoice = (await rl.question('Select model [1-4] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'llama-3.1-8b-instant';
      else if (mChoice === '3') defaultModel = 'mixtral-8x7b-32768';
      else if (mChoice === '4') {
        defaultModel = (await rl.question('Enter custom model name: ')).trim() || 'llama-3.3-70b-versatile';
      } else defaultModel = 'llama-3.3-70b-versatile';

    } else if (choice === '5') {
      selectedProvider = 'deepseek';
      console.log('\nChoose DeepSeek model:');
      console.log('  1. deepseek-chat      (DeepSeek V3)');
      console.log('  2. deepseek-reasoner  (DeepSeek R1 Thinking Model)');
      console.log('  3. Custom Model Name  (Type or paste your own)');
      const mChoice = (await rl.question('Select model [1-3] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'deepseek-reasoner';
      else if (mChoice === '3') {
        defaultModel = (await rl.question('Enter custom model name: ')).trim() || 'deepseek-chat';
      } else defaultModel = 'deepseek-chat';

    } else if (choice === '6') {
      selectedProvider = 'openrouter';
      console.log('\nChoose OpenRouter model:');
      console.log('  1. anthropic/claude-3.5-sonnet');
      console.log('  2. openai/gpt-4o');
      console.log('  3. deepseek/deepseek-r1');
      console.log('  4. meta-llama/llama-3.3-70b-instruct');
      console.log('  5. Custom Model Name (Type or paste any OpenRouter model string)');
      const mChoice = (await rl.question('Select model [1-5] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'openai/gpt-4o';
      else if (mChoice === '3') defaultModel = 'deepseek/deepseek-r1';
      else if (mChoice === '4') defaultModel = 'meta-llama/llama-3.3-70b-instruct';
      else if (mChoice === '5') {
        defaultModel = (await rl.question('Enter OpenRouter model: ')).trim() || 'anthropic/claude-3.5-sonnet';
      } else defaultModel = 'anthropic/claude-3.5-sonnet';

    } else if (choice === '7') {
      selectedProvider = 'mistral';
      console.log('\nChoose Mistral model:');
      console.log('  1. mistral-large-latest (Recommended)');
      console.log('  2. codestral-latest     (Specialized for code)');
      console.log('  3. mistral-small-latest');
      console.log('  4. Custom Model Name    (Type or paste your own)');
      const mChoice = (await rl.question('Select model [1-4] (default: 1): ')).trim() || '1';
      if (mChoice === '2') defaultModel = 'codestral-latest';
      else if (mChoice === '3') defaultModel = 'mistral-small-latest';
      else if (mChoice === '4') {
        defaultModel = (await rl.question('Enter custom model name: ')).trim() || 'mistral-large-latest';
      } else defaultModel = 'mistral-large-latest';

    } else if (choice === '8') {
      selectedProvider = 'ollama';
      const customOllama = (await rl.question('Enter Ollama model name (default: llama3.1): ')).trim() || 'llama3.1';
      defaultModel = customOllama;
      const ollamaUrl = (await rl.question('Enter Ollama URL (default: http://localhost:11434): ')).trim();
      if (ollamaUrl) baseURL = ollamaUrl;

    } else if (choice === '9') {
      selectedProvider = 'custom';
      baseURL = (await rl.question('Enter Endpoint Base URL (e.g. http://localhost:1234/v1): ')).trim() || 'http://localhost:1234/v1';
      defaultModel = (await rl.question('Enter Model Name (default: default-model): ')).trim() || 'default-model';
    }

    // Prompt for API Key if not Ollama or Local
    let enteredKey = currentSettings.apiKey || '';
    if (selectedProvider !== 'ollama') {
      console.log(`\nEnter your ${selectedProvider.toUpperCase()} API Key:`);
      if (currentSettings.apiKey && currentSettings.provider === selectedProvider) {
        console.log(`\x1b[90m(Press Enter to keep current key)\x1b[0m`);
      }
      const rawKey = (await rl.question('> ')).trim();
      if (rawKey) enteredKey = rawKey;
    }

    const newSettings: AntrorSettings = {
      ...currentSettings,
      provider: selectedProvider,
      model: defaultModel,
      ...(enteredKey ? { apiKey: enteredKey } : {}),
      ...(baseURL ? { baseURL } : {}),
    };

    // Test connection
    console.log(`\n\x1b[36mTesting connection to ${selectedProvider} (${defaultModel})...\x1b[0m`);
    const testResult = await testConnection(newSettings);

    if (testResult.success) {
      console.log(`\x1b[32m✔ ${testResult.message} (${testResult.latencyMs}ms)\x1b[0m`);
    } else {
      console.log(`\x1b[33m⚠️ Warning: Connection test failed: ${testResult.message}\x1b[0m`);
      const proceed = (await rl.question('Save these settings anyway? (Y/n): ')).trim().toLowerCase();
      if (proceed === 'n') {
        console.log('Settings changes discarded.');
        return currentSettings;
      }
    }

    // Persist settings
    saveUserSettings({
      provider: selectedProvider,
      model: defaultModel,
      ...(enteredKey ? { apiKey: enteredKey } : {}),
      ...(baseURL ? { baseURL } : {}),
    });

    console.log(`\n\x1b[32m✔ Configuration saved successfully!\x1b[0m\n`);
    await new Promise(r => setTimeout(r, 500));
    return newSettings;
  } finally {
    rl.close();
  }
}

export async function ensureProviderConfigured(settings: AntrorSettings): Promise<AntrorSettings> {
  const hasKey = Boolean(
    settings.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.MISTRAL_API_KEY
  );

  if (hasKey || settings.provider === 'ollama') {
    return settings;
  }

  return promptProviderSetup(settings);
}
