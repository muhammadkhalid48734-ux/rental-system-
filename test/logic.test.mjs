import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessage, getStage, applySend, quickReplies, toEmailText, plans, planPrice, allowedAmounts, recommendReply, emailSubject,
  genericHookWords, hookWordCount, TERMS_LINE, REPLY_ENDING, DEMO_CLOSING,
} from '../client/src/lib/messages.js';
import { validateDraft } from '../server/validate.js';
import { buildToday, parseConfig, dueInfo, netSends, weekStats } from '../client/src/lib/schedule.js';
import { parsePaste, cleanUrl, guessProblem } from '../client/src/lib/importer.js';

import { CONFIG_DEFAULTS } from '../server/schema.js';
const cfg = parseConfig({ ...CONFIG_DEFAULTS });
const lead = (o = {}) => ({
  id: 'x', name: 'Bounce Co', city: '', owner: '', fb: '', ig: '', email: '', site: 'https://www.bounce.com/x?fbclid=1',
  problem: 'outdated', hook: '', note: '', status: 'queued', track: 'cold', step: 0, account: '', lastSentAt: '',
  repliedAt: '', demoLink: '', verified: false, order: 1, ...o,
});
const NOW = new Date(2026, 9, 23, 12, 0, 0);
const daysAgo = (n, h = 10) => new Date(2026, 9, 23 - n, h).toISOString();

test('pitch: greeting, hook fallback, no link, no price, no timing, honest wording', () => {
  const noOwner = buildMessage(getStage(lead()), lead(), cfg);
  assert.match(noOwner, /^Hi!\n/);
  assert.match(noOwner, /I came across Bounce Co and like what you offer\./);
  assert.match(noOwner, /I run a small web design studio and I'd be glad to build you a free demo of a modern site with a gallery and a booking request form\. No obligation\. Want me to put one together\?$/);
  assert.doesNotMatch(noOwner, /https?:|www\./);
  assert.doesNotMatch(noOwner, /already (built|made)|I built|I made|free website|automat|monthly|\$\d/i);

  const withOwner = buildMessage(getStage(lead()), lead({ owner: 'Sam Rivera', hook: 'your castle lineup.' }), cfg);
  assert.match(withOwner, /^Hi Sam!/);
  assert.match(withOwner, /I came across Bounce Co and noticed your castle lineup\. /);
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
  assert.ok(buildMessage(getStage(l), l, cfg).endsWith("You'll have it shortly."));
  l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0, 11)) };
  assert.equal(l.status, 'replied');
  assert.equal(getStage(l).key, 'replyWait');
  assert.equal(getStage(l).sendable, false);

  l.demoLink = 'https://demo.example/abc';
  assert.equal(getStage(l).key, 'demo');
  const demo = buildMessage(getStage(l), l, cfg);
  assert.match(demo, /Only you have this link, and nothing is public\./);
  assert.match(demo, /The calendar and the form in this version are for show, so you can see the layout\./);
  assert.match(demo, /colors, wording, items, prices or photos/);
  assert.ok(demo.includes('https://demo.example/abc'));
  assert.ok(demo.endsWith("If you'd like to know how it works and what it costs, just ask."));
  assert.doesNotMatch(demo, /\$|Recommended|setup|monthly|cancel anytime/i, 'no prices and no package list in the delivery message');
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
  const where = quickReplies(parseConfig({ ...CONFIG_DEFAULTS, studio: 'Pixel Co' })).find((q) => q.title === 'Where are you based?');
  assert.match(where.text, /Pakistan/);
  assert.match(where.text, /remote web design studio \(Pixel Co\) based in Pakistan/);
  const l = lead();
  const em = toEmailText(getStage(l), l, { yourName: 'Alex', studio: 'Pixel Co', address: '1 Main St' }, 'Body');
  assert.match(em, /^Subject: A free demo for Bounce Co\n\nBody/);
  assert.match(em, /Alex\nPixel Co\n1 Main St/);
  assert.match(em, /unsubscribe/);
});

