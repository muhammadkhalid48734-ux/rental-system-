import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMessage, getStage, applySend, quickReplies, toEmailText, plans, planPrice, allowedAmounts, recommendReply, emailSubject,
  genericHookWords, hookWordCount, TERMS_LINE, DEMO_CLOSING, priceLine, replyBody, startsAt, goLiveReply,
} from '../client/src/lib/messages.js';
import { amountsIn, hasDeliveryPromise, validateDraft, validateReplyFinal } from '../server/validate.js';
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
  assert.match(noOwner, /I run a small web design studio and could build you a free demo of a simple site where parents can see your rentals and send a booking request\. Nothing gets booked without you, you approve every request\. No obligation\. Want me to put one together\?$/);
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
  assert.match(m('social', ''), /slide down the feed/);
  assert.equal(
    m('outdated', 'x.com').split('\n\n')[1].replace(/^I came across Bounce Co and like what you offer\. /, ''),
    'I took a look at your website on my phone and it could be easier for parents to browse your rentals.',
  );
  for (const p of ['outdated', 'down', 'parked', 'nosite', 'social']) {
    assert.doesNotMatch(m(p, 'x.com'), /check dates|book online/i, `${p}: no unverified booking claim`);
  }
});

test('pitch never contains automation wording, for every problem, hook and owner', () => {
  for (const problem of ['outdated', 'down', 'parked', 'nosite', 'social']) {
    for (const hook of ['', 'the blue and yellow castle photos']) {
      const l = lead({ problem, hook, owner: 'Jamie' });
      const msg = buildMessage({ key: 'pitch' }, l, cfg);
      assert.doesNotMatch(msg, /automat/i, `${problem}/${hook}`);
      assert.match(msg, /Nothing gets booked without you, you approve every request\./);
      assert.match(msg, /free demo of a simple site where parents can see your rentals and send a booking request/);
      assert.match(msg, /No obligation\. Want me to put one together\?$/);
    }
  }
});

test('follow-ups: bump, new Google reason with approval, polite last note', () => {
  const l = lead({ owner: 'Sam' });
  const fu1 = buildMessage({ key: 'fu1' }, l, cfg);
  const fu2 = buildMessage({ key: 'fu2' }, l, cfg);
  const fu3 = buildMessage({ key: 'fu3' }, l, cfg);
  assert.match(fu1, /in case it got buried/);
  assert.match(fu1, /free demo/);
  assert.match(fu1, /no pressure/);
  assert.ok(fu1.endsWith('?'));
  assert.match(fu2, /many parents search Google before they message anyone/);
  assert.match(fu2, /request form/);
  assert.match(fu2, /date and item/);
  assert.match(fu2, /you still approve every request/);
  assert.ok(fu2.endsWith('Want to see a free demo?'));
  assert.match(fu3, /last note/);
  assert.doesNotMatch(fu3, /free demo|want me to|\?/i, 'no pitch in the last note');
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
  const reply = buildMessage(getStage(l), l, cfg);
  assert.ok(reply.endsWith('what are your top 3 rentals?'));
  assert.ok(reply.includes(priceLine(cfg)), 'price line from Config');
  assert.match(reply, /only use photos from your page with your OK/);
  assert.match(reply, /nothing goes live without your approval/);
  assert.doesNotMatch(reply, /shortly/i);
  l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0, 11)) };
  assert.equal(l.status, 'replied');
  assert.equal(getStage(l).key, 'replyWait');
  assert.equal(getStage(l).sendable, false);

  l.demoLink = 'https://demo.example/abc';
  assert.equal(getStage(l).key, 'demo');
  const demo = buildMessage(getStage(l), l, cfg);
  assert.match(demo, /Only you have this link\. Photos and info are samples for now\./);
  assert.ok(demo.includes('https://demo.example/abc'));
  assert.ok(demo.endsWith('Which rental should be first on the page?'), 'the demo message ends with a question');
  assert.doesNotMatch(demo, /video/i, 'no video line without a video');
  assert.doesNotMatch(demo, /\$|Recommended|setup|monthly|cancel anytime/i, 'no prices and no package list in the delivery message');
  const withVideo = buildMessage(getStage({ ...l, demoVideo: 'https://video.example/v' }), { ...l, demoVideo: 'https://video.example/v' }, cfg);
  assert.match(withVideo, /Here's a quick video of how a customer would send you a request: https:\/\/video\.example\/v\n\nWhich rental should be first on the page\?$/);
  l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0)) };
  assert.deepEqual([l.track, l.step, l.status], ['demo', 1, 'active']);

  const keys = [];
  for (let i = 0; i < 3; i++) {
    keys.push(getStage(l).key);
    l = { ...l, ...applySend(l, getStage(l), 'A', daysAgo(0)) };
  }
  assert.deepEqual(keys, ['nudge1', 'nudge2', 'nudge3']);
  assert.equal(l.status, 'done');
  const n = (key) => buildMessage({ key }, lead({ owner: 'Sam' }), cfg);
  assert.equal(n('nudge1'), "Hi Sam! Did the demo open okay on your phone? Tell me which rental people ask about most and I'll put it first.");
  assert.equal(n('nudge2'), "Hi Sam! Anything you'd change? I can swap photos, items, prices or colors, whatever makes it feel like yours.");
  assert.equal(n('nudge3'), 'Hi Sam! No pressure at all. Should I keep your demo saved for spring, or close it out? Either answer is fine.');
  for (const k of ['nudge1', 'nudge2', 'nudge3']) {
    assert.doesNotMatch(n(k), /https?:|\$\d/, `${k}: no link, no price`);
    assert.equal(hasDeliveryPromise(n(k)), false, `${k}: no timing promise`);
  }
});

