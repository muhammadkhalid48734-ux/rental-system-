import { DEMO_CLOSING, REPLY_ENDING } from '../client/src/lib/messages.js';
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
].join('|'), 'i');

// Things the first message and every other DM must never mention.
const FORBIDDEN = [
  [/\bautomat\w*/i, 'it mentions automation'],
  [/\bfollow-?\s?up systems?\b/i, 'it mentions a follow-up system'],
  [/\breviews?\s+systems?\b/i, 'it mentions a reviews system'],
  [/\b(?:monthly|subscriptions?|packages?|pricing)\b/i, 'it mentions monthly plans or pricing'],
  [/\bfree\s+(?:\w+\s+)?(?:website|web site|site)\b/i, 'it says "free website"; say "free demo"'],
];

const norm = (t) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const emojiCount = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length;

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

/** The photo-permission reply always ends with the same sentence; add it when the model left it out. */
export function finalize(kind, text) {
  const t = text.trim();
  if (kind === 'replyAck' && !norm(t).endsWith(norm(REPLY_ENDING))) return `${t} ${REPLY_ENDING}`;
  return t;
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
    if (!/\?\s*\p{Extended_Pictographic}?\s*$/u.test(t)) v.push('it must end with a question');
    const need = hookWords(lead?.hook);
    if (need.length && need.filter((w) => n.includes(w)).length < Math.ceil(need.length / 2)) {
      v.push(`it must mention the hook detail: "${String(lead.hook).trim()}"`);
    }
  }

  if (kind === 'replyAck' && !norm(t).endsWith(norm(REPLY_ENDING))) v.push(`it must end with: ${REPLY_ENDING}`);

  if (kind === 'demo') {
    if (t.split(LINK_TOKEN).length !== 2) v.push(`it must contain ${LINK_TOKEN} exactly once`);
    if (!/\bonly you\b/i.test(t) || !/\bprivate\b/i.test(t)) v.push('it must say the link is private and only they have it');
    if (!/\bfor show\b/i.test(t)) v.push('it must say the calendar and the form in this version are for show');
  } else if (t.includes(LINK_TOKEN)) {
    v.push('it contains a placeholder token that is only allowed in demo messages');
  }
  return v;
}

/** Fills the link into a demo draft and makes sure the closing sentence is there. */
export function assembleDemo(draft, lead) {
  let t = draft.replaceAll(LINK_TOKEN, String(lead.demoLink).trim());
  if (!norm(t).includes(norm(DEMO_CLOSING))) t = `${t.trim()}\n\n${DEMO_CLOSING}`;
  return t;
}

/** Final checks on an assembled demo message: exact link once, no price anywhere, closing sentence. */
export function validateDemoFinal(text, lead) {
  const v = [];
  const link = String(lead.demoLink).trim();
  if (text.split(link).length !== 2) v.push('the demo link must appear exactly once');
  const rest = text.replace(link, '');
  if (URL_RE.test(rest)) v.push('it contains an extra link');
  if (PRICE_RE.test(rest) || /\$\s?\d/.test(rest)) v.push('a demo delivery message must not contain any price');
  if (TIMING_RE.test(rest)) v.push('it promises when or how fast something will arrive');
  for (const [re, why] of FORBIDDEN) if (re.test(rest)) v.push(why);
  if (!norm(text).includes(norm(DEMO_CLOSING))) v.push(`it must end with: ${DEMO_CLOSING}`);
  return v;
}
