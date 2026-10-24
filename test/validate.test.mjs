import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleDemo, cleanOutput, validateDemoFinal, validateDraft } from '../server/validate.js';
import { CONFIG_DEFAULTS } from '../server/schema.js';

const T = CONFIG_DEFAULTS.demoTurnaround;
const GOOD_FIRST =
  `Hey Dana! Your sparkle-theme castle caught my eye. When I pulled up your site on my phone, the layout was tiny and hard to tap, and I'd guess a few parents give up before they ask about dates. I run a small remote web design studio and could put together a free private demo, with a photo gallery and online booking, ${T}. Would you want to see it?`;

test('a good first DM passes', () => {
  assert.deepEqual(validateDraft('cold', GOOD_FIRST, CONFIG_DEFAULTS), []);
});

test('first DM: rejects URLs, prices and "I built" phrases', () => {
  const urlCases = ['Check https://example.com now', 'see www.example.org', 'visit hoppop.com today', 'go to sunnybounce.net'];
  for (const u of urlCases) assert.ok(validateDraft('cold', `${GOOD_FIRST} ${u}`, CONFIG_DEFAULTS).some((x) => /link or website address/.test(x)), u);

  const priceCases = ['It is only $99.', 'about 200 dollars', 'just 50 bucks', 'for $247 setup', '$33/month', 'at 20 USD'];
  for (const c of priceCases) assert.ok(validateDraft('cold', `${GOOD_FIRST} ${c}`, CONFIG_DEFAULTS).some((x) => /price/.test(x)), c);

  const built = ['I built you a new site.', 'I have built a demo.', "I've built your page.", 'The website is already built.', 'I made your website.', 'We built something.'];
  for (const b of built) assert.ok(validateDraft('cold', `${GOOD_FIRST} ${b}`, CONFIG_DEFAULTS).some((x) => /already exists/.test(x)), b);
});

test('"I built" check also applies to follow-ups and replyAck but not to demo messages', () => {
  for (const kind of ['followup1', 'followup2', 'followup3', 'replyAck']) {
    assert.ok(validateDraft(kind, 'Hi Dana! I built you a quick site, want to see it?', CONFIG_DEFAULTS).some((x) => /already exists/.test(x)), kind);
  }
  const demoDraft = "Hi Dana! The private demo I built for your rentals is ready at [[LINK]] and only you have this link. It's easy to change.\n[[PACKAGES]]";
  assert.deepEqual(validateDraft('demo', demoDraft, CONFIG_DEFAULTS), []);
});

test('first DM: word limit, markdown, emoji, labels', () => {
  const long = Array.from({ length: 120 }, () => 'word').join(' ');
  assert.ok(validateDraft('cold', long, CONFIG_DEFAULTS).some((x) => /120 words/.test(x)));
  assert.ok(validateDraft('cold', `${GOOD_FIRST}\n- bullet point`, CONFIG_DEFAULTS).some((x) => /markdown/.test(x)));
  assert.ok(validateDraft('cold', `${GOOD_FIRST} **bold**`, CONFIG_DEFAULTS).some((x) => /markdown/.test(x)));
  assert.ok(validateDraft('cold', `${GOOD_FIRST} 🎉🎈`, CONFIG_DEFAULTS).some((x) => /emoji/.test(x)));
  assert.deepEqual(validateDraft('cold', `${GOOD_FIRST} 🎈`, CONFIG_DEFAULTS), []);
  assert.ok(validateDraft('cold', `Subject: hello\n${GOOD_FIRST}`, CONFIG_DEFAULTS).some((x) => /label/.test(x)));
  assert.ok(validateDraft('cold', 'Hi!', CONFIG_DEFAULTS).some((x) => /too short/.test(x)));
});

test('follow-ups are capped at 70 words and may not carry links or prices', () => {
  const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
  assert.deepEqual(validateDraft('followup1', words(60), CONFIG_DEFAULTS), []);
  assert.ok(validateDraft('followup1', words(80), CONFIG_DEFAULTS).some((x) => /80 words/.test(x)));
  assert.ok(validateDraft('followup2', `${words(20)} https://x.com`, CONFIG_DEFAULTS).length > 0);
  assert.ok(validateDraft('demoNudge1', `${words(20)} $99`, CONFIG_DEFAULTS).length > 0);
  assert.ok(validateDraft('followup3', `${words(20)} [[LINK]]`, CONFIG_DEFAULTS).some((x) => /placeholder/.test(x)));
});

test('demo: tokens required, then assembled with the exact link and Config prices only', () => {
  const lead = { demoLink: 'https://demo.example/abc' };
  const draft = "Hi Dana! Your private demo is ready at [[LINK]]. Only you have this link, and everything is easy to change.\n[[PACKAGES]]";
  assert.deepEqual(validateDraft('demo', draft, CONFIG_DEFAULTS), []);
  assert.ok(validateDraft('demo', 'Hi Dana! Only you have this private link.', CONFIG_DEFAULTS).some((x) => /\[\[LINK\]\]/.test(x)));
  assert.ok(validateDraft('demo', `${draft} It is $500 today.`, CONFIG_DEFAULTS).some((x) => /price/.test(x)));
  assert.ok(validateDraft('demo', `${draft} also https://other.com`, CONFIG_DEFAULTS).some((x) => /link/.test(x)));

  const text = assembleDemo(draft, lead, CONFIG_DEFAULTS);
  assert.deepEqual(validateDemoFinal(text, lead, CONFIG_DEFAULTS), []);
  assert.ok(text.includes('https://demo.example/abc'));
  assert.ok(text.includes('1) Website: $247 setup, no monthly fee'));
  assert.ok(text.includes('2) Website that books for you (Recommended): $297 setup + $33/month'));
  assert.ok(text.includes('3) Book, pay & sign online: $597 setup + $79/month'));
  assert.match(text, /Cancel anytime, no contract, and your website, domain and photos stay yours\.$/);
  assert.ok(!/most popular/i.test(text));
});

