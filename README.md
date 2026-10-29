# Antror Code

> Terminal-based agentic coding assistant closely replicating the UI/UX, workflow, and behavior of Claude Code.

---

## Highlights

- **Terminal UI**: Built with React + Ink, featuring warm orange accents, rounded input box, animated whimsical spinners, streaming markdown, tool call bullets, and colored diff inspection.
- **Provider-Agnostic LLM Layer**: Google Gemini (Gemini 3.5 Flash, 3.5 Flash Lite, 3.8 Flash, 3.1 Pro Preview), Anthropic Claude (with prompt caching), OpenAI-compatible (GPT-4o, DeepSeek, Groq, LM Studio), and local Ollama models.
- **Desktop Studio Application**: Full standalone desktop GUI edition (`Antror Code Studio`) with live file tree, visual diff inspector, checklist tracker, and automated Windows `.exe` installer builds via GitHub Actions.
- **Industrial Safety & Permissions**: 4 permission modes (`default`, `acceptEdits`, `plan`, `bypassPermissions`), allow/deny rules, interactive 1/2/3 approval modal, path sandboxing, and dangerous command protection.
- **Full Core Tool Suite**:
  - `Read`: line ranges, Jupyter notebooks, images (multimodal), PDFs.
  - `Write`: pre-read verification guard, stale write detection, unified diff generation.
  - `Edit` & `MultiEdit`: exact unique match replacement and colored diffs.
  - `Bash`: persistent working-directory state, timeout handling, background process tracking.
  - `Glob`, `Grep` (ripgrep-backed with pure JS fallback), `LS`.
  - `WebFetch` & `WebSearch`.
  - `TodoWrite`: live interactive checkbox checklist (`☐` / `▶` / `☒`).
  - `Task`: autonomous sub-agents with isolated contexts and tool allowlists.
  - `ExitPlanMode`: seamless transition from plan mode to execution.
- **Customizable**:
  - Custom slash commands via `.antror/commands/*.md` with `$ARGUMENTS`, `@file`, and `!bash` interpolation.
  - Sub-agents defined in `.antror/agents/*.md`.
  - Dynamic Model Context Protocol (MCP) tool integration.
  - Lifecycle hooks (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SessionStart`).
- **Session Persistence & Compaction**:
  - JSONL persistent storage under `~/.antror/projects/<hash>/`.
  - Auto-compaction when approaching context limits.
  - Session continuation (`-c`) and resume picker (`-r`).
- **TypeScript SDK**: Clean API for programmatic use in IDE extensions and automation.

---

## Installation

```bash
# Global install via npm
npm install -g antror-code

# Or run directly via npx
npx antror-code
```

---

## Quick Start

```bash
# Launch interactive REPL in current directory
antror

# Start with an initial query
antror "Inspect the project structure and summarize the architecture"

# Non-interactive print mode (for shell pipes or CI)
antror -p "Check git status and summarize uncommitted changes"

# Non-interactive JSON output
antror -p "List all exported functions" --output-format json

# Continue previous session
antror -c

# Specify model and permission mode
antror --model claude-3-5-sonnet-20241022 --permission-mode acceptEdits
```

---

## Keyboard Controls

| Key | Action |
|---|---|
| **Esc** | Interrupt active generation |
| **Esc Esc** | Rewind & edit previous user prompt |
| **Shift+Tab** | Cycle permission mode (`default` → `acceptEdits` → `plan`) |
| **Up / Down** | Browse input command history |
| **Ctrl+R** | Expand collapsed tool output |
| **Ctrl+C** | Clear line (press twice to exit) |
| **Ctrl+D** | Exit CLI |
| **Tab** | Autocomplete slash commands and file mentions |

---

## Input Prefixes

- **`/`** : Slash commands (`/help`, `/clear`, `/compact`, `/model`, `/theme`, `/init`, `/cost`, `/status`, `/doctor`, etc.)
- **`@`** : File/folder mentions with fuzzy auto-completion (`@src/index.ts`)
- **`!`** : Direct shell command (`!git status`, `!npm test`)
- **`#`** : Quick note saved directly to project memory (`# Remember to use Vitest for all unit tests`)

---

## Programmatic TypeScript SDK

```typescript
import { AntrorClient } from 'antror-code';

const client = new AntrorClient({
  model: 'claude-3-5-sonnet-20241022',
  permissionMode: 'acceptEdits',
});

const response = await client.chat('Refactor src/utils.ts to use ES modules', {
  onToken: (tok) => process.stdout.write(tok),
  onToolCall: (name, args) => console.log(`Invoking: ${name}`),
});

console.log('Result:', response);
```

---

## Documentation

- [Commands Reference](docs/commands.md)
- [Settings & Precedence](docs/settings.md)
- [Lifecycle Hooks](docs/hooks.md)
- [Model Context Protocol (MCP)](docs/mcp.md)

---

## Desktop Studio Edition & `.exe` Installer

Antror Code includes a standalone Desktop GUI application (`desktop/`) modeled after Codex Studio and Claude Code Desktop.

### Downloading the Windows `.exe`
When this repository is pushed to GitHub, **GitHub Actions automatically compiles and packages the Windows `.exe` installer** (`Antror-Code-Setup-1.0.0.exe`) on GitHub's high-speed cloud runners:
1. Navigate to the **Actions** tab in your GitHub repository.
2. Click on the latest **desktop-build** workflow run.
3. Download the compiled Windows `.exe` installer under **Artifacts** (or directly from the **Releases** page).

---

## Publishing to GitHub

You can publish this entire project to your GitHub repository using either of two methods:

### Method 1: Automated 1-Click Script (No Git install required)
Run the built-in publisher with your GitHub Personal Access Token:
```bash
node scripts/github-push.js <YOUR_GITHUB_TOKEN> <YOUR_USERNAME/REPO_NAME>
```

### Method 2: Standard Git CLI
```bash
git init
git add .
git commit -m "feat: initial commit of Antror Code"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
git push -u origin main
```

---

## License

MIT © 2026 Antror Team
