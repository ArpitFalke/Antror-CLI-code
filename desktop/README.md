# Antror Code Studio — Desktop Application

Antror Code Studio is the standalone desktop edition of Antror Code, modeled after Codex Studio and Claude Code Desktop.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   Desktop UI (Renderer)                │
│    - File Tree Explorer       - Markdown & Chat Stream │
│    - Live Checklist Tracker   - Visual Diff Inspector  │
│    - Prompter Input Box       - Settings Modal         │
└───────────────────────────┬────────────────────────────┘
                            │ (Secure Preload IPC Bridge)
┌───────────────────────────▼────────────────────────────┐
│                  Electron Main Process                 │
│    - Window Management        - Native Dialogs         │
│    - IPC Router               - File System Access     │
└───────────────────────────┬────────────────────────────┘
                            │ (Direct SDK Invocation)
┌───────────────────────────▼────────────────────────────┐
│                Antror Code Core SDK                    │
│    - Agent Loop               - Tool Execution         │
│    - Multi-provider LLM Layer - Safety & Permissions   │
└────────────────────────────────────────────────────────┘
```

---

## Running in Development

To run Antror Code Studio on your laptop:

```bash
# 1. Ensure project is built
npm run build

# 2. Launch Desktop App
npm run desktop
# Or: npx electron ./desktop/main.js
```

---

## Packaging into Standalone `.exe` Installer

To package Antror Code Studio into an installer (`.exe`) for Windows distribution:

```bash
# Install electron-builder if not present
npm install --save-dev electron-builder

# Build Windows installer
npx electron-builder --win
```

The compiled installer will be placed in `desktop-dist/Antror Code Studio Setup 1.0.0.exe`.

---

## Features

- **Google Gemini / Claude / OpenAI / Ollama Integration**: Switch providers dynamically from the UI.
- **Visual Diff Inspector**: Inspect changes before saving.
- **Integrated File Tree**: Click any file to open the file viewer.
- **Live Checklist Tracker**: Multi-step goals render reactive checkboxes (`☐` / `▶` / `☒`).
- **Interactive Permission Modes**: Switch between `Default`, `Accept Edits`, and `Plan Mode` anytime.