test('demo sending keeps the video link on the lead', () => {
  const l = lead({ status: 'replied', repliedAt: daysAgo(0), demoLink: 'https://d.example/1', demoVideo: 'https://v.example/1' });
  assert.equal(applySend(l, getStage(l), 'A', daysAgo(0)).demoVideo, 'https://v.example/1');
  assert.equal('demoVideo' in applySend({ ...l, demoVideo: '' }, getStage(l), 'A', daysAgo(0)), false);
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

test('daily cap, priority order, A/B/C default split, undo frees a slot', () => {
  const queued = Array.from({ length: 35 }, (_, i) => lead({
    id: `q${i}`, order: i + 1, problem: i === 34 ? 'down' : i % 2 ? 'outdated' : 'nosite',
  }));
  let t = buildToday(queued, [], cfg, NOW);
  assert.equal(t.newDMs.length, 30);
  assert.equal(t.newDMs[0].lead.id, 'q34'); // down first
  assert.equal(t.newDMs.filter((x) => x.account === 'A').length, 10);
  assert.equal(t.newDMs.filter((x) => x.account === 'B').length, 10);
  assert.equal(t.newDMs.filter((x) => x.account === 'C').length, 10);

  const stamp = (h) => new Date(2026, 9, 23, h).toISOString();
  const row = (leadId, account, h, channel = 'ig', step = 0) => ({ timestamp: stamp(h), leadId, account, track: 'cold', step, channel });
  const log = [row('z1', 'A', 8), row('z2', 'A', 9), row('z3', 'B', 9), row('z4', 'A', 10, 'ig', 1)];
  t = buildToday(queued, log, cfg, NOW);
  assert.deepEqual([t.meters.A.used, t.meters.B.used, t.meters.C.used], [2, 1, 0]);
  assert.equal(t.meters.followups.sent, 1);
  assert.equal(t.newDMs.length, 27);
  assert.equal(t.newDMs.filter((x) => x.account === 'A').length, 8);

  const undone = [...log, row('z2', 'A', 11, 'undo')];
  assert.equal(netSends(undone).length, 3);
  t = buildToday(queued, undone, cfg, NOW);
  assert.equal(t.meters.A.used, 1);
  assert.equal(t.newDMs.length, 28);
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
    'How much?', 'Is it really free?', "What's the catch?", 'What do you need from me?', 'Where are you based?', 'Do I own the site?', 'Facebook is enough', 'Too expensive', "I'll think about it",
    'Go live', 'How do reviews work?', 'How does double-booking protection work?', 'What if I stop?', 'Not interested',
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
  texts.push(buildMessage({ key: 'demo' }, lead({ demoLink: 'https://d.example/x', demoVideo: 'https://v.example/1' }), c));
  for (const x of quickReplies(c)) texts.push(...(x.parts ? x.parts.map((p) => p.text) : [x.text]));
  for (const t of texts) {
    assert.doesNotMatch(t, /support hours|saying yes|next morning|within the hour|US time|shortly/i);
  }
  // every outgoing template is free of timing promises (the double-booking reply describes a 24-hour hold feature)
  for (const t of texts.filter((x) => !/24-hour hold/.test(x))) assert.equal(hasDeliveryPromise(t), false, t);
  // the offline templates satisfy our own validator, so an offline message is as safe as a generated one
  const kinds = { pitch: 'cold', fu1: 'followup1', fu2: 'followup2', fu3: 'followup3', nudge1: 'demoNudge1', nudge2: 'demoNudge2', nudge3: 'demoNudge3' };
  for (const [key, kind] of Object.entries(kinds)) {
    for (const problem of ['outdated', 'down', 'parked', 'nosite', 'social']) {
      const l = lead({ problem, owner: 'Sam', hook: 'the blue and yellow castle photos', site: 'https://sunnydaybounce.example' });
      const msg = buildMessage({ key }, l, c);
      const issues = validateDraft(kind, msg, { lead: l }).filter((x) => !/already exists/.test(x));
      assert.deepEqual(issues, [], `${key}/${problem}: ${msg}`);
    }
  }
  // the yes-reply: its own text passes the pre-demo rules, the assembled message passes the price-line check
  const rl = lead({ owner: 'Sam' });
  assert.deepEqual(validateDraft('replyAck', replyBody(rl), { lead: rl }), []);
  assert.deepEqual(validateReplyFinal(buildMessage({ key: 'reply' }, rl, c), c), []);
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
  assert.equal(DEMO_CLOSING, 'Which rental should be first on the page?');
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

test('"Is it really free?" and "What do you need from me?": exact wording, no delivery promise, pass the validator', () => {
  const by = Object.fromEntries(quickReplies(cfg).map((x) => [x.title, x.text]));
  assert.equal(by['Is it really free?'], "The demo is free and there's no obligation. The website build is free too. You only pay the monthly plan if you decide to go live, and plans start at $59/month with a 3-month minimum, then cancel anytime. Your domain, photos and text always belong to you.");
  assert.equal(by['What do you need from me?'], 'Just your business name, the area you serve, your items and prices if you have them, and your OK to use a few photos from your page for the demo only. It stays private.');

  for (const title of ['Is it really free?', 'What do you need from me?']) {
    assert.equal(hasDeliveryPromise(by[title]), false, `${title}: delivery-time promise`);
    assert.doesNotMatch(by[title], /support hours|saying yes|next morning|within the hour|US time/i);
  }
  // Run through the draft validator as a follow-up. "What do you need" passes outright. "Is it really free?" quotes
  // the monthly price on purpose (it is a pricing answer), so the price and monthly-plan rules are the only ones that fire.
  assert.deepEqual(validateDraft('followup1', by['What do you need from me?']), []);
  const free = validateDraft('followup1', by['Is it really free?']);
  assert.ok(free.every((x) => /price|monthly/.test(x)), free.join(' | '));

  // with the founding offer on, the starting price follows Config
  const f = Object.fromEntries(quickReplies({ ...cfg, foundingOffer: 'true' }).map((x) => [x.title, x.text]));
  assert.match(f['Is it really free?'], /plans start at \$39\/month for the first year \(\$59\/month after\) with a 3-month minimum/);
  assert.equal(hasDeliveryPromise(f['Is it really free?']), false);
});

test('the login field does not trigger the browser saved-password dropdown', () => {
  const login = fs.readFileSync(new URL('../client/src/components/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /autoComplete="new-password"/);
  assert.doesNotMatch(login, /current-password/);
});

test('yes-reply price line: Config amounts only, founding offer follows Config, ends with the top-3 question', () => {
  const l = lead({ owner: 'Sam' });
  for (const c of [cfg, parseConfig({ ...CONFIG_DEFAULTS, foundingOffer: 'true' }), parseConfig({ ...CONFIG_DEFAULTS, plan1Price: '75', plan1Founding: '' , foundingOffer: 'true' })]) {
    const msg = buildMessage({ key: 'reply' }, l, c);
    const allowed = allowedAmounts(c);
    assert.ok(amountsIn(msg).length > 0);
    assert.ok(amountsIn(msg).every((n) => allowed.has(n)), `${amountsIn(msg)} not all in Config`);
    assert.ok(msg.includes(`plans start at ${startsAt(c)} (3-month minimum, then cancel anytime).`));
    assert.ok(msg.indexOf('Quick heads-up') < msg.indexOf('top 3 rentals?'));
    assert.ok(msg.endsWith('?'));
  }
  assert.equal(startsAt(cfg), '$59/month');
  assert.equal(startsAt({ ...cfg, foundingOffer: 'true' }), '$39/month for the first year ($59/month after)');
  assert.equal(startsAt({ ...cfg, plan1Price: '75', plan1Founding: '', foundingOffer: 'true' }), '$75/month', 'no founding price: regular price');
});

test('"What\'s the catch?" and "Go live": exact wording, Config prices, siteUrl only when set', () => {
  const by = (c) => Object.fromEntries(quickReplies(c).map((x) => [x.title, x.text]));
  assert.equal(by(cfg)["What's the catch?"], "Fair question! The catch is simple: building the site is free, and if you want to keep it live, it's a monthly plan starting at $59/month (3-month minimum, then cancel anytime). If you don't like the demo, you pay nothing. Your domain, photos and text always stay yours.");
  assert.equal(by(cfg)['Go live'], [
    'So glad you like it! To go live, just 3 things:',
    '1. Pick a plan: Get Found $59, Get Booked $99, or Get Paid $179/month',
    '2. Your OK on the photos and text',
    '3. Your domain, or I can help you pick one (it stays in your name)',
    'Which plan feels right?',
  ].join('\n'));
  assert.doesNotMatch(by(cfg)['Go live'], /details|undefined|\{|\[/, 'empty siteUrl: no placeholder');
  const withUrl = by({ ...cfg, siteUrl: 'https://hopbook.example/plans' })['Go live'];
  assert.match(withUrl, /Get Paid \$179\/month \(details: https:\/\/hopbook\.example\/plans\)\n2\./);
  assert.doesNotMatch(by({ ...cfg, siteUrl: 'not a link' })['Go live'], /details/);
  const founding = goLiveReply({ ...cfg, foundingOffer: 'true' });
  assert.match(founding, /Get Found \$39, Get Booked \$69, or Get Paid \$129\/month for the first year \(then \$59, \$99 or \$179\/month\)/);
  const renamed = { ...cfg, plan1Name: 'Starter', plan1Price: '45', plan2Name: 'Pro', plan2Price: '80', plan3Name: 'Max', plan3Price: '150' };
  assert.match(goLiveReply(renamed), /Starter \$45, Pro \$80, or Max \$150\/month/);
  for (const c of [cfg, { ...cfg, foundingOffer: 'true' }, renamed]) {
    const allowed = allowedAmounts(c);
    for (const t of [goLiveReply(c), by(c)["What's the catch?"]]) {
      assert.ok(amountsIn(t).every((n) => allowed.has(n)), t);
      assert.equal(hasDeliveryPromise(t), false, t);
    }
  }
});
