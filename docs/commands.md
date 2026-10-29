# Antror Code — Slash Commands & Input Prefixes

Antror Code provides a rich suite of built-in slash commands, custom commands, and input prefixes.

---

## Input Prefixes

| Prefix | Name | Description | Example |
|---|---|---|---|
| **`/`** | Slash Commands | Trigger built-in or custom commands with Tab auto-completion | `/help`, `/compact` |
| **`@`** | File Mentions | Mentions a file or directory with fuzzy auto-completion | `@src/index.ts explain this` |
| **`!`** | Direct Shell | Executes a bash/powershell command immediately | `!git status`, `!npm test` |
| **`#`** | Memory Note | Appends a note directly to `ANTROR.md` | `# Note: Prefer strict TypeScript` |

---

## Built-in Slash Commands

### `/help`
Display command reference, keyboard shortcuts, and prefixes.

### `/clear`
Clear conversation history and reset screen.

### `/compact [instructions]`
Summarize and compress earlier conversation turns to free up context window while preserving recent turns and key decisions.
```bash
/compact Keep focus on the database migrations and ports
```

### `/config`
View currently active configuration, resolved file paths, and precedence hierarchy.

### `/model [model_name]`
View active model or switch to another model:
```bash
/model claude-3-5-sonnet-20241022
/model gpt-4o
/model llama3.1
```

### `/theme [name]`
Switch color theme:
- `warm-orange` (default Claude Code inspired warm accent)
- `dark`
- `light`
- `colorblind` (Okabe-Ito high-contrast palette)

### `/init`
Analyze the current repository (tech stack, languages, build scripts, git) and initialize `ANTROR.md`.

### `/memory [note]`
View or append to project memory file (`ANTROR.md`).

### `/permissions [mode]`
View or switch permission mode:
- `default`: prompts for file writes/edits and bash commands.
- `acceptEdits`: auto-approves file writes and edits; prompts for bash.
- `plan`: read-only mode for planning.
- `bypassPermissions`: auto-approves all actions.

### `/cost`
Display detailed prompt tokens, completion tokens, prompt cache reads/writes, and dollar cost breakdown.

### `/status`
Display active model, provider, messages count, and memory usage.

### `/doctor`
Run system diagnostic checks on Node version, platform, git, ripgrep, and API configuration.

### `/login [api_key]`
Save API key to user settings (`~/.antror/settings.json`).

### `/logout`
Clear saved API keys from user configuration.

### `/vim`
Toggle Vim keybindings in the interactive input box.

### `/exit`
Exit the Antror Code CLI.

---

## Custom Markdown Commands

Define custom commands by placing Markdown files in:
- Project level: `.antror/commands/<name>.md`
- User level: `~/.antror/commands/<name>.md`

### Example: `.antror/commands/review-pr.md`
```markdown
---
description: Review pull request diff against main
---
Please review all changes on branch !git rev-parse --abbrev-ref HEAD:
!git diff main...HEAD

Focus on: $ARGUMENTS
```
Run with `/review-pr security and performance`.
Variables supported:
- `$ARGUMENTS`: arguments passed after the slash command.
- `@<file>`: automatically inlines file contents.
- `!<command>`: runs shell command and inlines output.
