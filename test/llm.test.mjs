import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, LlmError } from '../server/llm.js';

const env = { GROQ_API_KEY: 'gsk_test_key', GROQ_MODEL: 'openai/gpt-oss-120b' };
const prompt = { system: 'SYS', user: 'USER' };
const ok = (text, extra = {}) => ({
  ok: true, status: 200, headers: new Headers(),
  json: async () => ({ choices: [{ message: { content: text }, finish_reason: 'stop' }], ...extra }),
});
const status = (code, headers = {}) => ({ ok: false, status: code, headers: new Headers(headers), json: async () => ({ error: { message: 'x' } }) });

function mockFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  fn.calls = calls;
  return fn;
}
const sleeps = [];
const sleep = async (ms) => { sleeps.push(ms); };
const run = (fetch, extra = {}, e = env) => generate(prompt, { env: e, fetch, sleep, ...extra });

test('success: sends an OpenAI-style request to Groq with the key and returns the trimmed text', async () => {
  const f = mockFetch(ok('  Hello there  '));
  assert.equal(await run(f), 'Hello there');
  const [{ url, init, body }] = f.calls;
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer gsk_test_key');
  assert.equal(body.model, 'openai/gpt-oss-120b');
  assert.deepEqual(body.messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }]);
  assert.equal(body.reasoning_effort, 'low');
});

test('default model, custom model and base URL', async () => {
  let f = mockFetch(ok('x'));
  await run(f, {}, { GROQ_API_KEY: 'k' });
  assert.equal(f.calls[0].body.model, 'openai/gpt-oss-120b');
  f = mockFetch(ok('x'));
  await run(f, {}, { GROQ_API_KEY: 'k', GROQ_MODEL: 'llama-3.3-70b-versatile', GROQ_BASE_URL: 'http://127.0.0.1:9999/v1/' });
  assert.equal(f.calls[0].url, 'http://127.0.0.1:9999/v1/chat/completions');
  assert.equal('reasoning_effort' in f.calls[0].body, false);
});

test('429 then success: waits for retry-after, retries once, returns text', async () => {
  sleeps.length = 0;
  const f = mockFetch(status(429, { 'retry-after': '2' }), ok('second try'));
  assert.equal(await run(f), 'second try');
  assert.equal(f.calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
});

test('429 twice: rate_limited with a retry hint; a long retry-after is not waited for', async () => {
  let f = mockFetch(status(429, { 'retry-after': '1' }), status(429, { 'retry-after': '3' }));
  await assert.rejects(run(f), (e) => e instanceof LlmError && e.code === 'rate_limited' && e.retryAfterMs === 3000);
  assert.equal(f.calls.length, 2);

  f = mockFetch(status(429, { 'retry-after': '120' }));
  await assert.rejects(run(f), (e) => e.code === 'rate_limited' && e.retryAfterMs === 120000);
  assert.equal(f.calls.length, 1, 'no retry when the wait would not fit a serverless function');
});

test("429: Groq's own explanation of the limit is passed on", async () => {
  const body = { ok: false, status: 429, headers: new Headers({ 'retry-after': '272' }), json: async () => ({ error: { message: 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199000.' } }) };
  await assert.rejects(run(mockFetch(body)), (e) => e.code === 'rate_limited' && /tokens per day/.test(e.detail));
});

test('5xx is retried once; two failures -> provider_down', async () => {
  let f = mockFetch(status(503), ok('recovered'));
  assert.equal(await run(f), 'recovered');
  f = mockFetch(status(500), status(502));
  await assert.rejects(run(f), (e) => e.code === 'provider_down');
  assert.equal(f.calls.length, 2);
});

test('401 and 403 -> bad_key, never retried', async () => {
  for (const code of [401, 403]) {
    const f = mockFetch(status(code));
    await assert.rejects(run(f), (e) => e.code === 'bad_key');
    assert.equal(f.calls.length, 1);
  }
});

test('malformed output -> bad_output', async () => {
  const cases = [
    { ok: true, status: 200, headers: new Headers(), json: async () => { throw new Error('not json'); } },
    { ok: true, status: 200, headers: new Headers(), json: async () => ({}) },
    { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [] }) },
    ok('   '),
    { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: 'cut of' }, finish_reason: 'length' }] }) },
  ];
  for (const c of cases) await assert.rejects(run(mockFetch(c)), (e) => e.code === 'bad_output');
});

test('missing key -> not_configured without calling the network', async () => {
  const f = mockFetch(ok('x'));
  await assert.rejects(run(f, {}, {}), (e) => e.code === 'not_configured');
  assert.equal(f.calls.length, 0);
});

test('timeout -> provider_down', async () => {
  const hang = (_url, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(run(hang, { timeoutMs: 20 }), (e) => e.code === 'provider_down' && /did not answer/.test(e.message));
});

test('network error is retried once, then provider_down; the key never appears in errors', async () => {
  const f = mockFetch(new Error('ECONNRESET'), new Error('ECONNRESET'));
  await assert.rejects(run(f), (e) => e.code === 'provider_down' && !e.message.includes('gsk_test_key'));
  assert.equal(f.calls.length, 2);
});
