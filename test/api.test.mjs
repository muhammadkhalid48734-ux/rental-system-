import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createApp } from '../server/app.js';
import { createHandler } from '../api/[...path].js';
import { makeLoginLimiter, verifySession, createSession, authSettings } from '../server/auth.js';
import { createStore, loadCredentials, memoryStore } from '../server/store.js';
import { LlmError } from '../server/llm.js';
import { createQueue } from '../server/queue.js';
import { CSP } from '../server/csp.js';
import { buildMessage } from '../client/src/lib/messages.js';
import { CONFIG_DEFAULTS } from '../server/schema.js';

const PASSWORD = 'correct horse battery';
const SECRET = 's'.repeat(48);
const PROD = { NODE_ENV: 'production', APP_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, GROQ_API_KEY: 'gsk_test' };

const GOOD =
  `Hey Dana! Your sparkle-theme castle caught my eye. When I pulled up your site on my phone, the layout was tiny and hard to tap, and I'd guess a few parents give up before they ask about dates. I run a small remote web design studio and could put together a free private demo, with a photo gallery and online booking, ${CONFIG_DEFAULTS.demoTurnaround}. Would you want to see it?`;

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

function client(base) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})), setCookie: set };
  };
  call.cookie = () => cookie;
  return call;
}

async function setup({ env = PROD, llm, queue, auth } = {}) {
  const store = memoryStore();
  await store.init();
  const app = createApp({ store, env, llm, queue, auth: { sleep: async () => {}, ...auth } });
  const srv = await serve(app);
  const call = client(srv.base);
  return { store, call, ...srv };
}

async function login(call) {
  const r = await call('POST', '/api/login', { password: PASSWORD });
  assert.equal(r.status, 200);
}

// ---------------------------------------------------------------- auth

const ALL_ROUTES = [
  ['GET', '/api/leads'], ['POST', '/api/leads', { leads: [] }], ['PATCH', '/api/leads/x', {}], ['DELETE', '/api/leads/x'],
  ['GET', '/api/config'], ['PUT', '/api/config', {}], ['GET', '/api/log'], ['POST', '/api/log', {}],
  ['POST', '/api/generate', {}], ['GET', '/api/session'], ['POST', '/api/logout', {}], ['GET', '/api/does-not-exist'],
];

test('unauthenticated /api requests return 401 on every route', async () => {
  const { call, close } = await setup();
  try {
    for (const [m, p, b] of ALL_ROUTES) {
      const r = await call(m, p, b);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.code, 'unauthenticated');
    }
    // a forged or tampered cookie is no better than none
    for (const cookie of ['__Host-od_session=abc.def', `__Host-od_session=${createSession('wrong-secret'.padEnd(40, 'x'))}`]) {
      const r = await call('GET', '/api/leads', undefined, { cookie });
      assert.equal(r.status, 401);
    }
  } finally { await close(); }
});

test('login: wrong password 401, right password sets a signed httpOnly Secure SameSite=Lax cookie that unlocks the API', async () => {
  const { call, close } = await setup();
  try {
    assert.equal((await call('POST', '/api/login', { password: 'nope' })).status, 401);
    assert.equal((await call('POST', '/api/login', {})).status, 401);
    const r = await call('POST', '/api/login', { password: PASSWORD });
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /^__Host-od_session=/);
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) assert.ok(r.setCookie.includes(attr), attr);
    assert.ok(!r.setCookie.includes('Domain='), '__Host- cookies must not set Domain');
    assert.equal((await call('GET', '/api/leads')).status, 200);
    const s = await call('GET', '/api/session');
    assert.deepEqual([s.json.authRequired, s.json.llm.configured], [true, true]);
    assert.equal((await call('POST', '/api/logout', {})).status, 200);
  } finally { await close(); }
});

test('session tokens expire and cannot be forged', () => {
  const t = createSession(SECRET, 1000);
  assert.equal(verifySession(t, SECRET, 1000 + 60_000), true);
  assert.equal(verifySession(t, SECRET, 1000 + 8 * 86400_000), false);
  assert.equal(verifySession(t, 'another-secret'.padEnd(40, 'y'), 2000), false);
  const [p, m] = t.split('.');
  assert.equal(verifySession(`${p}x.${m}`, SECRET, 2000), false);
  assert.equal(verifySession('', SECRET), false);
});

