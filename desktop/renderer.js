let currentStreamElem = null;
let currentToolElem = null;
let currentThoughtElem = null;
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
const settingsBaseUrl = document.getElementById('settingsBaseUrl');
const groupBaseUrl = document.getElementById('groupBaseUrl');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const testConnectionStatus = document.getElementById('testConnectionStatus');
const diffContent = document.getElementById('diffContent');
const tasksList = document.getElementById('tasksList');

const DEFAULT_MODELS = {
  gemini: 'gemini-3.5-flash',
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-reasoner',
  openrouter: 'anthropic/claude-3.5-sonnet',
  mistral: 'mistral-large-latest',
  ollama: 'llama3.1',
  custom: 'default-model',
};

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
    activeModelBadge.textContent = `${settings.provider || 'gemini'}: ${settings.model || 'gemini-3.5-flash'}`;
    settingsProvider.value = settings.provider || 'gemini';
    settingsModel.value = settings.model || 'gemini-3.5-flash';
    settingsApiKey.value = settings.apiKey || '';
    if (settingsBaseUrl && settings.baseURL) settingsBaseUrl.value = settings.baseURL;
    updateBaseUrlVisibility();
  }

  // Provider change auto-fill
  settingsProvider.addEventListener('change', () => {
    const prov = settingsProvider.value;
    settingsModel.value = DEFAULT_MODELS[prov] || 'default-model';
    updateBaseUrlVisibility();
  });

  // Test Connection
  if (testConnectionBtn) {
    testConnectionBtn.onclick = async () => {
      testConnectionStatus.textContent = 'Testing connection...';
      testConnectionStatus.style.color = '#FFB800';
      try {
        const res = await window.antrorDesktop.testConnection({
          provider: settingsProvider.value,
          model: settingsModel.value,
          apiKey: settingsApiKey.value,
          baseURL: settingsBaseUrl ? settingsBaseUrl.value : undefined,
        });
        if (res.success) {
          testConnectionStatus.textContent = `✔ OK (${res.latencyMs}ms)`;
          testConnectionStatus.style.color = '#4EFA8B';
        } else {
          testConnectionStatus.textContent = `❌ Failed: ${res.message.slice(0, 50)}`;
          testConnectionStatus.style.color = '#FF5252';
        }
      } catch (e) {
        testConnectionStatus.textContent = `❌ Error: ${e.message}`;
        testConnectionStatus.style.color = '#FF5252';
      }
    };
  }

  // Setup streaming event listeners
  window.antrorDesktop.onThought((text) => {
    if (!currentThoughtElem) {
      const thoughtBox = document.createElement('div');
      thoughtBox.className = 'thought-card';
      thoughtBox.innerHTML = `
        <div class="thought-header">💭 Thinking Process...</div>
        <div class="thought-body"></div>
      `;
      chatStream.appendChild(thoughtBox);
      currentThoughtElem = thoughtBox.querySelector('.thought-body');
    }
    currentThoughtElem.textContent += text;
    chatStream.scrollTop = chatStream.scrollHeight;
  });

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

function updateBaseUrlVisibility() {
  if (!groupBaseUrl) return;
  const prov = settingsProvider.value;
  if (prov === 'ollama' || prov === 'custom') {
    groupBaseUrl.style.display = 'block';
  } else {
    groupBaseUrl.style.display = 'none';
  }
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
    const ul = document.createElement('ul');
    ul.className = 'tree-list';
    for (const item of items) {
      const li = document.createElement('li');
      li.className = `tree-item ${item.type}`;
      li.innerHTML = `
        <span class="tree-icon">${item.type === 'directory' ? '📁' : '📄'}</span>
        <span class="tree-label">${escapeHtml(item.name)}</span>
      `;

      if (item.type === 'file') {
        li.onclick = () => openFileView(item.path);
      } else if (item.children) {
        renderTree(item.children, li);
      }
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }

  renderTree(tree, fileTreeContainer);
}

async function openFileView(filePath) {
  const diffPanel = document.getElementById('diffPanel');
  diffPanel.style.display = 'flex';
  document.getElementById('tabFile').classList.add('active');
  document.getElementById('tabDiff').classList.remove('active');

  const content = await window.antrorDesktop.readFile(filePath);
  diffContent.innerHTML = `
    <div class="file-view-header">📄 ${escapeHtml(filePath)}</div>
    <pre class="file-view-code"><code>${escapeHtml(content)}</code></pre>
  `;
}

function renderDiff(diffText, filePath) {
  const diffPanel = document.getElementById('diffPanel');
  diffPanel.style.display = 'flex';
  document.getElementById('tabDiff').classList.add('active');
  document.getElementById('tabFile').classList.remove('active');

  const lines = diffText.split('\n');
  const rendered = lines.map(line => {
    let cls = 'diff-context';
    if (line.startsWith('+')) cls = 'diff-add';
    else if (line.startsWith('-')) cls = 'diff-del';
    else if (line.startsWith('@@')) cls = 'diff-hunk';
    return `<div class="diff-line ${cls}">${escapeHtml(line)}</div>`;
  }).join('');

  diffContent.innerHTML = `
    <div class="diff-file-title">⚡ Diff: ${escapeHtml(filePath)}</div>
    <div class="diff-lines">${rendered}</div>
  `;
}

// ── Chat Functions ────────────────────────────────────────
function appendUserMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'chat-message user-message';
  msg.innerHTML = `
    <div class="message-sender">You</div>
    <div class="message-body">${escapeHtml(text)}</div>
  `;
  chatStream.appendChild(msg);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function appendAssistantMessage(initialText) {
  const msg = document.createElement('div');
  msg.className = 'chat-message assistant-message';
  msg.innerHTML = `
    <div class="message-sender">Antror Code</div>
    <div class="message-body markdown-content">${escapeHtml(initialText)}</div>
  `;
  chatStream.appendChild(msg);
  currentStreamElem = msg.querySelector('.message-body');
  chatStream.scrollTop = chatStream.scrollHeight;
}

async function handleSend() {
  const text = promptInput.value.trim();
  if (!text) return;

  promptInput.value = '';
  appendUserMessage(text);

  currentStreamElem = null;
  currentToolElem = null;
  currentThoughtElem = null;

  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  try {
    const settings = await window.antrorDesktop.getSettings();
    await window.antrorDesktop.startChat({
      prompt: text,
      permissionMode: permissionModeSelect.value,
      model: settings.model,
      provider: settings.provider,
      apiKey: settings.apiKey,
    });
  } catch (err) {
    appendAssistantMessage(`⚠️ Error: ${err.message || String(err)}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

function escapeHtml(str) {
  if (!str) return '';
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
    ...(settingsBaseUrl?.value ? { baseURL: settingsBaseUrl.value } : {}),
  };
  await window.antrorDesktop.saveSettings(updated);
  activeModelBadge.textContent = `${updated.provider}: ${updated.model}`;
  settingsModal.classList.remove('active');
};

document.getElementById('closeDiffBtn').onclick = () => {
  document.getElementById('diffPanel').style.display = 'none';
};

init();
