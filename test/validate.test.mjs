import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleDemo, cleanOutput, finalize, validateDemoFinal, validateDraft } from '../server/validate.js';
import { DEMO_CLOSING, REPLY_ENDING } from '../client/src/lib/messages.js';

const LEAD = { hook: 'your sparkle-theme castle', demoLink: 'https://demo.example/abc' };
const GOOD_FIRST =
  "Hey Dana! I came across Hop & Pop Party Rentals and noticed your sparkle-theme castle. When I pulled up your site on my phone, the layout was tiny and hard to tap, so a few parents may give up before asking about dates. I run a small web design studio and I'd be glad to build you a free demo of a modern site with a gallery and a booking request form. No obligation. Want me to put one together?";
const GOOD_DEMO =
  "Hi Dana! Your private demo is ready at [[LINK]]. Only you have this link and nothing is public. The calendar and the form in this version are for show, so you can see the layout. Tell me what to change: colors, wording, items, prices or photos.";
const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
const check = (kind, text, lead = LEAD) => validateDraft(kind, text, { lead });
const has = (list, re) => list.some((x) => re.test(x));

test('a good first DM passes', () => {
  assert.deepEqual(check('cold', GOOD_FIRST), []);
});

test('first DM: 35 to 90 words', () => {
  assert.ok(has(check('cold', `${words(120)}`), /120 words, the limit is 90/));
  assert.ok(has(check('cold', 'Hi! Free demo, no obligation, want one?'), /minimum is 35/));
  assert.ok(GOOD_FIRST.split(/\s+/).length >= 35 && GOOD_FIRST.split(/\s+/).length <= 90);
});

test('first DM: no link, no price, no "I built", no "free website"', () => {
  for (const u of ['Check https://example.com now', 'see www.example.org', 'visit hoppop.com today', 'go to sunnybounce.net']) {
    assert.ok(has(check('cold', `${GOOD_FIRST} ${u}`), /link or website address/), u);
  }
  for (const c of ['It is only $99.', 'about 200 dollars', 'just 50 bucks', '$33/month', 'at 20 USD', 'plans start at $59 per month']) {
    assert.ok(has(check('cold', `${GOOD_FIRST} ${c}`), /price/), c);
  }
  for (const b of ['I built you a new site.', "I've built your page.", 'The website is already built.', 'I made your website.']) {
    assert.ok(has(check('cold', `${GOOD_FIRST} ${b}`), /already exists/), b);
  }
  for (const f of ['It is a free website.', 'a free modern website for you', 'a free site', 'Free web site included']) {
    assert.ok(has(check('cold', `${GOOD_FIRST} ${f}`), /free website/), f);
  }
  // "free demo of a modern website" is the intended wording and must pass
  assert.deepEqual(check('cold', GOOD_FIRST.replace('modern site', 'modern website')), []);
});

test('first DM: no automation, follow-up system, review system or monthly plans', () => {
  for (const w of ['It adds automation.', 'We use automated replies.', 'A follow-up system helps.', 'Our reviews system is nice.', 'Plans are monthly.', 'Three packages are available.', 'See the pricing.', 'It is a subscription.']) {
    assert.ok(check('cold', `${GOOD_FIRST} ${w}`).length > 0, w);
  }
});

test('first DM must offer a "free demo", say "No obligation", end with a question and use the hook', () => {
  assert.ok(has(check('cold', GOOD_FIRST.replaceAll('free demo', 'demo')), /free demo/));
  assert.ok(has(check('cold', GOOD_FIRST.replace('No obligation. ', '')), /No obligation/));
  assert.ok(has(check('cold', GOOD_FIRST.replace('Want me to put one together?', 'Let me know.')), /end with a question/));
  assert.ok(has(check('cold', GOOD_FIRST.replace('your sparkle-theme castle', 'your listings')), /hook/));
  assert.deepEqual(check('cold', GOOD_FIRST.replace('your sparkle-theme castle', 'the sparkle castle'), { hook: 'your sparkle-theme castle' }), []);
  assert.deepEqual(check('cold', GOOD_FIRST, { hook: '' }), [], 'no hook, nothing to check');
  assert.deepEqual(check('cold', `${GOOD_FIRST} 🎈`), []);
});

test('no message of any kind may promise when or how fast something arrives', () => {
  const bad = [
    'within the hour', 'within the hour of you saying yes', 'in an hour', 'in 30 minutes', 'within 2 hours', 'within a day',
    'by tomorrow', 'by tonight', 'next morning', 'same-day', 'same day', '24 hours', 'inside an hour', 'right away', 'in a couple of hours',
    'usually within the hour during our support hours, otherwise by the next morning (US time)',
  ];
  for (const phrase of bad) {
    assert.ok(has(check('cold', `${GOOD_FIRST} I can send it ${phrase}.`), /delivery-time promise/), phrase);
    for (const kind of ['followup1', 'followup2', 'followup3', 'replyAck', 'demoNudge1', 'demoNudge2', 'demoNudge3']) {
      assert.ok(has(check(kind, `Hi Dana! I can have it ready ${phrase}, no pressure.`), /delivery-time promise/), `${kind}: ${phrase}`);
    }
    assert.ok(has(check('demo', `${GOOD_DEMO} I will update it ${phrase}.`), /delivery-time promise/), `demo: ${phrase}`);
  }
});

