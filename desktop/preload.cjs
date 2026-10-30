const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('antrorDesktop', {
  selectFolder: () => ipcRenderer.invoke('select-project-folder'),
  getCurrentProject: () => ipcRenderer.invoke('get-current-project'),
  listFiles: (targetDir) => ipcRenderer.invoke('list-project-files', targetDir),
  readFile: (relPath) => ipcRenderer.invoke('read-file-content', relPath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  testConnection: (settings) => ipcRenderer.invoke('test-connection', settings),
  startChat: (payload) => ipcRenderer.invoke('start-chat', payload),
  interruptChat: () => ipcRenderer.invoke('interrupt-chat'),

  // Event Listeners
  onToken: (callback) => {
    const handler = (_event, token) => callback(token);
    ipcRenderer.on('chat:token', handler);
    return () => ipcRenderer.removeListener('chat:token', handler);
  },
  onThought: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on('chat:thought', handler);
    return () => ipcRenderer.removeListener('chat:thought', handler);
  },
  onToolCall: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('chat:tool-call', handler);
    return () => ipcRenderer.removeListener('chat:tool-call', handler);
  },
  onToolResult: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on('chat:tool-result', handler);
    return () => ipcRenderer.removeListener('chat:tool-result', handler);
  },
  onAgentEvent: (callback) => {
    const handler = (_event, ev) => callback(ev);
    ipcRenderer.on('chat:event', handler);
    return () => ipcRenderer.removeListener('chat:event', handler);
  },
});
