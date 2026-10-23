import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, getStage, applySend, quickReplies, toEmailText } from '../client/src/lib/messages.js';
import { buildToday, parseConfig, dueInfo, netSends } from '../client/src/lib/schedule.js';
import { parsePaste, cleanUrl, guessProblem } from '../client/src/lib/importer.js';

const cfg = parseConfig({ cap: '10', gaps: '2,3,4', setupPrice: '$199', monthlyPrice: '$29' });
const lead = (o = {}) => ({
  id: 'x', name: 'Bounce Co', city: '', owner: '', fb: '', ig: '', email: '', site: 'https://www.bounce.com/x?fbclid=1',
  problem: 'outdated', hook: '', note: '', status: 'queued', track: 'cold', step: 0, account: '', lastSentAt: '',
  repliedAt: '', demoLink: '', verified: false, order: 1, ...o,
});
const NOW = new Date(2026, 9, 23, 12, 0, 0);
const daysAgo = (n, h = 10) => new Date(2026, 9, 23 - n, h).toISOString();

test('pitch: greeting, hook fallback, no link, honest wording', () => {
  const noOwner = buildMessage(getStage(lead()), lead(), cfg);
  assert.match(noOwner, /^Hi!\n/);
  assert.match(noOwner, /I came across Bounce Co and like what you offer\./);
  assert.doesNotMatch(noOwner, /https?:|www\./);
  assert.match(noOwner, /within the hour of you saying yes/);
  assert.doesNotMatch(noOwner, /already (built|made)|I built|I made/i);

  const withOwner = buildMessage(getStage(lead()), lead({ owner: 'Sam Rivera', hook: 'your castle lineup.' }), cfg);
  assert.match(withOwner, /^Hi Sam!/);
  assert.match(withOwner, /love your castle lineup\. /);
});

test('problem sentences', () => {
  const m = (problem, site) => buildMessage(getStage(lead({ problem, site })), lead({ problem, site }), cfg);
  assert.match(m('down', 'https://www.bounce.com/x'), /I tried opening bounce\.com and it wasn't loading/);
  assert.match(m('parked', ''), /'get this domain' page/);
  assert.match(m('nosite', ''), /don't have a website yet/);
  assert.match(m('social', ''), /disappear from the feed/);
  assert.match(m('outdated', 'x.com'), /feels a bit dated/);
});

test('cold sequence: 4 messages then done; never more than 3 follow-ups', () => {
  let l = lead();
  const keys = [];
  for (let i = 0; i < 4; i++) {
    const st = getStage(l);
    keys.push(st.key);
    l = { ...l, ...applySend(l, st, 'A', daysAgo(0)) };
  }
  assert.deepEqual(keys, ['pitch', 'fu1', 'fu2', 'fu3']);
  assert.equal(l.status, 'done');
  assert.equal(l.step, 4);
  assert.equal(getStage(l), null);
});

test('replied flow: permission -> wait -> demo -> nudges -> done', () => {
  let l = lead({ status: 'replied', step: 1, repliedAt: daysAgo(0, 9), lastSentAt: daysAgo(2) });
  assert.equal(getStage(l).key, 'reply');
  assert.match(buildMessage(getStage(l), l, cfg), /photos/);
  l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0, 11)) };
  assert.equal(l.status, 'replied');
  assert.equal(getStage(l).key, 'replyWait');
  assert.equal(getStage(l).sendable, false);

  l.demoLink = 'https://demo.example/abc';
  assert.equal(getStage(l).key, 'demo');
  const demo = buildMessage(getStage(l), l, cfg);
  assert.match(demo, /only you have this link/i);
  assert.match(demo, /\$199 setup \+ \$29\/month/);
  assert.match(demo, /No hard feelings/);
  l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0)) };
  assert.deepEqual([l.track, l.step, l.status], ['demo', 1, 'active']);

  const keys = [];
  for (let i = 0; i < 3; i++) {
    keys.push(getStage(l).key);
    l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0)) };
  }
  assert.deepEqual(keys, ['nudge1', 'nudge2', 'nudge3']);
  assert.equal(l.status, 'done');
  assert.match(buildMessage({ key: 'nudge3' }, l, cfg), /go live/);
});

test('demo link replaces permission message even before it was sent', () => {
  const l = lead({ status: 'replied', repliedAt: daysAgo(0), demoLink: 'https://d.example/1' });
  assert.equal(getStage(l).key, 'demo');
});

