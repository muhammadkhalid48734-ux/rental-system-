import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { cellText, parsePaste, resolveProgress } from '../client/src/lib/importer.js';
import { addDays, dayToIso, parseDay, ymd } from '../client/src/lib/dates.js';
import { buildToday, netSends, nextAction, parseConfig, pipelineStats, weekStats } from '../client/src/lib/schedule.js';
import { getStage } from '../client/src/lib/messages.js';
import { createApp } from '../server/app.js';
import { memoryStore } from '../server/store.js';
import { CONFIG_DEFAULTS } from '../server/schema.js';

const NOW = new Date(2026, 9, 24, 12, 0, 0); // Sat 24 Oct 2026, local noon
const day = (n) => ymd(addDays(NOW, -n)); // n days ago as YYYY-MM-DD
const cfg = parseConfig(CONFIG_DEFAULTS); // gaps 2,3,4
const raw = (status = '', step = '', lastSent = '', account = '') => ({ status, step, lastSent, account });
const resolve = (r, opts = {}) => resolveProgress(r, { now: NOW, ...opts });
const errs = (r, opts) => resolve(r, opts).errors;

// ------------------------------------------------------------------ parser

test('6-column pastes behave exactly as before (no progress, queued defaults)', () => {
  const tsv = [
    'Business\tWebsite\tInstagram\tFacebook\tNote\tEmail',
    'Fun Jumps\thttps://funjumps.com/?utm_source=ig\t@funjumps\t\tsite down since May\thi@funjumps.com',
    'Castle Kings\t\t\thttps://facebook.com/castlekings?fbclid=z\tposts daily\t',
    'Fun Jumps\t\t\t\t\t',
  ].join('\n');
  const r = parsePaste(tsv, []);
  assert.equal(r.rows.length, 3);
  assert.equal(r.hasProgress, false);
  assert.ok(r.rows.every((x) => x.raw === null));
  assert.equal(r.skippedDup, 1);
  assert.deepEqual([r.rows[0].problem, r.rows[0].email, r.rows[0].site, r.rows[0].ig], ['down', 'hi@funjumps.com', 'https://funjumps.com/', 'https://instagram.com/funjumps']);
  assert.equal(r.rows[1].fb, 'https://facebook.com/castlekings');
  // placeholders in the extra columns do not turn a 6-column row into a progress row
  const p = parsePaste('Acme\t\t\t\t\t\t-\tnone\tn/a\t', []);
  assert.equal(p.rows[0].raw, null);
});

test('10-column pastes keep the progress columns as typed, header row ignored', () => {
  const tsv = [
    'business\twebsite\tinstagram\tfacebook\tnote\temail\tstatus\tstep\tlastSentAt\taccount',
    `Fun Jumps\thttps://funjumps.com\t@funjumps\t\told site\thi@funjumps.com\tActive\t2\t${day(3)}\tA`,
    'Castle Kings\t\t\t\t\t\tqueued',
    'Party Palace\t\t\t\t\t\t\t3\t2026-10-01\t',
  ].join('\n');
  const r = parsePaste(tsv, []);
  assert.equal(r.rows.length, 3);
  assert.equal(r.hasProgress, true);
  assert.deepEqual(r.rows[0].raw, { status: 'Active', step: '2', lastSent: day(3), account: 'A' });
  assert.deepEqual(r.rows[1].raw, { status: 'queued', step: '', lastSent: '', account: '' });
  assert.deepEqual(r.rows[2].raw, { status: '', step: '3', lastSent: '2026-10-01', account: '' });
});

test('progress columns never leak into other fields (email is only taken from the email column or note)', () => {
  const r = parsePaste('Acme\t\t\t\tnote\tme@acme.example\tactive\t1\t2026-10-20\tA', []);
  assert.equal(r.rows[0].email, 'me@acme.example');
  assert.equal(cellText('  none '), '');
  assert.equal(cellText(' A '), 'A');
});

