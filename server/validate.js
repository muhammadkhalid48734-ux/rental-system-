import { allowedAmounts, DEMO_CLOSING, demoVideoLine, priceLine, withPriceLine } from '../client/src/lib/messages.js';
import { LINK_TOKEN } from './prompts.js';

const URL_RE = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|us|app|site|biz|info|shop|online|store)\b/i;
const PRICE_RE = /[$€£]\s?\d|\b\d[\d,.]*\s?(?:usd|dollars?|bucks)\b|\/\s?(?:mo|month)\b|\bper month\b|\bmonthly fee\b/i;
const MARKDOWN_RE = /\*|__|`|^\s{0,3}#{1,6}\s|^\s*[-•]\s|^\s*\d+[.)]\s|\[[^\]]+\]\([^)]*\)/m;
const META_RE = /^\s*(subject|message|option \d|version \d|draft)\b\s*[:#-]/im;
const BUILT_PHRASES = [
  'i built', 'i have built', "i've built", 'we built', 'we have built', "we've built",
  'already built', 'already made', 'already created', 'i made your website', 'i made you a website',
  "i've made", 'i have made', 'i created your website', 'built your website', 'built you a website', 'built you a site',
];

// Any promise about when or how fast something arrives. No message may contain one.
const TIMING_RE = new RegExp([
  String.raw`\bwithin\s+(?:the|an?|one|two|three|a few|a couple of|\d+(?:\s*-\s*\d+)?)\s+(?:hours?|hrs?|minutes?|mins?|days?)\b`,
  String.raw`\bwithin\s+(?:the\s+)?(?:hour|day|morning|afternoon|evening)\b`,
  String.raw`\b(?:in|inside|after)\s+(?:about\s+|around\s+|roughly\s+|just\s+)?(?:an?|one|two|three|a few|a couple of|\d+)\s+(?:hours?|hrs?|minutes?|mins?)\b`,
  String.raw`\bhalf an hour\b`,
  String.raw`\b(?:same|next)[- ]day\b`,
  String.raw`\bnext morning\b`,
  String.raw`\bby\s+(?:tomorrow|tonight|morning|noon|end of (?:the )?day|eod)\b`,
  String.raw`\b(?:24|48|72)[- ]?(?:hours?|hrs?)\b`,
  String.raw`\blater today\b`,
  String.raw`\bthis (?:morning|afternoon|evening)\b`,
  String.raw`\b(?:right away|immediately|asap)\b`,
  String.raw`\b(?:shortly|today|tonight|tomorrow)\b`,
].join('|'), 'i');

// Things the first message and every other DM must never mention.
const FORBIDDEN = [
  [/\bautomat\w*/i, 'it mentions automation'],
  [/\bfollow-?\s?up systems?\b/i, 'it mentions a follow-up system'],
  [/\breviews?\s+systems?\b/i, 'it mentions a reviews system'],
  [/\b(?:monthly|subscriptions?|packages?|pricing)\b/i, 'it mentions monthly plans or pricing'],
  [/\bfree\s+(?:\w+\s+)?(?:website|web site|site)\b/i, 'it says "free website"; say "free demo"'],
];

/** True when the text promises when or how fast something will arrive. Shared by the draft checks and the tests. */
export const hasDeliveryPromise = (text) => TIMING_RE.test(text);

const norm = (t) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const emojiCount = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length;
const endsWithQuestion = (t) => /\?\s*\p{Extended_Pictographic}?\s*$/u.test(t);

// kind -> [minWords, maxWords] for the model's draft
const LIMITS = {
  cold: [35, 90],
  followup1: [6, 70], followup2: [6, 70], followup3: [6, 70], replyAck: [6, 80],
  demo: [10, 130],
  demoNudge1: [6, 70], demoNudge2: [6, 70], demoNudge3: [6, 70],
};
const PRE_DEMO = new Set(['cold', 'followup1', 'followup2', 'followup3', 'replyAck']);

const STOP = new Set(['your', 'their', 'with', 'that', 'this', 'from', 'have', 'about', 'and', 'the']);
const hookWords = (hook) => (String(hook || '').toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length >= 4 && !STOP.has(w));

/** Strips wrapping quotes and a stray "Message:" label the model sometimes adds. */
export function cleanOutput(text) {
  let t = String(text).trim();
  t = t.replace(/^(?:here(?:'s| is)[^\n]*:\s*\n+|message:\s*)/i, '').trim();
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  return t;
}

/**
 * Runs AFTER validateDraft passed. The yes-reply gets the fixed price line from Config, placed before its closing
 * question; the model never writes a price. Every other kind is returned as is.
 */
export function finalize(kind, text, config = {}) {
  const t = text.trim();
  if (kind === 'replyAck') return withPriceLine(t, config);
  return t;
}

/** Dollar amounts in a text, as numbers. */
export const amountsIn = (text) => [...String(text).matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));

/**
 * Final check on the assembled yes-reply: the price line is there exactly once, every dollar amount is one of the
 * Config amounts, and outside the price line the pre-demo rules still hold.
 */
export function validateReplyFinal(text, config) {
  const v = [];
  const line = priceLine(config);
  const parts = text.split(line);
  if (parts.length !== 2) v.push('the price line must appear exactly once');
  const allowed = allowedAmounts(config);
  const bad = amountsIn(text).filter((n) => !allowed.has(n));
  if (bad.length) v.push(`it contains amounts that are not in Settings: ${bad.map((n) => `$${n}`).join(', ')}`);
  const rest = parts.join(' ');
  if (URL_RE.test(rest)) v.push('it contains a link or website address');
  if (PRICE_RE.test(rest)) v.push('it contains a price outside the price line');
  if (TIMING_RE.test(text)) v.push('it promises when or how fast something will arrive');
  for (const [re, why] of FORBIDDEN) if (re.test(rest)) v.push(why);
  if (!endsWithQuestion(text)) v.push('it must end with a question');
  return v;
}

/**
 * Checks the model's draft. Returns a list of violations (empty when fine).
 * `lead` is optional; with it, a first message must actually use the lead's hook.
 */
export function validateDraft(kind, text, { lead } = {}) {
  const v = [];
  const t = text.trim();
  const [min, max] = LIMITS[kind];
  const words = wordCount(t.replaceAll(LINK_TOKEN, 'link'));
  if (words > max) v.push(`it is ${words} words, the limit is ${max}`);
  if (words < min) v.push(`it is ${words} words, the minimum is ${min}`);
  if (MARKDOWN_RE.test(t)) v.push('it contains markdown or list formatting; use plain sentences only');
  if (META_RE.test(t)) v.push('it contains a label like "Subject:" or "Option 1"; output only the message text');
  if (emojiCount(t) > 1) v.push('it uses more than one emoji');

  const stripped = t.replaceAll(LINK_TOKEN, '');
  if (URL_RE.test(stripped)) v.push('it contains a link or website address');
  if (PRICE_RE.test(stripped)) v.push('it contains a price or dollar amount');
  if (TIMING_RE.test(stripped)) v.push('it promises when or how fast something will arrive; make no delivery-time promise');
  for (const [re, why] of FORBIDDEN) if (re.test(stripped)) v.push(why);

  if (PRE_DEMO.has(kind)) {
    const lower = t.toLowerCase().replace(/[’]/g, "'");
    const hit = BUILT_PHRASES.find((p) => lower.includes(p));
    if (hit) v.push(`it says "${hit}", which implies the website already exists`);
  }

  if (kind === 'cold') {
    const n = norm(t);
    if (!n.includes('free demo')) v.push('it must offer a "free demo"');
    if (!n.includes('no obligation')) v.push('it must say "No obligation"');
    if (!/\bapprov\w*/i.test(t)) v.push('it must say nothing gets booked without them: they approve every request');
    if (!endsWithQuestion(t)) v.push('it must end with a question');
    const need = hookWords(lead?.hook);
    if (need.length && need.filter((w) => n.includes(w)).length < Math.ceil(need.length / 2)) {
      v.push(`it must mention the hook detail: "${String(lead.hook).trim()}"`);
    }
  }

  if (kind === 'replyAck') {
    if (!/\btop\s*(?:3|three)\b/i.test(t)) v.push('it must ask for their top 3 rentals');
    if (!endsWithQuestion(t)) v.push('it must end with a question');
  }

  if (kind === 'demo') {
    if (t.split(LINK_TOKEN).length !== 2) v.push(`it must contain ${LINK_TOKEN} exactly once`);
    if (!/\bonly you\b/i.test(t)) v.push('it must say only they have the link');
    if (!/\bsamples?\b/i.test(t)) v.push('it must say the photos and info are samples for now');
  } else if (t.includes(LINK_TOKEN)) {
    v.push('it contains a placeholder token that is only allowed in demo messages');
  }
  return v;
}

const CLOSING_AT_END = new RegExp(`\\s*${escapeRe(DEMO_CLOSING)}\\s*$`, 'i');

/**
 * Fills the link into a demo draft, adds the video line when the lead has one (server-side, so the model never
 * types a URL), and makes the message end with the closing question.
 */
export function assembleDemo(draft, lead) {
  let t = draft.replaceAll(LINK_TOKEN, String(lead.demoLink).trim()).trim().replace(CLOSING_AT_END, '').trim();
  const video = String(lead.demoVideo || '').trim();
  if (video) t = `${t}\n\n${demoVideoLine(video)}`;
  return `${t}\n\n${DEMO_CLOSING}`;
}

/** Final checks on an assembled demo message: exact link (and video) once, no price anywhere, closing question. */
export function validateDemoFinal(text, lead) {
  const v = [];
  const link = String(lead.demoLink).trim();
  const video = String(lead.demoVideo || '').trim();
  if (text.split(link).length !== 2) v.push('the demo link must appear exactly once');
  let rest = text.replace(link, '');
  if (video) {
    if (rest.split(video).length !== 2) v.push('the demo video link must appear exactly once');
    rest = rest.replace(video, '');
  }
  if (URL_RE.test(rest)) v.push('it contains an extra link');
  if (PRICE_RE.test(rest) || /\$\s?\d/.test(rest)) v.push('a demo delivery message must not contain any price');
  if (TIMING_RE.test(rest)) v.push('it promises when or how fast something will arrive');
  for (const [re, why] of FORBIDDEN) if (re.test(rest)) v.push(why);
  if (!norm(text).endsWith(norm(DEMO_CLOSING))) v.push(`it must end with: ${DEMO_CLOSING}`);
  return v;
}