test('demo final check rejects invented prices, missing packages and a wrong link', () => {
  const lead = { demoLink: 'https://demo.example/abc' };
  const ok = assembleDemo("Hi! Private demo: [[LINK]]. Only you have this link.\n[[PACKAGES]]", lead, CONFIG_DEFAULTS);
  assert.ok(validateDemoFinal(ok.replace('$297', '$199'), lead, CONFIG_DEFAULTS).length > 0);
  assert.ok(validateDemoFinal(ok.replace('1) Website: $247 setup, no monthly fee', ''), lead, CONFIG_DEFAULTS).length > 0);
  assert.ok(validateDemoFinal(ok.replace('https://demo.example/abc', 'https://evil.example/x'), lead, CONFIG_DEFAULTS).length > 0);
  assert.ok(validateDemoFinal(ok.replace('(Recommended)', '(Most popular)'), lead, CONFIG_DEFAULTS).length > 0);
});

test('closing line is appended when the model forgot it, not duplicated when present', () => {
  const lead = { demoLink: 'https://demo.example/abc' };
  const once = assembleDemo("Hi! [[LINK]] only you.\n[[PACKAGES]]", lead, CONFIG_DEFAULTS);
  assert.equal((once.match(/Cancel anytime/g) || []).length, 1);
  const twice = assembleDemo("Hi! [[LINK]] only you.\n[[PACKAGES]]\nCancel anytime, no contract, and your website, domain and photos stay yours.", lead, CONFIG_DEFAULTS);
  assert.equal((twice.match(/[Cc]ancel anytime/g) || []).length, 1);
});

test('cleanOutput strips wrapping quotes and a "Message:" label', () => {
  assert.equal(cleanOutput('"Hi there!"'), 'Hi there!');
  assert.equal(cleanOutput('Message: Hi there!'), 'Hi there!');
  assert.equal(cleanOutput('  Hi there!  '), 'Hi there!');
});

test('cold messages must state the configured delivery time word for word', () => {
  const noPromise = GOOD_FIRST.replace(`, ${T}`, '').replace('and can build', 'and can build');
  assert.ok(validateDraft('cold', noPromise, CONFIG_DEFAULTS).some((x) => x.includes('word for word') && x.includes(T)));
  // case, spacing and curly apostrophes do not matter
  const loose = GOOD_FIRST.replace(T, T.toUpperCase().replace(/ /g, '  '));
  assert.deepEqual(validateDraft('cold', loose, CONFIG_DEFAULTS), []);
  // a custom Config value is what gets enforced
  const custom = { ...CONFIG_DEFAULTS, demoTurnaround: 'usually same day, within 4 working hours (US Eastern)' };
  assert.ok(validateDraft('cold', GOOD_FIRST, custom).length > 0, 'the old default no longer satisfies a changed setting');
  assert.deepEqual(validateDraft('cold', GOOD_FIRST.replace(T, custom.demoTurnaround), custom), []);
});

test('any other delivery promise is rejected, including the old hard-coded one', () => {
  const bad = [
    'within the hour of you saying yes', 'within the hour', 'in an hour', 'in 30 minutes', 'within 2 hours', 'within a day',
    'by tomorrow', 'by tonight', 'next morning', 'same-day', '24 hours', 'inside an hour',
  ];
  for (const phrase of bad) {
    const text = GOOD_FIRST.replace(T, `${T}, and again ${phrase}`);
    assert.ok(validateDraft('cold', text, CONFIG_DEFAULTS).some((x) => /delivery time other than/.test(x)), phrase);
    const swapped = GOOD_FIRST.replace(T, phrase);
    assert.ok(validateDraft('cold', swapped, CONFIG_DEFAULTS).length > 0, `swapped: ${phrase}`);
  }
  for (const kind of ['followup1', 'followup2', 'followup3', 'replyAck', 'demoNudge1', 'demoNudge2', 'demoNudge3']) {
    assert.ok(validateDraft(kind, 'Hi Dana! I can have it ready within the hour if you like, no pressure.', CONFIG_DEFAULTS).some((x) => /delivery time other than/.test(x)), kind);
  }
  assert.ok(validateDraft('demo', 'Hi Dana! Your private demo is at [[LINK]]. Only you have this link. I will update it within the hour.\n[[PACKAGES]]', CONFIG_DEFAULTS).some((x) => /delivery time other than/.test(x)));
});

test('the configured wording itself is never flagged, and ordinary time words are fine', () => {
  assert.deepEqual(validateDraft('followup1', `Hi Dana! Quick reminder that I can send the demo ${T}. No pressure at all.`, CONFIG_DEFAULTS), []);
  const ordinary = 'Hi Dana! Parents often give up after a day or two of scrolling, so a simple booking page could catch weekend inquiries and save you a few messages every week.';
  assert.deepEqual(validateDraft('followup2', ordinary, CONFIG_DEFAULTS), []);
});

test('without a configured delivery time no timing promise is accepted at all', () => {
  const none = { ...CONFIG_DEFAULTS, demoTurnaround: '' };
  assert.ok(validateDraft('followup1', 'Hi Dana! I can send it within the hour, no pressure at all today.', none).length > 0);
});
