/**
 * UI helpers: chat bubbles, tool-run status, toast, settings panel wiring.
 */
import { state } from './state.js';
import { hasConfig, loadConfig, saveConfig, testConnection } from './llm.js';
import { runAgent } from './agent.js';
import { exportA4 } from './layout.js';

let toastTimer = null;

export function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

export function setStatus(msg) {
  const el = document.getElementById('statusbar');
  if (el) el.textContent = msg;
}

function addMessage(role, text) {
  const wrap = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function addToolStatus(name) {
  const wrap = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg tool';
  div.innerHTML = `<span class="spinner"></span> Running: <code>${name}</code>\u2026`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

export function wireChatUI() {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const statusDot = document.getElementById('chatStatus');

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
    statusDot.className = busy ? 'dot busy' : 'dot';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    addMessage('user', text);

    if (!hasConfig()) {
      addMessage('assistant', 'Please configure the LLM first \u2014 open Settings (gear icon) and set base URL, model and API key.');
      return;
    }

    setBusy(true);
    try {
      const finalText = await runAgent(text, {
        onStatus: (name) => addToolStatus(name),
      });
      addMessage('assistant', finalText);
    } catch (err) {
      addMessage('assistant', `Error: ${err.message}`);
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener('submit', onSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // suggestion chips
  document.querySelectorAll('#chatSuggestions .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent.trim();
      form.requestSubmit();
    });
  });

  // auto-grow
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
}

export function wireSettingsUI() {
  const modal = document.getElementById('settingsModal');
  const openBtn = document.getElementById('btnSettings');
  const closeBtn = document.getElementById('btnSettingsClose');
  const saveBtn = document.getElementById('btnSettingsSave');
  const testBtn = document.getElementById('btnSettingsTest');
  const status = document.getElementById('settingsStatus');

  const cfg = loadConfig();
  document.getElementById('setBase').value = cfg.baseUrl || 'https://openrouter.ai/api/v1';
  document.getElementById('setModel').value = cfg.model || '';
  document.getElementById('setKey').value = cfg.apiKey || '';

  openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  saveBtn.addEventListener('click', () => {
    saveConfig({
      baseUrl: document.getElementById('setBase').value.trim(),
      model: document.getElementById('setModel').value.trim(),
      apiKey: document.getElementById('setKey').value.trim(),
    });
    modal.classList.add('hidden');
    toast('LLM settings saved.', 'success');
  });

  testBtn.addEventListener('click', async () => {
    status.textContent = 'Testing\u2026';
    try {
      saveConfig({
        baseUrl: document.getElementById('setBase').value.trim(),
        model: document.getElementById('setModel').value.trim(),
        apiKey: document.getElementById('setKey').value.trim(),
      });
      const res = await testConnection();
      status.textContent = `OK: ${res}`;
      toast('Connection OK.', 'success');
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
      toast('Connection failed.', 'error');
    }
  });
}

export function wireExportUI() {
  const modal = document.getElementById('exportModal');
  const openBtn = document.getElementById('btnExport');
  const closeBtn = document.getElementById('btnExportClose');
  const pngBtn = document.getElementById('btnExportPng');
  const pdfBtn = document.getElementById('btnExportPdf');

  openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  async function doExport(format) {
    const title = document.getElementById('expTitle').value.trim() || 'Map';
    const orientation = document.getElementById('expOrient').value;
    try {
      setStatus(`Exporting ${format.toUpperCase()}\u2026`);
      const file = await exportA4({ orientation, title, format });
      setStatus(`Exported: ${file}`);
      toast(`Saved ${file}`, 'success');
    } catch (err) {
      setStatus('Export failed.');
      toast(`Export error: ${err.message}`, 'error');
    }
  }

  pngBtn.addEventListener('click', () => doExport('png'));
  pdfBtn.addEventListener('click', () => doExport('pdf'));
}

export function wireBasemapUI(selectId, basemaps, onchange) {
  const sel = document.getElementById(selectId);
  for (const [id, def] of Object.entries(basemaps)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = def.name;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    onchange(sel.value);
    setStatus(`Basemap: ${basemaps[sel.value].name}`);
  });
}
