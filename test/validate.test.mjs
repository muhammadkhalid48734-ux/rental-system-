import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amountsIn, assembleDemo, cleanOutput, finalize, hasDeliveryPromise, validateDemoFinal, validateDraft, validateReplyFinal,
} from '../server/validate.js';
import { allowedAmounts, DEMO_CLOSING, priceLine } from '../client/src/lib/messages.js';
import { CONFIG_DEFAULTS } from '../server/schema.js';

const LEAD = { hook: 'your sparkle-theme castle', demoLink: 'https://demo.example/abc' };
const GOOD_FIRST =
  "Hey Dana! I came across Hop & Pop Party Rentals and noticed your sparkle-theme castle. When I pulled up your site on my phone, the layout was tiny and hard to tap, so a few parents may give up before asking about dates. I run a small web design studio and could build you a free demo of a simple site where parents can see your rentals and send a booking request. Nothing gets booked without you, you approve every request. No obligation. Want me to put one together?";
const GOOD_DEMO =
  "Hi Dana! Thanks again for the go-ahead. Your demo is ready at [[LINK]]. Only you have this link. Photos and info are samples for now.";
const GOOD_REPLY =
  "Hi Dana! Thanks so much for getting back to me. I'll only use photos from your page with your OK, and nothing goes live without your approval. What are your top 3 rentals?";
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
  // "free demo of a simple website" is the intended wording and must pass
  assert.deepEqual(check('cold', GOOD_FIRST.replace('simple site', 'simple website')), []);
});

test('first DM: no automation, follow-up system, review system or monthly plans', () => {
  for (const w of ['It adds automation.', 'We use automated replies.', 'A follow-up system helps.', 'Our reviews system is nice.', 'Plans are monthly.', 'Three packages are available.', 'See the pricing.', 'It is a subscription.']) {
    assert.ok(check('cold', `${GOOD_FIRST} ${w}`).length > 0, w);
  }
});

test('first DM must say the owner approves every request, never with automation wording', () => {
  assert.ok(has(check('cold', GOOD_FIRST.replace('Nothing gets booked without you, you approve every request. ', '')), /approve every request/));
  const auto = GOOD_FIRST.replace('Nothing gets booked without you, you approve every request.', 'Nothing gets booked automatically, you approve every request.');
  assert.ok(has(check('cold', auto), /automation/));
  assert.doesNotMatch(GOOD_FIRST, /automat/i);
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
  assert.deepEqual(check('replyAck', GOOD_REPLY), []);
  assert.deepEqual(check('demoNudge3', 'Hi Dana! No pressure at all. Should I keep your demo saved for spring, or close it out? Either answer is fine.'), []);
});