// ------------------------------------------------------------------ validation

test('a valid row becomes lead fields exactly as given (cold track)', () => {
  const r = resolve(raw('active', '2', day(3), 'A'));
  assert.deepEqual(r.errors, []);
  const p = r.progress;
  assert.deepEqual([p.status, p.track, p.step, p.account, p.lastSentDay, p.repliedAt], ['active', 'cold', 2, 'A', day(3), '']);
  assert.equal(ymd(new Date(p.lastSentAt)), day(3), 'the stored timestamp falls on the given calendar day');
  assert.ok(new Date(p.lastSentAt) <= NOW);
});

test('values are case-insensitive and whitespace-tolerant', () => {
  const r = resolve(raw(' ACTIVE ', ' 1 ', ` ${day(1)} `, ' b '));
  assert.deepEqual(r.errors, []);
  assert.deepEqual([r.progress.status, r.progress.step, r.progress.account], ['active', 1, 'B']);
});

test('step must be a whole number from 0 to 4', () => {
  for (const bad of ['5', '9', '-1', '2.5', 'x', '1e1', '02a']) {
    assert.ok(errs(raw('active', bad, day(2), 'A')).some((m) => /step .* must be a whole number from 0 to 4/.test(m)), bad);
  }
  for (const ok of ['0', '1', '2', '3', '4']) {
    assert.ok(!errs(raw('replied', ok, ok === '0' ? '' : day(2), 'A')).some((m) => /step/.test(m)), ok);
  }
});

test('dates must be real, YYYY-MM-DD and not in the future', () => {
  const tomorrow = ymd(addDays(NOW, 1));
  const cases = [
    ['2026-02-30', /not a real date/], ['2026-13-01', /not a real date/], ['2026-00-10', /not a real date/],
    ['20/10/2026', /YYYY-MM-DD/], ['2026-1-5', /YYYY-MM-DD/], ['Oct 20', /YYYY-MM-DD/], ['2026-10-20T10:00', /YYYY-MM-DD/],
    [tomorrow, /in the future/], ['2027-01-01', /in the future/],
  ];
  for (const [value, re] of cases) assert.ok(errs(raw('active', '1', value, 'A')).some((m) => re.test(m)), value);
  // today is fine, and its stored timestamp is not in the future
  const t = resolve(raw('active', '1', ymd(NOW), 'A'));
  assert.deepEqual(t.errors, []);
  assert.ok(new Date(t.progress.lastSentAt) <= NOW);
  assert.equal(ymd(new Date(t.progress.lastSentAt)), ymd(NOW));
  assert.equal(parseDay('2024-02-29') instanceof Date, true, 'leap day is real');
  assert.equal(parseDay('2026-02-29'), null);
});

test('status and account must be valid', () => {
  assert.ok(errs(raw('sent', '1', day(1), 'A')).some((m) => /status “sent” must be one of/.test(m)));
  assert.ok(errs(raw('active', '1', day(1), 'C')).some((m) => /account “C” must be A or B/.test(m)));
});

test('rows that would confuse the Today screen are rejected with a clear reason', () => {
  const has = (r, re, opts) => assert.ok(errs(r, opts).some((m) => re.test(m)), `${JSON.stringify(r)} -> ${errs(r, opts)}`);
  has(raw('queued', '2', day(2), 'A'), /queued .* step must be 0/);
  has(raw('queued', '', day(2), 'A'), /queued .* remove lastSentAt/);
  has(raw('active', '0', '', 'A'), /active needs step 1-3/);
  has(raw('active', '4', day(2), 'A'), /step 4 means every message was sent: use status done/);
  has(raw('active', '2', '', 'A'), /active needs lastSentAt/);
  has(raw('done', '0', '', 'A'), /done needs step 1-4/);
  has(raw('replied', '0', day(2), 'A'), /lastSentAt is set but step is 0/);
  has(raw('active', '2', day(2), ''), /account \(A or B\) is required/);
  has(raw('won', '3', day(9), ''), /account \(A or B\) is required/);
  // each problem is reported, not just the first
  assert.ok(errs(raw('active', '9', '2026-02-30', 'Z')).length >= 3);
});