test('progress ring numbers and streak', () => {
  const queued = Array.from({ length: 4 }, (_, i) => lead({ id: `p${i}`, order: i + 1 }));
  const at = (dayOffset, h, leadId = 'z') => ({ timestamp: new Date(2026, 9, 23 + dayOffset, h).toISOString(), leadId, account: 'A', track: 'cold', step: 0, channel: 'ig' });
  let t = buildToday(queued, [], cfg, NOW);
  assert.deepEqual([t.progress.sent, t.progress.left, t.progress.goal, t.progress.pct, t.progress.complete], [0, 4, 4, 0, false]);
  t = buildToday(queued.slice(1), [at(0, 9, 'p0')], cfg, NOW);
  assert.deepEqual([t.progress.sent, t.progress.left, t.progress.pct, t.progress.complete], [1, 3, 25, false]);
  t = buildToday([], [at(0, 9)], cfg, NOW);
  assert.equal(t.progress.complete, true);
  assert.equal(buildToday([], [], cfg, NOW).progress.complete, false);

  const log = [at(-2, 9), at(-1, 9), at(-1, 10)];
  assert.equal(weekStats([], log, NOW).streak, 2); // today empty doesn't break it
  assert.equal(weekStats([], [...log, at(0, 8)], NOW).streak, 3);
  assert.equal(weekStats([], [at(-3, 9)], NOW).streak, 0);
  assert.equal(weekStats([], [at(-9, 9), at(-1, 9)], NOW).sent, 1);
});

test('autoMark is gone from config and parsed settings', () => {
  assert.equal('autoMark' in CONFIG_DEFAULTS, false);
  assert.equal(parseConfig({ ...CONFIG_DEFAULTS }).autoMark, undefined);
  assert.equal('setupPrice' in CONFIG_DEFAULTS, false);
});

test('plans: Get Found $59, Get Booked $99 (Recommended), Get Paid $179; founding flag defaults off', () => {
  assert.equal('pkg1Name' in CONFIG_DEFAULTS, false);
  assert.equal('demoTurnaround' in CONFIG_DEFAULTS, false);
  assert.equal(CONFIG_DEFAULTS.foundingOffer, 'false');
  const p = plans(CONFIG_DEFAULTS);
  assert.deepEqual(p.map((x) => [x.name, x.price, x.founding, x.recommended]), [
    ['Get Found', '59', '39', false], ['Get Booked', '99', '69', true], ['Get Paid', '179', '129', false],
  ]);
  assert.deepEqual(p.map((x) => planPrice(x, CONFIG_DEFAULTS)), ['$59/month', '$99/month', '$179/month']);
  const on = { ...CONFIG_DEFAULTS, foundingOffer: 'true' };
  assert.deepEqual(plans(on).map((x) => planPrice(x, on)), [
    '$39/month for the first year, then $59/month', '$69/month for the first year, then $99/month', '$129/month for the first year, then $179/month',
  ]);
  assert.deepEqual([...allowedAmounts(on)].sort((a, b) => a - b), [39, 59, 69, 99, 129, 179]);
  assert.ok(p.every((x) => x.note.length > 20), 'each plan has an editable one-line description');
});