test('login attempts are rate limited per IP (429 even with the right password afterwards)', async () => {
  const { call, close } = await setup({ auth: { limiter: makeLoginLimiter() } });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/login', { password: `bad${i}` })).status, 401);
    const r = await call('POST', '/api/login', { password: PASSWORD });
    assert.equal(r.status, 429);
    assert.equal(r.json.code, 'too_many_attempts');
    assert.equal((await call('GET', '/api/leads')).status, 401);
  } finally { await close(); }
});

test('limiter forgets after its window and clears on success', () => {
  let t = 0;
  const l = makeLoginLimiter({ now: () => t });
  for (let i = 0; i < 5; i++) l.fail('1.1.1.1');
  assert.ok(l.check('1.1.1.1') > 0);
  assert.equal(l.check('2.2.2.2'), 0);
  t += 16 * 60 * 1000;
  assert.equal(l.check('1.1.1.1'), 0);
  l.fail('3.3.3.3'); l.success('3.3.3.3');
  assert.equal(l.check('3.3.3.3'), 0);
});

test('cross-origin writes are blocked', async () => {
  const { call, close } = await setup();
  try {
    await login(call);
    const r = await call('POST', '/api/leads', { leads: [{ name: 'X' }] }, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  } finally { await close(); }
});

test('production without APP_PASSWORD and SESSION_SECRET refuses to respond; weak values are refused too', async () => {
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1', APP_PASSWORD: PASSWORD }, { VERCEL: '1', SESSION_SECRET: SECRET },
    { NODE_ENV: 'production', APP_PASSWORD: 'short', SESSION_SECRET: SECRET }, { NODE_ENV: 'production', APP_PASSWORD: PASSWORD, SESSION_SECRET: 'tooshort' }]) {
    const { call, close } = await setup({ env });
    try {
      const r = await call('GET', '/api/leads');
      assert.equal(r.status, 500, JSON.stringify(env));
      assert.equal(r.json.code, 'not_configured');
      assert.equal((await call('POST', '/api/login', { password: PASSWORD })).status, 500);
    } finally { await close(); }
  }
  assert.equal(authSettings({ NODE_ENV: 'production' }).ok, false);
  assert.equal(authSettings({ NODE_ENV: 'production', APP_PASSWORD: PASSWORD, SESSION_SECRET: SECRET }).ok, true);
});

test('local dev without a password stays open; with a password it is enforced', async () => {
  let t = await setup({ env: {} });
  try {
    assert.equal((await t.call('GET', '/api/leads')).status, 200);
    assert.equal((await t.call('GET', '/api/session')).json.authRequired, false);
  } finally { await t.close(); }
  t = await setup({ env: { APP_PASSWORD: PASSWORD, SESSION_SECRET: SECRET } });
  try {
    assert.equal((await t.call('GET', '/api/leads')).status, 401);
    const r = await t.call('POST', '/api/login', { password: PASSWORD });
    assert.match(r.setCookie, /^od_session=/);
    assert.ok(!r.setCookie.includes('Secure'), 'plain-http localhost must still work');
  } finally { await t.close(); }
});

test('Vercel handler: fails closed without secrets, never touches Sheets for unauthenticated calls, works when configured', async () => {
  let t = await serve(createHandler({ env: { VERCEL: '1' }, store: { init: async () => { throw new Error('must not be called'); } } }));
  try {
    const r = await fetch(`${t.base}/api/leads`);
    assert.equal(r.status, 500);
    assert.equal((await r.json()).code, 'not_configured');
  } finally { await t.close(); }

  const store = memoryStore();
  let inits = 0;
  const counting = { ...store, init: async () => { inits++; return store.init(); } };
  t = await serve(createHandler({ env: { VERCEL: '1', ...PROD }, store: counting }));
  try {
    const call = client(t.base);
    assert.equal((await call('GET', '/api/leads')).status, 401);
    assert.equal(inits, 0, 'unauthenticated requests must not open the Sheet');
    await login(call);
    assert.equal((await call('GET', '/api/leads')).status, 200);
    assert.equal(inits, 1);
  } finally { await t.close(); }
});

