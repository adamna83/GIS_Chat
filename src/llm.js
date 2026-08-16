/**
 * OpenAI-compatible chat-completions client with tool calling.
 * Configurable baseURL / model / API key. Persisted in localStorage.
 */

const KEY = 'gis_chat_llm';

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function hasConfig() {
  const c = loadConfig();
  return !!(c.baseUrl && c.model);
}

/** Single round trip. Returns assistant message object (may contain tool_calls). */
export async function chatCompletion({ messages, tools, temperature = 0.4 }) {
  const cfg = loadConfig();
  if (!cfg.baseUrl || !cfg.model) throw new Error('LLM not configured. Open settings (gear icon).');
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const body = { model: cfg.model, messages, temperature };
  if (tools && tools.length) body.tools = tools;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.error?.message || j.message || detail;
    } catch {}
    throw new Error(detail);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('No message returned by the model.');
  return msg;
}

export async function testConnection() {
  const msg = await chatCompletion({
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  });
  return msg.content || 'OK';
}