test('follow-up gaps come from config and overdue sorts first', () => {
  const a = lead({ id: 'a', status: 'active', step: 1, lastSentAt: daysAgo(2), account: 'A' });
  const b = lead({ id: 'b', status: 'active', step: 2, lastSentAt: daysAgo(3), account: 'A' });
  const c = lead({ id: 'c', status: 'active', step: 3, lastSentAt: daysAgo(3), account: 'B' });
  const d = lead({ id: 'd', status: 'active', step: 1, lastSentAt: daysAgo(1), account: 'B' });
  const e = lead({ id: 'e', status: 'active', step: 1, lastSentAt: daysAgo(6), account: 'B' });
  assert.equal(dueInfo(a, cfg, NOW).isDue, true);
  assert.equal(dueInfo(a, cfg, NOW).overdueDays, 0);
  assert.equal(dueInfo(c, cfg, NOW).isDue, false); // gap after 3rd message is 4 days
  assert.equal(dueInfo(d, cfg, NOW).isDue, false);
  const t = buildToday([a, b, c, d, e], [], cfg, NOW);
  assert.deepEqual(t.followups.map((x) => x.lead.id), ['e', 'a', 'b']);
  assert.equal(t.followups[0].lead.id, 'e'); // most overdue first
  assert.ok(t.followups[0].due.overdueDays > 0);
});

test('daily cap, priority order, A/B default split, undo frees a slot', () => {
  const queued = Array.from({ length: 25 }, (_, i) => lead({
    id: `q${i}`, order: i + 1, problem: i === 24 ? 'down' : i % 2 ? 'outdated' : 'nosite',
  }));
  let t = buildToday(queued, [], cfg, NOW);
  assert.equal(t.newDMs.length, 20);
  assert.equal(t.newDMs[0].lead.id, 'q24'); // down first
  assert.equal(t.newDMs.filter((x) => x.account === 'A').length, 10);
  assert.equal(t.newDMs.filter((x) => x.account === 'B').length, 10);

  const stamp = (h) => new Date(2026, 9, 23, h).toISOString();
  const row = (leadId, account, h, channel = 'ig', step = 0) => ({ timestamp: stamp(h), leadId, account, track: 'cold', step, channel });
  const log = [row('z1', 'A', 8), row('z2', 'A', 9), row('z3', 'B', 9), row('z4', 'A', 10, 'ig', 1)];
  t = buildToday(queued, log, cfg, NOW);
  assert.deepEqual([t.meters.A.used, t.meters.B.used], [2, 1]);
  assert.equal(t.meters.followups.sent, 1);
  assert.equal(t.newDMs.length, 17);
  assert.equal(t.newDMs.filter((x) => x.account === 'A').length, 8);

  const undone = [...log, row('z2', 'A', 11, 'undo')];
  assert.equal(netSends(undone).length, 3);
  t = buildToday(queued, undone, cfg, NOW);
  assert.equal(t.meters.A.used, 1);
  assert.equal(t.newDMs.length, 18);
});

test('yesterday sends do not count against today', () => {
  const y = new Date(2026, 9, 22, 15).toISOString();
  const t = buildToday([], [{ timestamp: y, leadId: 'q', account: 'A', track: 'cold', step: 0, channel: 'ig' }], cfg, NOW);
  assert.equal(t.meters.A.used, 0);
});

test('importer: dedupe, tracking params, email, problem guess', () => {
  const tsv = [
    'Business\tWebsite\tInstagram\tFacebook\tNote\tEmail',
    'Fun Jumps\thttps://funjumps.com/?utm_source=ig&fbclid=abc&keep=1\t@funjumps\t\tsite is down since May\tcontact: hi@funjumps.com',
    'fun   jumps\t\t\t\t\t',
    'Castle Kings\t\t\thttps://facebook.com/castlekings?fbclid=zzz\tposts daily\t',
    'Old Rentals\thttps://oldrentals.net\t\t\tlooks old; reach me Bob@Old.net.\t',
    'Existing Co\t\t\t\t\t',
  ].join('\n');
  const r = parsePaste(tsv, ['existing co']);
  assert.equal(r.rows.length, 5);
  assert.equal(r.skippedDup, 2);
  const [fun, , castle, old] = r.rows;
  assert.equal(fun.site, 'https://funjumps.com/?keep=1');
  assert.equal(fun.ig, 'https://instagram.com/funjumps');
  assert.equal(fun.email, 'hi@funjumps.com');
  assert.equal(fun.problem, 'down');
  assert.equal(castle.fb, 'https://facebook.com/castlekings');
  assert.equal(castle.problem, 'social');
  assert.equal(old.email, 'bob@old.net');
  assert.equal(old.problem, 'outdated');
  assert.equal(cleanUrl('n/a'), '');
  assert.equal(guessProblem({ site: '', note: '' }), 'nosite');
  assert.equal(guessProblem({ site: 'x.com', note: 'GoDaddy parked page' }), 'parked');
});

test('quick replies and email format', () => {
  const where = quickReplies(parseConfig({ studio: 'Pixel Co' })).find((q) => q.title === 'Where are you based?');
  assert.match(where.text, /Pakistan/);
  assert.match(where.text, /remote web design studio/);
  const l = lead();
  const em = toEmailText(getStage(l), l, { yourName: 'Alex', studio: 'Pixel Co', address: '1 Main St' }, 'Body');
  assert.match(em, /^Subject: A free website demo for Bounce Co\n\nBody/);
  assert.match(em, /Alex\nPixel Co\n1 Main St/);
  assert.match(em, /unsubscribe/);
});