// ---------------------------------------------------------------- storage / config

test('production refuses in-memory storage and missing Google credentials', () => {
  assert.throws(() => createStore({ memory: true, env: { NODE_ENV: 'production' } }), /not allowed in production/);
  assert.throws(() => createStore({ env: { VERCEL: '1', STORAGE: 'memory' } }), /not allowed in production/);
  assert.throws(() => createStore({ env: { VERCEL: '1' } }), /GOOGLE_SHEET_ID/);
  assert.equal(createStore({ memory: true, env: {} }).kind, 'memory');
});

test('GOOGLE_SERVICE_ACCOUNT_JSON accepts a JSON string or a file path', () => {
  const key = { type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN-----\nabc\n-----END-----\n' };
  assert.deepEqual(loadCredentials(JSON.stringify(key)), { credentials: key });
  const escaped = JSON.stringify({ ...key, private_key: '-----BEGIN-----\\nabc\\n-----END-----\\n' }); // literal backslash-n
  assert.equal(loadCredentials(escaped).credentials.private_key, key.private_key);
  assert.match(loadCredentials('./credentials/service-account.json').keyFile, /credentials\/service-account\.json$/);
  assert.throws(() => loadCredentials('{ not json'), /not valid JSON/);
});

test('config: packages validate, monthly may be empty, autoMark is ignored', async () => {
  const { call, close } = await setup({ env: {} });
  try {
    const c = (await call('GET', '/api/config')).json.config;
    assert.equal(c.pkg1Monthly, '');
    assert.equal(c.pkg2Name, 'Website that books for you');
    assert.equal('autoMark' in c, false);
    let r = await call('PUT', '/api/config', { pkg1Monthly: '', pkg3Setup: '$600', autoMark: 'true' });
    assert.equal(r.status, 200);
    assert.equal(r.json.config.pkg3Setup, '600');
    assert.equal('autoMark' in r.json.config, false);
    assert.equal((await call('PUT', '/api/config', { pkg1Setup: 'abc' })).status, 400);
    assert.equal((await call('PUT', '/api/config', { pkg2Name: '' })).status, 400);
    assert.equal((await call('PUT', '/api/config', { pkg1Setup: '' })).status, 400);
  } finally { await close(); }
});

test('config: demoTurnaround has a default, is editable, stays one line, and rejects links, prices and empty', async () => {
  const { call, close } = await setup({ env: {} });
  try {
    const c = (await call('GET', '/api/config')).json.config;
    assert.equal(c.demoTurnaround, 'usually within the hour during our support hours, otherwise by the next morning (US time)');
    const r = await call('PUT', '/api/config', { demoTurnaround: '  usually same day,\n within 4 working hours  ' });
    assert.equal(r.status, 200);
    assert.equal(r.json.config.demoTurnaround, 'usually same day, within 4 working hours');
    for (const bad of ['', '   ', 'x'.repeat(161), 'see https://example.com', 'for $50']) {
      assert.equal((await call('PUT', '/api/config', { demoTurnaround: bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call('GET', '/api/config')).json.config.demoTurnaround, 'usually same day, within 4 working hours');
  } finally { await close(); }
});

// ---------------------------------------------------------------- Messages tab

test('Mark sent stores the exact text; undo adds a compensating row; the Log keeps 6 columns', async () => {
  const { call, store, close } = await setup({ env: {} });
  try {
    const lead = (await call('POST', '/api/leads', { leads: [{ name: 'Hop & Pop', problem: 'outdated' }] })).json.created[0];
    const sent = '  Hey!  exactly as sent \n=SUM(1)';
    await call('POST', '/api/log', { leadId: lead.id, account: 'A', track: 'cold', step: 0, channel: 'ig', text: sent });
    await call('POST', '/api/log', { leadId: lead.id, account: 'A', track: 'cold', step: 0, channel: 'undo' });
    const msgs = await store.getRows('Messages');
    assert.equal(msgs.length, 2);
    assert.deepEqual([msgs[0][1], msgs[0][2], msgs[0][3]], [lead.id, 'cold', sent]);
    assert.deepEqual([msgs[1][2], msgs[1][3]], ['cold:undo', '']);
    const log = await store.getRows('Log');
    assert.equal(log.length, 2);
    assert.equal(log[0].length, 6);
    assert.equal((await call('GET', '/api/log')).json.log.every((e) => !('text' in e)), true);
  } finally { await close(); }
});

// ---------------------------------------------------------------- /api/generate

function fakeLlm(...answers) {
  const calls = [];
  return {
    calls,
    async generate({ system, user }, deps) {
      calls.push({ system, user, deps });
      const a = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (a instanceof Error) throw a;
      return typeof a === 'function' ? a() : a;
    },
  };
}
const freshQueue = () => createQueue({ maxRpm: 1000 });

async function genSetup(llm, env = { GROQ_API_KEY: 'gsk_test' }) {
  const t = await setup({ env, llm, queue: freshQueue() });
  const lead = (await t.call('POST', '/api/leads', {
    leads: [{ name: 'Hop & Pop Party Rentals', owner: 'Dana Rivers', city: 'Mesa', problem: 'outdated', hook: 'your sparkle-theme castle', note: 'site looks old', ig: 'https://instagram.com/private_handle', email: 'dana@private.example' }],
  })).json.created[0];
  return { ...t, lead };
}
const gen = (t, body) => t.call('POST', '/api/generate', { leadId: t.lead.id, kind: 'cold', ...body });

test('generate: personalized text is returned as-is and the prompt holds only whitelisted lead data', async () => {
  const llm = fakeLlm(GOOD);
  const t = await genSetup(llm);
  try {
    const r = await gen(t, { hint: 'shorter', previousVariants: ['Older draft text'], system: 'EVIL', prompt: 'EVIL', lead: { name: 'EVIL' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.source, 'personalized');
    assert.equal(r.json.text, GOOD);
    const { system, user } = llm.calls[0];
    assert.ok(user.includes('your sparkle-theme castle') && user.includes('site looks old') && user.includes('"shorter"') && user.includes('Older draft text'));
    for (const leak of ['private_handle', 'dana@private', 'Rivers', 'EVIL', t.lead.id]) assert.ok(!user.includes(leak) && !system.includes(leak), leak);
  } finally { await t.close(); }
});

test('generate: a violation triggers one retry that states it; success on retry is personalized', async () => {
  const llm = fakeLlm(`${GOOD} Visit https://hoppop.com`, GOOD);
  const t = await genSetup(llm);
  try {
    const r = await gen(t);
    assert.equal(r.json.source, 'personalized');
    assert.equal(llm.calls.length, 2);
    assert.match(llm.calls[1].user, /previous draft was rejected because: it contains a link or website address/);
  } finally { await t.close(); }
});

test('generate: two violations (or two empty answers) fall back to the offline template', async () => {
  for (const llm of [fakeLlm('I built you a site! $99', 'I built you a site! $99'), fakeLlm(new LlmError('bad_output', 'empty'))]) {
    const t = await genSetup(llm);
    try {
      const r = await gen(t);
      assert.equal(r.status, 200);
      assert.equal(r.json.source, 'template');
      const lead = (await t.call('GET', '/api/leads')).json.leads[0];
      assert.equal(r.json.text, buildMessage({ key: 'pitch' }, lead, CONFIG_DEFAULTS));
      assert.ok(r.json.reason);
      assert.equal(llm.calls.length, 2, 'exactly one retry');
    } finally { await t.close(); }
  }
});

test('generate: the delivery time from Config reaches the prompt, is enforced, and the template fallback uses it', async () => {
  const custom = 'usually same day, within 4 working hours (US Eastern)';
  const missing = GOOD.replace(CONFIG_DEFAULTS.demoTurnaround, 'whenever I get to it');
  const llm = fakeLlm(missing, GOOD.replace(CONFIG_DEFAULTS.demoTurnaround, custom));
  const t = await genSetup(llm);
  try {
    await t.call('PUT', '/api/config', { demoTurnaround: custom });
    const r = await gen(t);
    assert.equal(r.json.source, 'personalized');
    assert.ok(r.json.text.includes(custom));
    assert.equal(llm.calls.length, 2, 'first draft lacked the configured wording, so it was retried once');
    assert.match(llm.calls[1].user, /previous draft was rejected because: it must state the demo delivery time word for word as: "usually same day/);
    for (const c of llm.calls) {
      assert.ok(c.system.includes(custom) && !c.system.includes(CONFIG_DEFAULTS.demoTurnaround));
      assert.ok(c.user.includes(custom));
    }
  } finally { await t.close(); }

  const t2 = await genSetup(fakeLlm('Hi! within the hour of you saying yes, I will build you a site.', 'Hi! within the hour of you saying yes, I will build you a site.'));
  try {
    await t2.call('PUT', '/api/config', { demoTurnaround: custom });
    const r = await gen(t2);
    assert.equal(r.json.source, 'template');
    assert.ok(r.json.text.includes(`send it over ${custom}.`), 'template fallback uses the configured wording');
    assert.ok(!/within the hour of you saying yes/.test(r.json.text));
  } finally { await t2.close(); }
});

test('generate: provider errors are clear and never look like a login failure', async () => {
  const cases = [
    [new LlmError('rate_limited', 'slow down', { retryAfterMs: 12000 }), 429, 'rate_limited'],
    [new LlmError('bad_key', 'bad key'), 503, 'bad_key'],
    [new LlmError('provider_down', 'down'), 502, 'provider_down'],
  ];
  for (const [err, status, code] of cases) {
    const t = await genSetup(fakeLlm(err));
    try {
      const r = await gen(t);
      assert.equal(r.status, status);
      assert.equal(r.json.code, code);
      if (code === 'rate_limited') assert.equal(r.json.retryAfterMs, 12000);
    } finally { await t.close(); }
  }
});

test('generate: no GROQ_API_KEY -> not_configured, the rest of the app is unaffected', async () => {
  const t = await genSetup(fakeLlm(GOOD), {});
  try {
    const r = await gen(t);
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'not_configured');
    assert.equal((await t.call('GET', '/api/leads')).status, 200);
    assert.equal((await t.call('GET', '/api/session')).json.llm.configured, false);
  } finally { await t.close(); }
});

test('generate: input validation (kind, unknown lead, demo needs a link, oversized variants)', async () => {
  const t = await genSetup(fakeLlm(GOOD));
  try {
    assert.equal((await gen(t, { kind: 'nope' })).status, 400);
    assert.equal((await t.call('POST', '/api/generate', { leadId: 'missing', kind: 'cold' })).status, 404);
    assert.equal((await gen(t, { kind: 'demo' })).status, 400);
    assert.equal((await gen(t, { previousVariants: Array(9).fill('x') })).status, 400);
    assert.equal((await gen(t, { previousVariants: 'x' })).status, 400);
  } finally { await t.close(); }
});

test('leads: PATCH and DELETE accept the id as ?id= (single path segment) as well as in the path', async () => {
  const t = await setup();
  try {
    await login(t.call);
    const made = await t.call('POST', '/api/leads', { leads: [{ name: 'Query Id Bounce Co', problem: 'nosite' }] });
    const id = made.json.created[0].id;
    const a = await t.call('PATCH', `/api/leads?id=${id}`, { account: 'B' });
    assert.equal(a.status, 200);
    assert.equal(a.json.lead.account, 'B');
    const b = await t.call('PATCH', `/api/leads/${id}`, { account: 'A' });
    assert.equal(b.json.lead.account, 'A');
    assert.equal((await t.call('PATCH', '/api/leads', { account: 'A' })).status, 400);
    assert.equal((await t.call('PATCH', '/api/leads?id=nope', { account: 'A' })).status, 404);
    assert.equal((await t.call('DELETE', `/api/leads?id=${id}`)).status, 200);
    assert.equal((await t.call('DELETE', `/api/leads?id=${id}`)).status, 404);
  } finally { await t.close(); }
});

test('generate: demo messages get the exact link and Config packages substituted by the server', async () => {
  const draft = 'Hi Dana! Your private demo is ready at [[LINK]]. Only you have this link, and everything is easy to change.\n[[PACKAGES]]';
  const llm = fakeLlm(draft);
  const t = await genSetup(llm);
  try {
    await t.call('PATCH', `/api/leads/${t.lead.id}`, { demoLink: 'https://demo.example/hoppop' });
    await t.call('PUT', '/api/config', { pkg2Monthly: '' });
    const r = await gen(t, { kind: 'demo' });
    assert.equal(r.json.source, 'personalized');
    assert.ok(r.json.text.includes('https://demo.example/hoppop'));
    assert.ok(r.json.text.includes('1) Website: $247 setup, no monthly fee'));
    assert.ok(r.json.text.includes('2) Website that books for you (Recommended): $297 setup, no monthly fee'));
    assert.ok(r.json.text.includes('3) Book, pay & sign online: $597 setup + $79/month'));
    assert.match(r.json.text, /Cancel anytime, no contract, and your website, domain and photos stay yours\.$/);
    assert.ok(!llm.calls[0].user.includes('demo.example'), 'link is not sent to the provider');
  } finally { await t.close(); }
});

test('generate: earlier messages sent to the lead reach the prompt; undone ones do not', async () => {
  const llm = fakeLlm(GOOD);
  const t = await genSetup(llm);
  try {
    const entry = { leadId: t.lead.id, account: 'A', track: 'cold', channel: 'ig' };
    await t.call('POST', '/api/log', { ...entry, step: 0, text: 'FIRST-MESSAGE-AS-SENT' });
    await t.call('POST', '/api/log', { ...entry, step: 1, text: 'SECOND-MESSAGE-UNDONE' });
    await t.call('POST', '/api/log', { ...entry, step: 1, channel: 'undo' });
    await gen(t, { kind: 'followup1' });
    const { user } = llm.calls[0];
    assert.ok(user.includes('FIRST-MESSAGE-AS-SENT'));
    assert.ok(!user.includes('SECOND-MESSAGE-UNDONE'));
  } finally { await t.close(); }
});

test('generate requires login and the local queue is applied', async () => {
  const llm = fakeLlm(GOOD);
  const t = await setup({ env: PROD, llm, queue: createQueue({ maxRpm: 1, maxWaitMs: 100 }) });
  try {
    assert.equal((await t.call('POST', '/api/generate', { leadId: 'x', kind: 'cold' })).status, 401);
    await login(t.call);
    const lead = (await t.call('POST', '/api/leads', { leads: [{ name: 'Q Lead' }] })).json.created[0];
    assert.equal((await t.call('POST', '/api/generate', { leadId: lead.id, kind: 'cold' })).status, 200);
    const second = await t.call('POST', '/api/generate', { leadId: lead.id, kind: 'cold' });
    assert.equal(second.status, 429);
    assert.equal(second.json.code, 'rate_limited');
  } finally { await t.close(); }
});

// ---------------------------------------------------------------- deployment files

test('vercel.json: one catch-all function, CSP matches the server constant, nothing secret inside', () => {
  const v = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(v.outputDirectory, 'client/dist');
  assert.ok(fs.existsSync(new URL('../api/[...path].js', import.meta.url)));
  assert.equal(v.functions['api/**/*.js'].maxDuration, 60);
  const csp = v.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.equal(csp, CSP);
  assert.ok(!/gsk_|password|secret/i.test(JSON.stringify(v)));
});

test('.gitignore keeps secrets and dependencies out of git', () => {
  const ig = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split('\n');
  for (const need of ['.env', 'node_modules/', 'credentials/', '*service-account*.json', '*-key.json']) assert.ok(ig.includes(need), need);
});
