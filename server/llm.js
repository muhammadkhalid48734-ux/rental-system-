// The only file that knows which LLM provider is used. Swap the provider by replacing `generate`.
// Groq exposes an OpenAI-compatible chat completions endpoint; plain fetch, no SDK.

export class LlmError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code; // not_configured | bad_key | rate_limited | provider_down | bad_output
    Object.assign(this, extra);
  }
}

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const TIMEOUT_MS = 30000;
const MAX_RETRY_WAIT_MS = 8000; // longer waits would not fit a serverless function; tell the client instead

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(res) {
  const h = res.headers?.get?.('retry-after');
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(h);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function post(fetchImpl, url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{system: string, user: string}} prompt
 * @param {{env?: object, fetch?: Function, sleep?: Function, timeoutMs?: number}} [deps] injection points for tests
 * @returns {Promise<string>} the model's text
 */
export async function generate({ system, user }, deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;

  const key = env.GROQ_API_KEY;
  if (!key) throw new LlmError('not_configured', 'GROQ_API_KEY is not set on the server.');
  const model = env.GROQ_MODEL || DEFAULT_MODEL;
  const url = `${(env.GROQ_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')}/chat/completions`;

  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.9,
    max_completion_tokens: 900, // a DM is about 250 tokens; Groq counts the requested maximum against the per-minute token limit
    // gpt-oss models spend tokens on hidden reasoning; keep it short so the answer is not cut off.
    ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
  };
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  };

  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await post(fetchImpl, url, init, timeoutMs);
    } catch (err) {
      if (err?.name === 'AbortError') throw new LlmError('provider_down', `The AI provider did not answer within ${timeoutMs / 1000}s.`);
      if (attempt === 0) { await sleep(800); continue; }
      throw new LlmError('provider_down', 'Could not reach the AI provider.');
    }
    if (res.status === 429) {
      const wait = retryAfterMs(res) ?? 2000;
      if (attempt === 0 && wait <= MAX_RETRY_WAIT_MS) { await sleep(wait); continue; }
      throw new LlmError('rate_limited', 'The AI provider rate limit was hit.', { retryAfterMs: wait });
    }
    if (res.status >= 500) {
      if (attempt === 0) { await sleep(800 + Math.floor(Math.random() * 400)); continue; }
      throw new LlmError('provider_down', `The AI provider is having trouble (HTTP ${res.status}).`);
    }
    break;
  }

  if (res.status === 401 || res.status === 403) {
    throw new LlmError('bad_key', 'The AI provider rejected GROQ_API_KEY. Check that the key is valid.');
  }
  if (!res.ok) {
    throw new LlmError('provider_down', `The AI provider rejected the request (HTTP ${res.status}). Check GROQ_MODEL.`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new LlmError('bad_output', 'The AI provider returned something that is not JSON.');
  }
  const choice = json?.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new LlmError('bad_output', 'The AI provider returned an empty answer.');
  if (choice.finish_reason === 'length') throw new LlmError('bad_output', 'The AI answer was cut off.');
  return text.trim();
}
