import readline from 'node:readline/promises';
import { AntrorSettings, LLMProviderType } from './types.js';
import { saveUserSettings } from './settings.js';

export async function ensureProviderConfigured(settings: AntrorSettings): Promise<AntrorSettings> {
  // If provider is already configured with an API key, or is Ollama, proceed directly!
  const hasKey = Boolean(
    settings.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY
  );

  if (hasKey || settings.provider === 'ollama') {
    return settings;
  }

  // Interactive setup wizard on first run
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.clear();
    console.log(`\x1b[38;2;255;107;53m
  ▄████████ █▄    █  ████████ █▀▀▀█ ▄████████
  ███    ███ ███▄  █     ██    ██▄▄█ ███    ███
  ███    ███ ██ ▀█ █     ██    ██▄▄▄ ███    ███
  ██████████ ██   ██     ██    ██  ██ ██████████\x1b[0m

  \x1b[1mWelcome to Antror Code!\x1b[0m
  Let's choose your AI model provider to get started:

  \x1b[32m1.\x1b[0m \x1b[1mGoogle Gemini\x1b[0m (Gemini 3.5 Flash, 3.5 Flash Lite, 3.8 Flash, 3.1 Pro)
  \x1b[33m2.\x1b[0m \x1b[1mAnthropic Claude\x1b[0m (Claude 3.5 Sonnet / Haiku / Opus)
  \x1b[36m3.\x1b[0m \x1b[1mOpenAI / OpenRouter / DeepSeek\x1b[0m (GPT-4o, etc.)
  \x1b[35m4.\x1b[0m \x1b[1mLocal Ollama\x1b[0m (100% Free, runs offline on your machine)
  \x1b[90m5. Demo / Offline Mode\x1b[0m
`);

    const choice = (await rl.question('Select a provider [1-5] (default: 1): ')).trim() || '1';

    let selectedProvider: LLMProviderType = 'gemini';
    let defaultModel = 'gemini-3.5-flash';

    if (choice === '1') {
      selectedProvider = 'gemini';
      console.log('\nChoose Google Gemini model:');
      console.log('  1. gemini-3.5-flash      (Fast & recommended)');
      console.log('  2. gemini-3.5-flash-lite (Ultra-fast & lightweight)');
      console.log('  3. gemini-3.8-flash      (Latest generation speed)');
      console.log('  4. gemini-3.1-pro-preview(High reasoning & architecture)');
      const modelChoice = (await rl.question('Select model [1-4] (default: 1): ')).trim() || '1';
      if (modelChoice === '2') defaultModel = 'gemini-3.5-flash-lite';
      else if (modelChoice === '3') defaultModel = 'gemini-3.8-flash';
      else if (modelChoice === '4') defaultModel = 'gemini-3.1-pro-preview';
      else defaultModel = 'gemini-3.5-flash';
    } else if (choice === '2') {
      selectedProvider = 'anthropic';
      defaultModel = 'claude-3-5-sonnet-20241022';
    } else if (choice === '3') {
      selectedProvider = 'openai';
      defaultModel = 'gpt-4o';
    } else if (choice === '4') {
      selectedProvider = 'ollama';
      defaultModel = 'llama3.1';
    } else if (choice === '5') {
      selectedProvider = 'anthropic';
      defaultModel = 'mock-model-v1';
    }

    let enteredKey = '';
    if (['gemini', 'anthropic', 'openai'].includes(selectedProvider) && choice !== '5') {
      const providerName =
        selectedProvider === 'gemini'
          ? 'Google Gemini'
          : selectedProvider === 'anthropic'
          ? 'Anthropic Claude'
          : 'OpenAI';

      console.log(`\nEnter your ${providerName} API Key`);
      console.log(`\x1b[90m(Your key is saved locally in ~/.antror/settings.json and never shared)\x1b[0m`);
      enteredKey = (await rl.question('> ')).trim();
    }

    settings.provider = selectedProvider;
    settings.model = defaultModel;
    if (enteredKey) {
      settings.apiKey = enteredKey;
    }

    // Persist to user settings
    saveUserSettings({
      provider: selectedProvider,
      model: defaultModel,
      ...(enteredKey ? { apiKey: enteredKey } : {}),
    });

    console.log(`\n\x1b[32m✓ Configuration saved! Starting Antror Code...\x1b[0m\n`);
    await new Promise(r => setTimeout(r, 600));

    return settings;
  } finally {
    rl.close();
  }
}