test('ordinary time words and the required sign-offs are not delivery promises', () => {
  assert.deepEqual(check('followup2', 'Hi Dana! Parents often give up after a day or two of scrolling, so a booking request form could catch weekend inquiries and keep your DMs for real conversations. Would you like to see one?'), []);
  assert.deepEqual(check('replyAck', `Hi Dana! Thanks for getting back to me. Could I use a few photos from your page in a private demo? Only you would see it. ${REPLY_ENDING}`), []);
  assert.deepEqual(check('demoNudge3', 'Hi Dana! Last note on the demo: I will keep it available a few more days, and if you would like it live, just reply "go live". No hard feelings either way.'), []);
});

test('"I built" check applies to follow-ups and replyAck but not to demo messages', () => {
  for (const kind of ['followup1', 'followup2', 'followup3', 'replyAck']) {
    assert.ok(has(check(kind, 'Hi Dana! I built you a quick site, want to see it?'), /already exists/), kind);
  }
  assert.deepEqual(check('demo', `Hi Dana! The private demo I built for your rentals is at [[LINK]]. Only you have this link and nothing is public. The calendar and the form here are for show. ${DEMO_CLOSING}`), []);
});

test('markdown, emoji, labels and tokens', () => {
  assert.ok(has(check('cold', `${GOOD_FIRST}\n- bullet point`), /markdown/));
  assert.ok(has(check('cold', `${GOOD_FIRST} **bold**`), /markdown/));
  assert.ok(has(check('cold', `${GOOD_FIRST} 🎉🎈`), /emoji/));
  assert.ok(has(check('cold', `Subject: hello\n${GOOD_FIRST}`), /label/));
  assert.ok(has(check('followup3', `${words(20)} [[LINK]]`), /placeholder/));
});

test('follow-ups are capped at 70 words and may not carry links or prices', () => {
  assert.deepEqual(check('followup1', words(60)), []);
  assert.ok(has(check('followup1', words(80)), /80 words/));
  assert.ok(check('followup2', `${words(20)} https://x.com`).length > 0);
  assert.ok(check('demoNudge1', `${words(20)} $99`).length > 0);
});

test('photo-permission reply must end with the fixed sentence; finalize adds it', () => {
  const reply = 'Hi Dana! Thanks for getting back to me. Could I use a few photos from your page in a private demo? Only you would see it.';
  assert.ok(has(check('replyAck', reply), /must end with/));
  const fixed = finalize('replyAck', reply);
  assert.ok(fixed.endsWith("You'll have it shortly."));
  assert.deepEqual(check('replyAck', fixed), []);
  assert.equal(finalize('replyAck', fixed), fixed, 'not duplicated');
  assert.equal(finalize('cold', GOOD_FIRST), GOOD_FIRST);
});

test('demo delivery message: link token, private, for show, no price, closing sentence', () => {
  assert.deepEqual(check('demo', GOOD_DEMO), []);
  assert.ok(has(check('demo', 'Hi Dana! Only you have this private link.'), /\[\[LINK\]\]/));
  assert.ok(has(check('demo', GOOD_DEMO.replace('are for show', 'are live')), /for show/));
  assert.ok(has(check('demo', GOOD_DEMO.replace('Only you have this link', 'Here it is')), /private/));
  assert.ok(has(check('demo', `${GOOD_DEMO} It is $500.`), /price/));
  assert.ok(has(check('demo', `${GOOD_DEMO} also https://other.com`), /link/));
  assert.ok(has(check('demo', `${GOOD_DEMO} Plans are monthly.`), /monthly/));

  const text = assembleDemo(GOOD_DEMO, LEAD);
  assert.deepEqual(validateDemoFinal(text, LEAD), []);
  assert.ok(text.includes('https://demo.example/abc'));
  assert.ok(text.endsWith(DEMO_CLOSING));
  assert.ok(!/\$|packages|Recommended/i.test(text), 'no package list, no prices');
});

test('demo final check rejects any price, a wrong link and a missing closing sentence', () => {
  const ok = assembleDemo(GOOD_DEMO, LEAD);
  assert.ok(validateDemoFinal(`${ok}\nPlans start at $59.`, LEAD).length > 0);
  assert.ok(validateDemoFinal(`${ok}\nOnly 99 dollars.`, LEAD).length > 0);
  assert.ok(validateDemoFinal(ok.replace('https://demo.example/abc', 'https://evil.example/x'), LEAD).length > 0);
  assert.ok(validateDemoFinal(ok.replace(DEMO_CLOSING, 'Bye.'), LEAD).length > 0);
  assert.ok(validateDemoFinal(`${ok} It will be ready within the hour.`, LEAD).length > 0);
});

test('closing sentence is appended when the model forgot it, not duplicated when present', () => {
  const once = assembleDemo(GOOD_DEMO, LEAD);
  assert.equal((once.match(/just ask/g) || []).length, 1);
  const twice = assembleDemo(`${GOOD_DEMO}\n${DEMO_CLOSING}`, LEAD);
  assert.equal((twice.match(/just ask/g) || []).length, 1);
});

test('cleanOutput strips wrapping quotes and a "Message:" label', () => {
  assert.equal(cleanOutput('"Hi there!"'), 'Hi there!');
  assert.equal(cleanOutput('Message: Hi there!'), 'Hi there!');
  assert.equal(cleanOutput('  Hi there!  '), 'Hi there!');
});
