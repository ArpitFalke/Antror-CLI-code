# Antror Code — Lifecycle Hooks

Hooks allow you to run automated shell commands during critical agent lifecycle events. Hooks can audit actions, modify tool arguments, or block risky behavior.

---

## Supported Hook Events

| Hook Name | When It Fires | Blocking Behavior |
|---|---|---|
| **`PreToolUse`** | Immediately before any tool runs | Non-zero exit code blocks the tool execution. |
| **`PostToolUse`** | Immediately after tool execution finishes | Informational audit and logging. |
| **`UserPromptSubmit`**| When user submits a prompt | Non-zero exit code cancels the turn. |
| **`SessionStart`** | When a session starts or resumes | Initialization actions. |
| **`Stop`** | When agent generation completes or interrupts | Post-task cleanup. |

---

## Configuration

Configure hooks in `.antror/settings.json` or `~/.antror/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": "node ./hooks/validate-tool.js",
    "PostToolUse": "node ./hooks/log-audit.js",
    "UserPromptSubmit": "python ./hooks/prompt-filter.py"
  }
}
```

---

## Payload Delivery & Environment Variables

When a hook command executes, Antror provides the event payload in two ways:
1. **Standard Input (`stdin`)**: Full JSON payload string.
2. **Environment Variables**:
   - `ANTROR_HOOK_EVENT`: Name of the event (`PreToolUse`, `PostToolUse`, etc.)
   - `ANTROR_HOOK_PAYLOAD`: Complete JSON payload string.

---

## Modifying Arguments or Blocking Actions

In `PreToolUse`, your hook script can output JSON to standard output to alter behavior:

### Example: Block Action
Exit with code `1`, or output JSON:
```json
{
  "block": true,
  "reason": "Production database migrations are not permitted in development mode"
}
```

### Example: Modify Tool Arguments
```json
{
  "modifiedArgs": {
    "path": "src/safe-copy.ts"
  }
}
```