test('terms line and the recommended-plan reply', () => {
  assert.equal(TERMS_LINE, 'The website build is free. 3-month minimum, then cancel anytime. Your domain, photos and text always belong to you.');
  const mid = recommendReply(CONFIG_DEFAULTS);
  assert.match(mid, /I'd suggest Get Booked at \$99\/month/);
  assert.ok(mid.includes(TERMS_LINE));
  assert.match(mid, /Get Found is \$59\/month/);
  assert.match(mid, /Get Paid is \$179\/month/);
  const low = recommendReply(CONFIG_DEFAULTS, 1);
  assert.match(low, /suggest Get Found at \$59\/month/);
  assert.doesNotMatch(low, /cheaper|start smaller/);
  assert.match(low, /Get Booked is \$99\/month/);
  const top = recommendReply(CONFIG_DEFAULTS, 3);
  assert.match(top, /Get Booked is \$99\/month if you'd like to start smaller/);
  assert.doesNotMatch(top, /more built in/);
  assert.match(recommendReply({ ...CONFIG_DEFAULTS, foundingOffer: 'true' }), /\$69\/month for the first year, then \$99\/month/);
});

test('quick replies: the new set, in order, with the exact wording that was asked for', () => {
  const q = quickReplies(cfg);
  assert.deepEqual(q.map((x) => x.title), [
    'How much?', 'Where are you based?', 'Do I own the site?', 'Facebook is enough', 'Too expensive', "I'll think about it",
    'How do reviews work?', 'How does double-booking protection work?', 'What if I stop?', 'Not interested',
  ]);
  const by = Object.fromEntries(q.map((x) => [x.title, x]));
  const [step1, step2, early] = by['How much?'].parts;
  assert.match(step1.text, /how many items do you rent out, and how do bookings come in right now/);
  assert.ok(step2.plan && step2.text.includes(TERMS_LINE));
  assert.equal(early.text, 'Plans start at $59/month and the website build is free. The demo is free and you pay nothing unless you want it live.');
  assert.match(by['Where are you based?'].text, /Pakistan/);
  assert.match(by['Where are you based?'].text, /video call or send my portfolio/);
  assert.match(by['Do I own the site?'].text, /domain, photos and text/);
  assert.match(by['Too expensive'].text, /Get Found, is \$59\/month/);
  assert.ok(by['Too expensive'].text.includes(TERMS_LINE));
  assert.match(by['How do reviews work?'].text, /every customer gets the link to your Google reviews/);
  assert.match(by['How do reviews work?'].text, /no filtering/i);
  assert.match(by['How do reviews work?'].text, /never pay for reviews/);
  assert.match(by['How does double-booking protection work?'].text, /blocked when you confirm a booking or when the deposit arrives/);
  assert.match(by['How does double-booking protection work?'].text, /Pending requests don't block/);
  assert.match(by['How does double-booking protection work?'].text, /24-hour hold/);
  assert.match(by['What if I stop?'].text, /site files/);
  assert.match(by['What if I stop?'].text, /domain, photos and text stay yours/);
  const founding = quickReplies({ ...cfg, foundingOffer: 'true' }).find((x) => x.title === 'How much?').parts[2].text;
  assert.match(founding, /^Plans start at \$39\/month for the first year/);
});

test('no template and no quick reply contains the old delivery-time wording or a delivery promise', () => {
  const c = parseConfig(CONFIG_DEFAULTS);
  const texts = [];
  for (const key of ['pitch', 'fu1', 'fu2', 'fu3', 'reply', 'nudge1', 'nudge2', 'nudge3']) {
    for (const problem of ['outdated', 'down', 'parked', 'nosite', 'social']) texts.push(buildMessage({ key }, lead({ problem, hook: 'the blue and yellow castle photos' }), c));
  }
  texts.push(buildMessage({ key: 'demo' }, lead({ demoLink: 'https://d.example/x' }), c));
  for (const x of quickReplies(c)) texts.push(...(x.parts ? x.parts.map((p) => p.text) : [x.text]));
  for (const t of texts) {
    assert.doesNotMatch(t, /support hours|saying yes|next morning|within the hour|US time/i);
  }
  // the offline templates satisfy our own validator, so an offline message is as safe as a generated one
  const kinds = { pitch: 'cold', fu1: 'followup1', fu2: 'followup2', fu3: 'followup3', reply: 'replyAck', nudge1: 'demoNudge1', nudge2: 'demoNudge2', nudge3: 'demoNudge3' };
  for (const [key, kind] of Object.entries(kinds)) {
    for (const problem of ['outdated', 'down', 'parked', 'nosite', 'social']) {
      const l = lead({ problem, owner: 'Sam', hook: 'the blue and yellow castle photos', site: 'https://sunnydaybounce.example' });
      const msg = buildMessage({ key }, l, c);
      const issues = validateDraft(kind, msg, { lead: l }).filter((x) => !/already exists/.test(x));
      assert.deepEqual(issues, [], `${key}/${problem}: ${msg}`);
    }
  }
  const dl = lead({ demoLink: 'https://d.example/x' });
  assert.deepEqual(validateDraft('demo', buildMessage({ key: 'demo' }, dl, c).replace(dl.demoLink, '[[LINK]]'), { lead: dl }), []);
});

test('first-message template is 35-90 words for every problem with a hook of up to 8 words, and with none', () => {
  for (const problem of ['outdated', 'down', 'parked', 'nosite', 'social']) {
    for (const hook of ['', 'the blue and yellow castle photos', 'your handmade balloon garlands that match every theme']) {
      const l = lead({ problem, owner: 'Jamie', hook, site: 'https://sunnydaybounce.example', name: 'Sunny Day Bounce Co' });
      const n = buildMessage({ key: 'pitch' }, l, cfg).split(/\s+/).length;
      assert.ok(n >= 35 && n <= 90, `${problem}/${hook}: ${n} words`);
    }
  }
});

test('email subjects say "free demo", never "free website"', () => {
  assert.equal(emailSubject({ key: 'pitch' }, lead()), 'A free demo for Bounce Co');
  assert.equal(emailSubject({ key: 'fu1' }, lead()), 'Re: A free demo for Bounce Co');
  assert.equal(REPLY_ENDING, "You'll have it shortly.");
  assert.equal(DEMO_CLOSING, "If you'd like to know how it works and what it costs, just ask.");
});

test('hook helpers: 12-word limit and generic praise words', () => {
  assert.equal(hookWordCount(''), 0);
  assert.equal(hookWordCount('  the blue   and yellow castle photos '), 6);
  assert.deepEqual(genericHookWords('your great castle and amazing arches'), ['great', 'amazing']);
  assert.deepEqual(genericHookWords('the Best bounce house, wonderful!'), ['best', 'wonderful']);
  assert.deepEqual(genericHookWords('the blue and yellow castle photos'), []);
  assert.deepEqual(genericHookWords('greatest hits'), [], 'whole words only');
});

test('header tasks = new DMs + follow-ups: done today vs still to do (replies are not tasks)', () => {
  const at = (h, leadId, track, step, channel = 'ig', account = 'A') => ({ timestamp: new Date(2026, 9, 23, h).toISOString(), leadId, account, track, step, channel });
  const queued = Array.from({ length: 5 }, (_, i) => lead({ id: `n${i}`, order: i + 1 }));
  const due = [
    lead({ id: 'f1', status: 'active', step: 1, lastSentAt: daysAgo(3), account: 'A' }),
    lead({ id: 'f2', status: 'active', step: 2, lastSentAt: daysAgo(5), account: 'B' }),
  ];
  const reply = lead({ id: 'r1', status: 'replied', step: 1, repliedAt: daysAgo(0, 9), lastSentAt: daysAgo(2) });
  let t = buildToday([...queued, ...due, reply], [], cfg, NOW);
  assert.deepEqual(t.progress.tasks, { done: 0, left: 7, total: 7 }, '5 new + 2 follow-ups; the reply is not a task');
  assert.equal(t.progress.todo.replies, 1);

  const log = [
    at(8, 'x1', 'cold', 0),            // new DM            -> task
    at(9, 'x2', 'cold', 1),            // follow-up         -> task
    at(10, 'x3', 'demo', 1),           // demo nudge        -> task
    at(11, 'x4', 'reply', 0),          // photo-permission  -> not a task
    at(12, 'x5', 'demo', 0),           // demo delivery     -> not a task
    { ...at(13, 'x6', 'cold', 0, 'imported'), timestamp: NOW.toISOString() }, // imported history -> never counted
  ];
  t = buildToday([...queued.slice(2), ...due, reply], log, cfg, NOW);
  assert.deepEqual(t.progress.tasks, { done: 3, left: 5, total: 8 });

  // undoing a send removes it from the count
  t = buildToday([...queued.slice(2), ...due, reply], [...log, { ...at(14, 'x1', 'cold', 0, 'undo') }], cfg, NOW);
  assert.equal(t.progress.tasks.done, 2);

  t = buildToday([], [], cfg, NOW);
  assert.deepEqual(t.progress.tasks, { done: 0, left: 0, total: 0 });
});
