import { allowedAmounts, CLOSING_LINE, packages, packagesBlock, priceLine } from '../client/src/lib/messages.js';
import { LINK_TOKEN, PACKAGES_TOKEN } from './prompts.js';

const URL_RE = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|us|app|site|biz|info|shop|online|store)\b/i;
const PRICE_RE = /[$€£]\s?\d|\b\d[\d,.]*\s?(?:usd|dollars?|bucks)\b|\/\s?(?:mo|month)\b|\bper month\b|\bmonthly fee\b/i;
const MARKDOWN_RE = /\*|__|`|^\s{0,3}#{1,6}\s|^\s*[-•]\s|^\s*\d+[.)]\s|\[[^\]]+\]\([^)]*\)/m;
const META_RE = /^\s*(subject|message|option \d|version \d|draft)\b\s*[:#-]/im;
const BUILT_PHRASES = [
  'i built', 'i have built', "i've built", 'we built', 'we have built', "we've built",
  'already built', 'already made', 'already created', 'i made your website', 'i made you a website',
  "i've made", 'i have made', 'i created your website', 'built your website', 'built you a website', 'built you a site',
];

const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const emojiCount = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length;

// kind -> [minWords, maxWords] for the model's draft
const LIMITS = {
  cold: [20, 110],
  followup1: [6, 70], followup2: [6, 70], followup3: [6, 70], replyAck: [6, 70],
  demo: [10, 130],
  demoNudge1: [6, 70], demoNudge2: [6, 70], demoNudge3: [6, 70],
};
const PRE_DEMO = new Set(['cold', 'followup1', 'followup2', 'followup3', 'replyAck']);

/** Strips wrapping quotes and a stray "Message:" label the model sometimes adds. */
export function cleanOutput(text) {
  let t = String(text).trim();
  t = t.replace(/^(?:here(?:'s| is)[^\n]*:\s*\n+|message:\s*)/i, '').trim();
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  return t;
}

/** Checks the model's draft. Returns a list of violations (empty when fine). */
export function validateDraft(kind, text) {
  const v = [];
  const t = text.trim();
  const [min, max] = LIMITS[kind];
  const words = wordCount(t.replaceAll(LINK_TOKEN, 'link').replaceAll(PACKAGES_TOKEN, ''));
  if (words > max) v.push(`it is ${words} words, the limit is ${kind === 'cold' ? 90 : max}`);
  if (words < min) v.push('it is too short');
  if (MARKDOWN_RE.test(t)) v.push('it contains markdown or list formatting; use plain sentences only');
  if (META_RE.test(t)) v.push('it contains a label like "Subject:" or "Option 1"; output only the message text');
  if (emojiCount(t) > 1) v.push('it uses more than one emoji');

  const stripped = t.replaceAll(LINK_TOKEN, '').replaceAll(PACKAGES_TOKEN, '');
  if (URL_RE.test(stripped)) v.push('it contains a link or website address');
  if (PRICE_RE.test(stripped)) v.push('it contains a price or dollar amount');
  if (PRE_DEMO.has(kind)) {
    const lower = t.toLowerCase().replace(/[’]/g, "'");
    const hit = BUILT_PHRASES.find((p) => lower.includes(p));
    if (hit) v.push(`it says "${hit}", which implies the website already exists`);
  }

  if (kind === 'demo') {
    if (t.split(LINK_TOKEN).length !== 2) v.push(`it must contain ${LINK_TOKEN} exactly once`);
    if (t.split(PACKAGES_TOKEN).length !== 2) v.push(`it must contain ${PACKAGES_TOKEN} exactly once, on its own line`);
    if (!/\bonly you\b|\bprivate\b/i.test(t)) v.push('it must say the link is private and only they have it');
  } else if (t.includes(LINK_TOKEN) || t.includes(PACKAGES_TOKEN)) {
    v.push('it contains a placeholder token that is only allowed in demo messages');
  }
  return v;
}

const closingOk = (t) => {
  const tail = t.slice(-320).toLowerCase();
  return /cancel anytime/.test(tail) && /no contract/.test(tail) && /domain/.test(tail) && /photos/.test(tail) && /stay yours/.test(tail);
};

/** Fills the tokens in a demo draft with the exact link and the Config price list, and ensures the closing line. */
export function assembleDemo(draft, lead, config) {
  let t = draft.replaceAll(LINK_TOKEN, String(lead.demoLink).trim()).replaceAll(PACKAGES_TOKEN, packagesBlock(config));
  if (!closingOk(t)) t = `${t.trim()}\n\n${CLOSING_LINE}`;
  return t;
}

/** Final checks on an assembled demo message: exact link, only Config prices, every package, closing line. */
export function validateDemoFinal(text, lead, config) {
  const v = [];
  const link = String(lead.demoLink).trim();
  if (text.split(link).length !== 2) v.push('the demo link must appear exactly once');
  const rest = text.replace(link, '');
  if (URL_RE.test(rest)) v.push('it contains an extra link');
  const allowed = allowedAmounts(config);
  for (const m of rest.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    if (!allowed.has(Number(m[1].replace(/,/g, '')))) v.push(`it contains a price (${m[0]}) that is not in Config`);
  }
  for (const p of packages(config)) {
    if (!text.includes(priceLine(p))) v.push(`package "${p.name}" is missing its setup and monthly price line`);
  }
  if (!text.includes('(Recommended)')) v.push('the recommended package is not labelled');
  if (!closingOk(text)) v.push('it must end with: cancel anytime, no contract, website, domain and photos stay theirs');
  return v;
}
