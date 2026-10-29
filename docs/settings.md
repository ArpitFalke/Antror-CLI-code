# Antror Code — Configuration & Settings

Antror Code uses a 5-tier hierarchical configuration system designed for enterprise security, project-level collaboration, and individual user customization.

---

## Precedence Hierarchy

Settings are loaded and merged in the following order of precedence (highest to lowest):

1. **Enterprise Settings**:
   - Linux/macOS: `/etc/antror/settings.json`
   - Windows: `%ProgramData%\Antror\settings.json`
   - *Overrides all user and project settings.*
2. **CLI Flags**:
   - `--model`, `--provider`, `--permission-mode`, `--theme`, `--output-format`
3. **Local Project Settings**:
   - `.antror/settings.json` in project root (gitignored for private developer preferences)
4. **Shared Project Config**:
   - `.antror/config.json` in project root (committed to git for team defaults)
5. **User Settings**:
   - `~/.antror/settings.json` in home directory
6. **Default Settings**

---

## Configuration Schema

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com/v1",
  "permissionMode": "default",
  "theme": "warm-orange",
  "maxTokens": 8192,
  "temperature": 0,
  "vimMode": false,
  "telemetry": false,
  "allowRules": [
    "Bash(npm test:*)",
    "Read(src/**)"
  ],
  "denyRules": [
    "Read(./.env*)"
  ],
  "askRules": [
    "Bash(npm publish*)"
  ],
  "hooks": {
    "PreToolUse": "node ./scripts/check-perms.js",
    "PostToolUse": "node ./scripts/audit-log.js"
  },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "transport": "stdio"
    }
  }
}
```

---

## Environment Variables

- `ANTHROPIC_API_KEY`: Anthropic API key
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_BASE_URL`: OpenAI-compatible endpoint URL (e.g. `http://localhost:11434/v1`)
- `OLLAMA_HOST`: Local Ollama host (default: `http://localhost:11434`)
- `ANTROR_MODEL`: Default model override
- `ANTROR_PROVIDER`: `anthropic`, `openai`, or `ollama`
- `NO_COLOR`: Disables all ANSI colors when set
