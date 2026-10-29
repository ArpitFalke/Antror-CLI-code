let currentStreamElem = null;
let currentToolElem = null;
let activeDiffs = [];

// ── DOM References ────────────────────────────────────────
const chatStream = document.getElementById('chatStream');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const openProjectBtn = document.getElementById('openProjectBtn');
const currentProjectLabel = document.getElementById('currentProjectLabel');
const refreshFilesBtn = document.getElementById('refreshFilesBtn');
const fileTreeContainer = document.getElementById('fileTreeContainer');
const permissionModeSelect = document.getElementById('permissionModeSelect');
const activeModelBadge = document.getElementById('activeModelBadge');
const tokenCounter = document.getElementById('tokenCounter');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsProvider = document.getElementById('settingsProvider');
const settingsModel = document.getElementById('settingsModel');
const settingsApiKey = document.getElementById('settingsApiKey');
const diffContent = document.getElementById('diffContent');
const tasksList = document.getElementById('tasksList');

// ── Initialization ────────────────────────────────────────
async function init() {
  if (!window.antrorDesktop) {
    console.warn('Running outside Electron environment');
    return;
  }

  // Load project path
  const projectPath = await window.antrorDesktop.getCurrentProject();
  currentProjectLabel.textContent = projectPath || 'Select workspace...';

  // Load files
  loadFiles();

  // Load settings
  const settings = await window.antrorDesktop.getSettings();
  if (settings) {
    const providerName = settings.provider === 'gemini' ? 'Google Gemini' : settings.provider === 'anthropic' ? 'Claude' : settings.provider;
    activeModelBadge.textContent = `${providerName}: ${settings.model || 'default'}`;
    settingsProvider.value = settings.provider || 'gemini';
    settingsModel.value = settings.model || 'gemini-1.5-pro';
    settingsApiKey.value = settings.apiKey || '';
  }

  // Setup streaming event listeners
  window.antrorDesktop.onToken((token) => {
    if (!currentStreamElem) {
      appendAssistantMessage('');
    }
    currentStreamElem.textContent += token;
    chatStream.scrollTop = chatStream.scrollHeight;
  });

  window.antrorDesktop.onToolCall(({ name, args }) => {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.innerHTML = `
      <div class="tool-header">● ${name}(${JSON.stringify(args).slice(0, 60)})</div>
      <div class="tool-result">executing...</div>
    `;
    chatStream.appendChild(card);
    currentToolElem = card.querySelector('.tool-result');
    chatStream.scrollTop = chatStream.scrollHeight;
  });

  window.antrorDesktop.onToolResult((result) => {
    if (currentToolElem) {
      currentToolElem.textContent = `⎿ ${result.output.split('\n')[0] || 'Done'}`;
    }
    if (result.diff) {
      renderDiff(result.diff, result.arguments?.path || 'file');
    }
  });

  window.antrorDesktop.onAgentEvent((ev) => {
    if (ev.type === 'usage') {
      tokenCounter.textContent = `${ev.usage.totalTokens.toLocaleString()} tokens ($${ev.cost.toFixed(4)})`;
    }
  });
}

// ── File Explorer ─────────────────────────────────────────
async function loadFiles() {
  if (!window.antrorDesktop) return;
  fileTreeContainer.innerHTML = '<div class="loading-hint">Scanning...</div>';
  const tree = await window.antrorDesktop.listFiles();

  fileTreeContainer.innerHTML = '';
  if (!tree || tree.length === 0) {
    fileTreeContainer.innerHTML = '<div class="loading-hint">Empty directory</div>';
    return;
  }

  function renderTree(items, container) {
    for (const item of items) {
      const el = document.createElement('div');
      el.className = `file-tree-item ${item.type}`;
      el.innerHTML = `${item.type === 'directory' ? '📁' : '📄'} ${item.name}`;
      el.onclick = () => {
        if (item.type === 'file') {
          openFileViewer(item.path);
        }
      };
      container.appendChild(el);
      if (item.children && item.children.length > 0) {
        const sub = document.createElement('div');
        sub.style.paddingLeft = '14px';
        renderTree(item.children, sub);
        container.appendChild(sub);
      }
    }
  }

  renderTree(tree, fileTreeContainer);
}

async function openFileViewer(relPath) {
  const content = await window.antrorDesktop.readFile(relPath);
  diffContent.innerHTML = `
    <div style="font-weight: 600; color: #38BDF8; margin-bottom: 8px;">📄 ${relPath}</div>
    <pre style="white-space: pre-wrap; color: #F0F3F8;">${escapeHtml(content)}</pre>
  `;
}

function renderDiff(patch, filePath) {
  const lines = patch.split('\n');
  const rendered = lines.map(l => {
    if (l.startsWith('+') && !l.startsWith('+++')) {
      return `<div class="diff-line-add">${escapeHtml(l)}</div>`;
    }
    if (l.startsWith('-') && !l.startsWith('---')) {
      return `<div class="diff-line-remove">${escapeHtml(l)}</div>`;
    }
    return `<div>${escapeHtml(l)}</div>`;
  }).join('');

  diffContent.innerHTML = `
    <div style="font-weight: 600; color: #FF6B35; margin-bottom: 8px;">⚡ Diff: ${filePath}</div>
    ${rendered}
  `;
}

// ── Chat Functions ────────────────────────────────────────
function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
  chatStream.appendChild(row);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function appendAssistantMessage(initialText = '') {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.innerHTML = `<div class="assistant-bubble">${escapeHtml(initialText)}</div>`;
  chatStream.appendChild(row);
  currentStreamElem = row.querySelector('.assistant-bubble');
  chatStream.scrollTop = chatStream.scrollHeight;
}

async function handleSend() {
  const text = promptInput.value.trim();
  if (!text) return;

  promptInput.value = '';
  appendUserMessage(text);

  currentStreamElem = null;
  currentToolElem = null;

  const mode = permissionModeSelect.value;
  await window.antrorDesktop.startChat({
    prompt: text,
    permissionMode: mode,
  });
}

function setPrompt(text) {
  promptInput.value = text;
  promptInput.focus();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Event Handlers ────────────────────────────────────────
sendBtn.onclick = handleSend;

promptInput.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};

openProjectBtn.onclick = async () => {
  const newFolder = await window.antrorDesktop.selectFolder();
  if (newFolder) {
    currentProjectLabel.textContent = newFolder;
    loadFiles();
  }
};

refreshFilesBtn.onclick = loadFiles;

settingsBtn.onclick = () => settingsModal.classList.add('active');
closeSettingsModal.onclick = () => settingsModal.classList.remove('active');
cancelSettingsBtn.onclick = () => settingsModal.classList.remove('active');

saveSettingsBtn.onclick = async () => {
  const updated = {
    provider: settingsProvider.value,
    model: settingsModel.value,
    apiKey: settingsApiKey.value,
  };
  await window.antrorDesktop.saveSettings(updated);
  activeModelBadge.textContent = `${updated.provider}: ${updated.model}`;
  settingsModal.classList.remove('active');
};

document.getElementById('closeDiffBtn').onclick = () => {
  document.getElementById('diffPanel').style.display = 'none';
};

init();
