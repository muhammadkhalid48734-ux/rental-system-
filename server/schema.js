import { HttpError } from './util.js';
import { HOOK_MAX_WORDS, hookWordCount } from '../client/src/lib/messages.js';

export const LEAD_COLS = [
  'id', 'name', 'city', 'owner', 'fb', 'ig', 'email', 'site', 'problem', 'hook', 'note',
  'status', 'track', 'step', 'account', 'lastSentAt', 'repliedAt', 'demoLink', 'verified', 'order',
  // Added later. New columns always go at the end, so a Sheet created before them keeps working (missing = empty).
  'demoVideo', 'source',
];
export const LOG_COLS = ['timestamp', 'leadId', 'account', 'track', 'step', 'channel'];
// Exact text of every message the user marked as sent (undo adds a "<kind>:undo" row).
export const MESSAGE_COLS = ['timestamp', 'leadId', 'kind', 'text'];

export const CONFIG_DEFAULTS = {
  accA: 'Account A',
  accB: 'Account B',
  accC: 'Account C',
  cap: '10',
  gaps: '2,3,4',
  yourName: '',
  studio: '',
  address: '',
  // Link to the plans page (Hopbook). Shown in the "Go live" quick reply; empty = left out.
  siteUrl: '',
  // Monthly plans (the website build is free). Prices are plain numbers (USD per month).
  // `founding` is the first-year price, shown only while foundingOffer is on.
  plan1Name: 'Get Found',
  plan1Price: '59',
  plan1Founding: '39',
  plan1Note: 'A modern mobile site with your items and photos, a gallery, a booking request form, your domain connected, hosting and small updates.',
  plan2Name: 'Get Booked',
  plan2Price: '99',
  plan2Founding: '69',
  plan2Note: 'Everything in Get Found, plus an availability calendar that blocks a date once you confirm a booking, confirmation emails and a reminder before the event.',
  plan3Name: 'Get Paid',
  plan3Price: '179',
  plan3Founding: '129',
  plan3Note: 'Everything in Get Booked, plus online deposits, a rental waiver customers sign on their phone, and review requests after each rental.',
  foundingOffer: 'false',
};

// Written only by the server when leads are imported with progress; never accepted from POST /api/log.
export const IMPORTED_CHANNEL = 'imported';

export const ENUMS = {
  problem: ['outdated', 'down', 'parked', 'nosite', 'social'],
  status: ['queued', 'active', 'replied', 'won', 'lost', 'done'],
  track: ['cold', 'demo'],
  account: ['', 'A', 'B', 'C'],
  // Where the lead was found. Empty = not recorded yet (the card shows a warning).
  source: ['', 'groups', 'ads', 'marketplace', 'maps', 'instagram', 'other'],
  // 'reply' is the yes-reply (top 3 + price line); 'undo' (channel) cancels an earlier row.
  logTrack: ['cold', 'demo', 'reply'],
  channel: ['ig', 'fb', 'email', 'undo'],
};

const TEXT_FIELDS = ['name', 'city', 'owner', 'email', 'hook', 'note'];
const URL_FIELDS = ['fb', 'ig', 'site', 'demoLink', 'demoVideo'];
const DATE_FIELDS = ['lastSentAt', 'repliedAt'];

const str = (v, max = 2000) => String(v ?? '').replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max);

function cleanUrl(v, field) {
  let s = str(v, 2000);
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, `${field} is not a valid URL`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, `${field} must be an http(s) link`);
  return u.toString();
}

export const blankLead = () => ({
  id: '', name: '', city: '', owner: '', fb: '', ig: '', email: '', site: '', problem: '', hook: '', note: '',
  status: 'queued', track: 'cold', step: 0, account: '', lastSentAt: '', repliedAt: '', demoLink: '',
  verified: false, order: 0, demoVideo: '', source: '',
});

export function rowToLead(row) {
  const o = {};
  LEAD_COLS.forEach((c, i) => { o[c] = row[i] ?? ''; });
  o.step = Number(o.step) || 0;
  o.order = Number(o.order) || 0;
  o.verified = String(o.verified).toUpperCase() === 'TRUE';
  return o;
}

export const leadToRow = (lead) =>
  LEAD_COLS.map((c) => (c === 'verified' ? (lead.verified ? 'TRUE' : 'FALSE') : lead[c] ?? ''));

export function rowToLog(row) {
  const o = {};
  LOG_COLS.forEach((c, i) => { o[c] = row[i] ?? ''; });
  o.step = Number(o.step) || 0;
  return o;
}

function pickEnum(list, v, field) {
  const s = str(v);
  if (!list.includes(s)) throw new HttpError(400, `${field} must be one of: ${list.filter(Boolean).join(', ')}`);
  return s;
}