test('"I built" check applies to follow-ups and replyAck but not to demo messages', () => {
  for (const kind of ['followup1', 'followup2', 'followup3', 'replyAck']) {
    assert.ok(has(check(kind, 'Hi Dana! I built you a quick site, want to see it?'), /already exists/), kind);
  }
  assert.deepEqual(check('demo', `Hi Dana! The demo I built for your rentals is at [[LINK]]. Only you have this link. Photos and info are samples for now. ${DEMO_CLOSING}`), []);
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

test('"shortly", "today" and other timing words are delivery promises in every message', () => {
  for (const w of ["You'll have it shortly.", 'I can send it today.', 'Ready tonight.', 'You will see it tomorrow.']) {
    assert.ok(hasDeliveryPromise(w), w);
    assert.ok(has(check('replyAck', `${GOOD_REPLY.replace('What are', `${w} What are`)}`), /delivery-time promise/), w);
  }
});

test('yes-reply: the model part follows the pre-demo rules (no price, asks for top 3, ends with a question)', () => {
  assert.deepEqual(check('replyAck', GOOD_REPLY), []);
  assert.ok(has(check('replyAck', GOOD_REPLY.replace('What are your top 3 rentals?', 'Plans start at $59/month. What are your top 3 rentals?')), /price/));
  assert.ok(has(check('replyAck', GOOD_REPLY.replace('What are your top 3 rentals?', 'What do you rent most?')), /top 3/));
  assert.ok(has(check('replyAck', GOOD_REPLY.replace('What are your top 3 rentals?', 'Send me your top 3 rentals.')), /end with a question/));
  assert.ok(!check('replyAck', GOOD_REPLY).some((x) => /shortly/.test(x)));
});

test('yes-reply: finalize adds the Config price line before the closing question, only Config amounts', () => {
  for (const cfg of [CONFIG_DEFAULTS, { ...CONFIG_DEFAULTS, foundingOffer: 'true' }, { ...CONFIG_DEFAULTS, plan1Price: '65', plan1Founding: '45', foundingOffer: 'true' }]) {
    const out = finalize('replyAck', GOOD_REPLY, cfg);
    assert.deepEqual(validateReplyFinal(out, cfg), [], out);
    assert.ok(out.includes(priceLine(cfg)));
    assert.ok(out.endsWith('What are your top 3 rentals?'), 'still ends with the question');
    assert.ok(out.indexOf(priceLine(cfg)) < out.indexOf('What are your top 3'), 'price line comes before the question');
    const allowed = allowedAmounts(cfg);
    assert.ok(amountsIn(out).length > 0 && amountsIn(out).every((n) => allowed.has(n)), `amounts ${amountsIn(out)} must come from Config`);
    assert.doesNotMatch(out, /shortly/i);
  }
  assert.match(priceLine(CONFIG_DEFAULTS), /plans start at \$59\/month \(3-month minimum, then cancel anytime\)\.$/);
  assert.match(priceLine({ ...CONFIG_DEFAULTS, foundingOffer: 'true' }), /plans start at \$39\/month for the first year \(\$59\/month after\)/);
  assert.equal(finalize('cold', GOOD_FIRST, CONFIG_DEFAULTS), GOOD_FIRST);
});

test('yes-reply final check rejects amounts not in Config, a second price line and timing promises', () => {
  const out = finalize('replyAck', GOOD_REPLY, CONFIG_DEFAULTS);
  assert.ok(has(validateReplyFinal(out.replace('$59', '$49'), CONFIG_DEFAULTS), /not in Settings|price line/));
  assert.ok(has(validateReplyFinal(`${priceLine(CONFIG_DEFAULTS)} ${out}`, CONFIG_DEFAULTS), /exactly once/));
  assert.ok(has(validateReplyFinal(out.replace('What are', 'Ready shortly. What are'), CONFIG_DEFAULTS), /promises/));
  assert.ok(has(validateReplyFinal(GOOD_REPLY, CONFIG_DEFAULTS), /exactly once/), 'no price line at all');
});

test('demo delivery message: link token, only you, samples, no price, closing question', () => {
  assert.deepEqual(check('demo', GOOD_DEMO), []);
  assert.ok(has(check('demo', 'Hi Dana! Only you have this link, samples for now.'), /\[\[LINK\]\]/));
  assert.ok(has(check('demo', GOOD_DEMO.replace('are samples for now', 'are final')), /samples/));
  assert.ok(has(check('demo', GOOD_DEMO.replace('Only you have this link', 'Here it is')), /only they have/));
  assert.ok(has(check('demo', `${GOOD_DEMO} It is $500.`), /price/));
  assert.ok(has(check('demo', `${GOOD_DEMO} also https://other.com`), /link/));
  assert.ok(has(check('demo', `${GOOD_DEMO} Plans are monthly.`), /monthly/));

  const text = assembleDemo(GOOD_DEMO, LEAD);
  assert.deepEqual(validateDemoFinal(text, LEAD), []);
  assert.ok(text.includes('https://demo.example/abc'));
  assert.ok(text.endsWith(DEMO_CLOSING));
  assert.ok(text.trim().endsWith('?'), 'the demo message ends with a question');
  assert.ok(!/\$|packages|Recommended/i.test(text), 'no package list, no prices');
  assert.ok(!/video/i.test(text), 'no video line without a video');
});

test('demo video: added by the server before the closing question; the model never writes it', () => {
  const lead = { ...LEAD, demoVideo: 'https://video.example/v1' };
  const text = assembleDemo(GOOD_DEMO, lead);
  assert.deepEqual(validateDemoFinal(text, lead), []);
  assert.ok(text.includes("Here's a quick video of how a customer would send you a request: https://video.example/v1"));
  assert.ok(text.endsWith(`https://video.example/v1\n\n${DEMO_CLOSING}`));
  // the model put the question first: it is moved after the video line, not duplicated
  const moved = assembleDemo(`${GOOD_DEMO} ${DEMO_CLOSING}`, lead);
  assert.equal(moved.split(DEMO_CLOSING).length, 2);
  assert.ok(moved.endsWith(DEMO_CLOSING));
  // a URL typed by the model is still rejected at the draft stage
  assert.ok(has(check('demo', `${GOOD_DEMO} Video: https://video.example/v1`), /link/));
  assert.ok(has(validateDemoFinal(text.replace('https://video.example/v1', 'https://other.example/x'), lead), /video link/));
});

test('demo final check rejects any price, a wrong link and a missing closing sentence', () => {
  const ok = assembleDemo(GOOD_DEMO, LEAD);
  assert.ok(validateDemoFinal(`${ok}\nPlans start at $59.`, LEAD).length > 0);
  assert.ok(validateDemoFinal(`${ok}\nOnly 99 dollars.`, LEAD).length > 0);
  assert.ok(validateDemoFinal(ok.replace('https://demo.example/abc', 'https://evil.example/x'), LEAD).length > 0);
  assert.ok(validateDemoFinal(ok.replace(DEMO_CLOSING, 'Bye.'), LEAD).length > 0);
  assert.ok(validateDemoFinal(`${ok}\nThanks!`, LEAD).length > 0, 'the closing question must be last');
  assert.ok(validateDemoFinal(`${ok} It will be ready within the hour.`, LEAD).length > 0);
});

test('closing question is appended when the model forgot it, not duplicated when present', () => {
  const once = assembleDemo(GOOD_DEMO, LEAD);
  assert.equal(once.split(DEMO_CLOSING).length, 2);
  const twice = assembleDemo(`${GOOD_DEMO}\n${DEMO_CLOSING}`, LEAD);
  assert.equal(twice.split(DEMO_CLOSING).length, 2);
});

test('cleanOutput strips wrapping quotes and a "Message:" label', () => {
  assert.equal(cleanOutput('"Hi there!"'), 'Hi there!');
  assert.equal(cleanOutput('Message: Hi there!'), 'Hi there!');
  assert.equal(cleanOutput('  Hi there!  '), 'Hi there!');
});