test('sensible defaults when columns are left blank, each one explained', () => {
  let r = resolve(raw('', '2', day(3), 'A'));
  assert.deepEqual([r.progress.status, r.progress.step], ['active', 2]);
  assert.ok(r.notes.some((n) => /status set to active/.test(n)));

  r = resolve(raw('done', '', day(10), 'B'));
  assert.deepEqual([r.progress.status, r.progress.step], ['done', 4]);
  assert.ok(r.notes.some((n) => /step set to 4/.test(n)));

  r = resolve(raw('', '', '', 'B'));
  assert.deepEqual([r.progress.status, r.progress.step, r.progress.account, r.progress.lastSentAt], ['queued', 0, 'B', '']);

  assert.ok(errs(raw('active', '1', day(1), '')).length > 0);
  r = resolve(raw('active', '1', day(1), ''), { defaultAccount: 'A' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.progress.account, 'A');
  assert.ok(r.notes.some((n) => /account set to A/.test(n)));
  assert.equal(resolve(raw('active', '1', day(1), 'B'), { defaultAccount: 'A' }).progress.account, 'B', 'an explicit account wins');
});

test('replied leads show up in "Replies to handle" right away; other statuses are kept as given', () => {
  const r = resolve(raw('replied', '1', day(4), 'A'));
  assert.equal(r.progress.status, 'replied');
  assert.equal(r.progress.repliedAt, NOW.toISOString());
  for (const status of ['won', 'lost']) assert.equal(resolve(raw(status, '2', day(6), 'B')).progress.status, status);
  assert.equal(resolve(raw('lost', '1', '', 'A')).errors.length, 0, 'a missing date is allowed when no follow-up depends on it');
});

// ------------------------------------------------------------------ due dates

test('next due date uses the gaps from Config (2, 3, 4 days after message 1, 2, 3)', () => {
  const next = (step, sentDaysAgo, c = cfg) => nextAction({ status: 'active', step, lastSentAt: dayToIso(day(sentDaysAgo), NOW) }, c, NOW);
  // follow-up 1 after message 1: gap 2
  assert.equal(ymd(next(1, 0).due), ymd(addDays(NOW, 2)));
  assert.equal(next(1, 1).overdueDays, -1);
  assert.equal(next(1, 2).overdueDays, 0);
  assert.equal(next(1, 5).overdueDays, 3);
  // follow-up 2 after message 2: gap 3; follow-up 3 after message 3: gap 4
  assert.equal(ymd(next(2, 0).due), ymd(addDays(NOW, 3)));
  assert.equal(ymd(next(3, 0).due), ymd(addDays(NOW, 4)));
  assert.equal(next(3, 3).overdueDays, -1);
  assert.equal(next(3, 4).overdueDays, 0);
  // wording
  assert.match(next(1, 5).text, /^Follow-up 1 overdue by 3 days \(was due /);
  assert.equal(next(1, 2).text, 'Follow-up 1 due today');
  assert.match(next(2, 2).text, /^Follow-up 2 due .* \(in 1 day\)$/);
  assert.match(next(3, 1).text, /\(in 3 days\)$/);
  // custom gaps are honoured
  const custom = parseConfig({ ...CONFIG_DEFAULTS, gaps: '1,5,9' });
  assert.equal(next(1, 1, custom).overdueDays, 0);
  assert.equal(next(2, 5, custom).overdueDays, 0);
  assert.equal(next(3, 8, custom).overdueDays, -1);
});

test('next action for the other statuses', () => {
  const a = (status, step = 1) => nextAction({ status, step, lastSentAt: '' }, cfg, NOW);
  assert.equal(a('queued', 0).kind, 'new');
  assert.equal(a('replied').kind, 'reply');
  assert.equal(a('done', 4).text, 'Sequence finished');
  assert.equal(a('won').kind, 'none');
  assert.equal(a('lost').kind, 'none');
  assert.equal(a('active').kind, 'none', 'active without a date cannot be scheduled');
});

test('the due date is the same calendar day in every timezone', () => {
  const script = `
    import { resolveProgress } from './client/src/lib/importer.js';
    import { nextAction, parseConfig } from './client/src/lib/schedule.js';
    import { ymd } from './client/src/lib/dates.js';
    import { CONFIG_DEFAULTS } from './server/schema.js';
    const now = new Date();
    const d = new Date(now); d.setDate(d.getDate() - 3);
    const day = ymd(d);
    const r = resolveProgress({ status: 'active', step: '2', lastSent: day, account: 'A' }, { now });
    const n = nextAction(r.progress, parseConfig(CONFIG_DEFAULTS), now);
    console.log(JSON.stringify({ errors: r.errors, storedDay: ymd(new Date(r.progress.lastSentAt)), day, overdueDays: n.overdueDays }));
  `;
  for (const TZ of ['UTC', 'Asia/Karachi', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }));
    assert.deepEqual(out.errors, [], TZ);
    assert.equal(out.storedDay, out.day, `${TZ}: stored day`);
    assert.equal(out.overdueDays, 0, `${TZ}: step 2 sent 3 days ago is due today (gap 3)`);
  }
});