// Validates `input` and returns a full lead. With `base`, only keys present in `input` change.
export function cleanLead(input, base = null) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Expected a lead object');
  const out = base ? { ...base } : blankLead();
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = str(input[k], k === 'note' ? 2000 : 300);
  if (has('hook') && out.hook !== (base?.hook ?? '') && hookWordCount(out.hook) > HOOK_MAX_WORDS) {
    throw new HttpError(400, `hook must be ${HOOK_MAX_WORDS} words or fewer: one true detail you saw on their page`);
  }
  for (const k of URL_FIELDS) if (has(k)) out[k] = cleanUrl(input[k], k);
  for (const k of DATE_FIELDS) {
    if (!has(k)) continue;
    const s = str(input[k]);
    if (s && Number.isNaN(Date.parse(s))) throw new HttpError(400, `${k} must be an ISO date`);
    // 36h of slack so a date entered in a timezone ahead of the server is not rejected.
    if (s && Date.parse(s) > Date.now() + 36 * 3600 * 1000) throw new HttpError(400, `${k} must not be in the future`);
    out[k] = s;
  }
  if (has('problem')) out.problem = pickEnum(ENUMS.problem, input.problem, 'problem');
  if (has('status')) out.status = pickEnum(ENUMS.status, input.status, 'status');
  if (has('track')) out.track = pickEnum(ENUMS.track, input.track, 'track');
  if (has('account')) out.account = pickEnum(ENUMS.account, input.account, 'account');
  if (has('source')) out.source = pickEnum(ENUMS.source, str(input.source).toLowerCase(), 'source');
  if (has('step')) {
    const n = Number(input.step);
    if (!Number.isInteger(n) || n < 0 || n > 4) throw new HttpError(400, 'step must be 0-4');
    out.step = n;
  }
  if (has('verified')) out.verified = input.verified === true || String(input.verified).toUpperCase() === 'TRUE';
  if (has('order') && Number.isFinite(Number(input.order))) out.order = Number(input.order);

  if (!out.name) throw new HttpError(400, 'name is required');
  if (!out.problem) out.problem = out.site ? 'outdated' : 'nosite';
  return out;
}

export function cleanConfig(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Expected a config object');
  const out = {};
  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    out[key] = str(input[key], 500);
  }
  if ('cap' in out) {
    const n = Number(out.cap);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new HttpError(400, 'cap must be a whole number from 1 to 100');
    out.cap = String(n);
  }
  if ('gaps' in out) {
    const parts = out.gaps.split(',').map((s) => s.trim());
    const ok = parts.length === 3 && parts.every((p) => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 60);
    if (!ok) throw new HttpError(400, 'gaps must be three day counts like "2,3,4"');
    out.gaps = parts.join(',');
  }
  if ('siteUrl' in out && out.siteUrl) out.siteUrl = cleanUrl(out.siteUrl, 'siteUrl');
  if ('foundingOffer' in out) {
    const v = out.foundingOffer.toLowerCase();
    if (!['true', 'false', ''].includes(v)) throw new HttpError(400, 'foundingOffer must be true or false');
    out.foundingOffer = v === 'true' ? 'true' : 'false';
  }
  for (const n of [1, 2, 3]) {
    const name = `plan${n}Name`;
    if (name in out && !out[name]) throw new HttpError(400, `Plan ${n} needs a name`);
    for (const [field, optional] of [[`plan${n}Price`, false], [`plan${n}Founding`, true]]) {
      if (!(field in out)) continue;
      const v = out[field].replace(/[$,\s]/g, '');
      if (!v && optional) { out[field] = ''; continue; }
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) {
        throw new HttpError(400, `${field.includes('Price') ? 'Monthly price' : 'Founding price'} for plan ${n} must be a number${optional ? ' (or empty)' : ''}`);
      }
      out[field] = v;
    }
    const note = `plan${n}Note`;
    if (note in out) out[note] = out[note].slice(0, 400);
  }
  return out;
}

export function cleanLogEntry(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Expected a log entry');
  const leadId = str(input.leadId, 100);
  if (!leadId) throw new HttpError(400, 'leadId is required');
  const step = Number(input.step);
  if (!Number.isInteger(step) || step < 0 || step > 4) throw new HttpError(400, 'step must be 0-4');
  const text = typeof input.text === 'string' ? input.text.slice(0, 4000) : '';
  return {
    timestamp: new Date().toISOString(),
    leadId,
    account: pickEnum(['A', 'B', 'C'], input.account, 'account'),
    track: pickEnum(ENUMS.logTrack, input.track, 'track'),
    step,
    channel: pickEnum(ENUMS.channel, input.channel, 'channel'),
    text,
  };
}
