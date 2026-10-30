import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AntrorClient } from '../dist/sdk.js';
import { loadSettings, saveUserSettings } from '../dist/config/settings.js';
import { testConnection } from '../dist/llm/factory.js';

// Catch any fatal errors and display an informative dialog instead of silent exit
process.on('uncaughtException', (err) => {
  console.error('Fatal Antror Studio Error:', err);
  try {
    dialog.showErrorBox('Antror Code Studio Error', `${err.message || String(err)}\n\n${err.stack || ''}`);
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let activeClient = null;
let currentProjectCwd = process.cwd();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 650,
    title: 'Antror Code Studio',
    backgroundColor: '#0F1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    dialog.showErrorBox('Load Error', `Failed to load interface: ${errorDescription} (${errorCode})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────

// 1. Select Project Directory
ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    currentProjectCwd = result.filePaths[0];
    activeClient = null; // Re-initialize client for new cwd
    return currentProjectCwd;
  }
  return null;
});

// 2. Get Current Project Directory
ipcMain.handle('get-current-project', () => {
  return currentProjectCwd;
});

// 3. List Project Files
ipcMain.handle('list-project-files', async (_event, targetDir) => {
  const dir = targetDir || currentProjectCwd;
  const listFiles = (dirPath, depth = 0) => {
    if (depth > 3) return [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = [];
      for (const e of entries) {
        if (['node_modules', '.git', 'dist', 'legacy'].includes(e.name)) continue;
        const full = path.join(dirPath, e.name);
        const rel = path.relative(currentProjectCwd, full).replace(/\\/g, '/');
        if (e.isDirectory()) {
          items.push({
            name: e.name,
            path: rel,
            type: 'directory',
            children: listFiles(full, depth + 1),
          });
        } else {
          items.push({
            name: e.name,
            path: rel,
            type: 'file',
          });
        }
      }
      return items;
    } catch {
      return [];
    }
  };

  return listFiles(dir);
});

// 4. Read File Content
ipcMain.handle('read-file-content', async (_event, relPath) => {
  try {
    const full = path.resolve(currentProjectCwd, relPath);
    if (fs.existsSync(full)) {
      return fs.readFileSync(full, 'utf-8');
    }
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
  return '';
});

// 5. Load Settings
ipcMain.handle('get-settings', () => {
  return loadSettings({}, currentProjectCwd);
});

// 6. Save Settings
ipcMain.handle('save-settings', (_event, updated) => {
  saveUserSettings(updated);
  activeClient = null; // Re-create client with new settings
  return true;
});

// 6b. Test Connection
ipcMain.handle('test-connection', async (_event, settings) => {
  try {
    return await testConnection(settings);
  } catch (err) {
    return { success: false, message: err.message || String(err), latencyMs: 0 };
  }
});

// 7. Start Agent Chat Stream
ipcMain.handle('start-chat', async (event, { prompt, permissionMode, model, provider, apiKey }) => {
  if (!activeClient) {
    activeClient = new AntrorClient({
      cwd: currentProjectCwd,
      permissionMode: permissionMode || 'default',
      model,
      provider,
      apiKey,
    });
  }

  try {
    const response = await activeClient.chat(prompt, {
      onToken: (text) => {
        event.sender.send('chat:token', text);
      },
      onThought: (text) => {
        event.sender.send('chat:thought', text);
      },
      onToolCall: (name, args) => {
        event.sender.send('chat:tool-call', { name, args });
      },
      onToolResult: (result) => {
        event.sender.send('chat:tool-result', result);
      },
      onEvent: (ev) => {
        event.sender.send('chat:event', ev);
      },
    });

    return { success: true, response };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// 8. Interrupt Active Chat
ipcMain.handle('interrupt-chat', () => {
  if (activeClient) {
    activeClient.interrupt();
    return true;
  }
  return false;
});