// ------------------------------------------------------------------ API: Log backfill

async function setup() {
  const store = memoryStore();
  await store.init();
  const server = http.createServer(createApp({ store, env: {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  return { store, call, close: () => new Promise((r) => server.close(r)) };
}

// What the import dialog sends for a validated row.
const payload = (name, r, opts = {}) => {
  const { progress, errors } = resolve(r, opts);
  assert.deepEqual(errors, [], name);
  return {
    name, problem: 'outdated',
    status: progress.status, track: 'cold', step: progress.step, account: progress.account,
    lastSentAt: progress.lastSentAt, repliedAt: progress.repliedAt,
  };
}

test('import backfills the Log: one row per message already sent, latest dated, earlier blank, all "imported"', async () => {
  const { store, call, close } = await setup();
  try {
    const r = await call('POST', '/api/leads', { leads: [
      payload('Three Sent', raw('active', '3', day(2), 'A')),
      payload('One Sent', raw('active', '1', day(5), 'B')),
      payload('Done Lead', raw('done', '4', day(20), 'A')),
      payload('Not Yet', raw('queued', '0', '', '')),
      { name: 'Old Style Six Col', problem: 'nosite' },
    ] });
    assert.equal(r.status, 200);
    assert.equal(r.json.created.length, 5);
    assert.equal(r.json.logged, 3 + 1 + 4);

    const leads = Object.fromEntries(r.json.created.map((l) => [l.name, l]));
    const rows = await store.getRows('Log');
    assert.equal(rows.length, 8);
    assert.ok(rows.every((x) => x.length === 6), 'the Log keeps its 6 columns');
    const forLead = (name) => rows.filter((x) => x[1] === leads[name].id);

    const three = forLead('Three Sent');
    assert.deepEqual(three.map((x) => Number(x[4])), [0, 1, 2], 'steps 0, 1, 2');
    assert.deepEqual(three.map((x) => x[5]), ['imported', 'imported', 'imported']);
    assert.deepEqual(three.map((x) => x[3]), ['cold', 'cold', 'cold']);
    assert.deepEqual(three.map((x) => x[2]), ['A', 'A', 'A']);
    assert.deepEqual(three.map((x) => x[0]), ['', '', leads['Three Sent'].lastSentAt], 'only the latest message has a date');
    assert.equal(ymd(new Date(three[2][0])), day(2));

    assert.equal(forLead('One Sent').length, 1);
    assert.equal(forLead('One Sent')[0][2], 'B');
    assert.equal(forLead('Done Lead').length, 4);
    assert.equal(forLead('Not Yet').length, 0);
    assert.equal(forLead('Old Style Six Col').length, 0, 'old 6-column imports add nothing to the Log');
    assert.equal((await store.getRows('Messages')).length, 0, 'no sent-message text is invented');

    // lead fields were stored exactly as given
    const l = leads['Three Sent'];
    assert.deepEqual([l.status, l.track, l.step, l.account], ['active', 'cold', 3, 'A']);
    const old = leads['Old Style Six Col'];
    assert.deepEqual([old.status, old.track, old.step, old.account, old.lastSentAt], ['queued', 'cold', 0, '', '']);

    // importing the same names again creates nothing and adds no Log rows
    const again = await call('POST', '/api/leads', { leads: [payload('Three Sent', raw('active', '3', day(2), 'A'))] });
    assert.deepEqual([again.json.created.length, again.json.skipped.length, again.json.logged], [0, 1, 0]);
    assert.equal((await store.getRows('Log')).length, 8);
  } finally { await close(); }
});

test('the API refuses forged imported rows and future dates', async () => {
  const { call, close } = await setup();
  try {
    const lead = (await call('POST', '/api/leads', { leads: [{ name: 'X' }] })).json.created[0];
    const entry = { leadId: lead.id, account: 'A', track: 'cold', step: 0 };
    assert.equal((await call('POST', '/api/log', { ...entry, channel: 'imported' })).status, 400);
    assert.equal((await call('POST', '/api/log', { ...entry, channel: 'ig' })).status, 200);
    const future = new Date(Date.now() + 5 * 86400_000).toISOString();
    assert.equal((await call('POST', '/api/leads', { leads: [{ name: 'Future', lastSentAt: future, step: 1, status: 'active', account: 'A' }] })).status, 400);
    assert.equal((await call('PATCH', `/api/leads/${lead.id}`, { lastSentAt: future })).status, 400);
    assert.equal((await call('POST', '/api/leads', { leads: [{ name: 'Bad step', step: 5 }] })).status, 400);
  } finally { await close(); }
});

test('GET /api/log only returns dated rows, so blank-date history never reaches the browser', async () => {
  const { call, close } = await setup();
  try {
    await call('POST', '/api/leads', { leads: [payload('Hist', raw('active', '3', day(2), 'A'))] });
    const log = (await call('GET', '/api/log')).json.log;
    assert.equal(log.length, 1);
    assert.equal(log[0].channel, 'imported');
    assert.equal(log[0].step, 2);
  } finally { await close(); }
});

// ------------------------------------------------------------------ Today / meters

test('imported leads appear in Today on their real due dates, with the right step label', async () => {
  const { call, close } = await setup();
  try {
    await call('POST', '/api/leads', { leads: [
      payload('Overdue Two', raw('active', '2', day(8), 'A')),       // gap 3 -> due 5 days ago
      payload('Due Today One', raw('active', '1', day(2), 'B')),     // gap 2 -> due today
      payload('Not Due Three', raw('active', '3', day(1), 'A')),     // gap 4 -> due in 3 days
      payload('Sent Today', raw('active', '1', ymd(NOW), 'A')),      // due in 2 days
      payload('Awaiting Reply', raw('replied', '1', day(4), 'A')),
      payload('Finished', raw('done', '4', day(30), 'A')),
      payload('Fresh', raw('queued', '0', '', '')),
    ] });
    const leads = (await call('GET', '/api/leads')).json.leads;
    const log = (await call('GET', '/api/log')).json.log;
    const t = buildToday(leads, log, cfg, NOW);

    assert.deepEqual(t.followups.map((x) => x.lead.name), ['Overdue Two', 'Due Today One'], 'overdue first, only what is due');
    assert.equal(t.followups[0].due.overdueDays, 5);
    assert.equal(t.followups[1].due.overdueDays, 0);
    assert.equal(getStage(t.followups[0].lead).label, 'Follow-up 2 of 3');
    assert.equal(getStage(t.followups[1].lead).label, 'Follow-up 1 of 3');
    assert.equal(getStage(leads.find((l) => l.name === 'Not Due Three')).label, 'Follow-up 3 of 3 · last');
    assert.deepEqual(t.replies.map((l) => l.name), ['Awaiting Reply']);
    assert.deepEqual(t.newDMs.map((x) => x.lead.name), ['Fresh']);
    assert.ok(![...t.followups.map((x) => x.lead.name), ...t.replies.map((l) => l.name)].includes('Finished'));
  } finally { await close(); }
});

test('imported log rows never count toward today\'s meters, sent list, progress ring or streak, even when dated today', async () => {
  const { call, close } = await setup();
  try {
    await call('POST', '/api/leads', { leads: [
      payload('Sent Today A', raw('active', '1', ymd(NOW), 'A')),
      payload('Three Today B', raw('active', '3', ymd(NOW), 'B')),
      payload('Earlier', raw('active', '2', day(1), 'A')),
      ...Array.from({ length: 12 }, (_, i) => ({ name: `Queued ${i}`, problem: 'outdated' })),
    ] });
    const leads = (await call('GET', '/api/leads')).json.leads;
    const log = (await call('GET', '/api/log')).json.log;
    assert.ok(log.length >= 3 && log.every((r) => r.channel === 'imported'));
    assert.ok(log.some((r) => ymd(new Date(r.timestamp)) === ymd(NOW)), 'there are imported rows dated today');
    assert.equal(netSends(log).length, 0);

    let t = buildToday(leads, log, cfg, NOW);
    assert.deepEqual([t.meters.A.used, t.meters.B.used, t.meters.followups.sent], [0, 0, 0]);
    assert.equal(t.sentToday.length, 0);
    assert.equal(t.progress.sent, 0);
    assert.deepEqual(t.remaining, { A: 10, B: 10 }, 'the full daily allowance is still open');
    assert.equal(t.newDMs.length, 12);
    assert.deepEqual(weekStats(leads, log, NOW), { streak: 0, sent: 0, replies: 0, won: 0 });

    // a message sent through the app today still counts, alone
    const real = { timestamp: NOW.toISOString(), leadId: leads[0].id, account: 'A', track: 'cold', step: 0, channel: 'ig' };
    t = buildToday(leads, [...log, real], cfg, NOW);
    assert.deepEqual([t.meters.A.used, t.meters.B.used], [1, 0]);
    assert.equal(t.sentToday.length, 1);
    assert.equal(weekStats(leads, [...log, real], NOW).streak, 1);

    // an undo only cancels real sends, never an imported row
    const undo = { ...real, timestamp: new Date(NOW.getTime() + 1000).toISOString(), channel: 'undo' };
    const importedStep0 = log.find((r) => r.step === 0);
    t = buildToday(leads, [...log, { ...undo, leadId: importedStep0.leadId }], cfg, NOW);
    assert.equal(netSends([...log, { ...undo, leadId: importedStep0.leadId }]).length, 0);
    assert.equal(t.meters.A.used, 0);
  } finally { await close(); }
});

test('"Contacted" counts imported leads (from the lead fields, which the import sets)', async () => {
  const { call, close } = await setup();
  try {
    await call('POST', '/api/leads', { leads: [
      payload('Contacted 1', raw('active', '1', day(3), 'A')),
      payload('Contacted 2', raw('done', '4', day(40), 'B')),
      payload('Contacted 3', raw('replied', '2', day(6), 'A')),
      payload('Not contacted', raw('queued', '0', '', '')),
      { name: 'Six col', problem: 'nosite' },
    ] });
    const leads = (await call('GET', '/api/leads')).json.leads;
    const stats = pipelineStats(leads);
    assert.equal(stats.leads, 5);
    assert.equal(stats.contacted, 3);
    assert.equal(stats.replied, 1);
    assert.equal(stats.rate, 33);
  } finally { await close(); }
});
