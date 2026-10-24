import { HttpError } from './util.js';

export const LEAD_COLS = [
  'id', 'name', 'city', 'owner', 'fb', 'ig', 'email', 'site', 'problem', 'hook', 'note',
  'status', 'track', 'step', 'account', 'lastSentAt', 'repliedAt', 'demoLink', 'verified', 'order',
];
export const LOG_COLS = ['timestamp', 'leadId', 'account', 'track', 'step', 'channel'];
// Exact text of every message the user marked as sent (undo adds a "<kind>:undo" row).
export const MESSAGE_COLS = ['timestamp', 'leadId', 'kind', 'text'];

export const CONFIG_DEFAULTS = {
  accA: 'Account A',
  accB: 'Account B',
  cap: '10',
  gaps: '2,3,4',
  yourName: '',
  studio: '',
  address: '',
  // Finishes "…send it over ___". Used in the first message, the AI prompt and the quick replies.
  demoTurnaround: 'usually within the hour during our support hours, otherwise by the next morning (US time)',
  // Demo packages. Prices are plain numbers (USD); an empty monthly means "no monthly fee".
  pkg1Name: 'Website',
  pkg1Setup: '247',
  pkg1Monthly: '',
  pkg1Note: 'Modern mobile site with your items and photos, gallery, booking request form, your domain connected, 1 round of revisions.',
  pkg2Name: 'Website that books for you',
  pkg2Setup: '297',
  pkg2Monthly: '33',
  pkg2Note: 'Everything in Website, plus an availability calendar that blocks booked dates, booking confirmation email, reminder before the event, review request after, hosting and updates, 30 minutes of edits per month.',
  pkg3Name: 'Book, pay & sign online',
  pkg3Setup: '597',
  pkg3Monthly: '79',
  pkg3Note: 'Everything in the middle plan, plus online deposit payment, a rental waiver customers sign on their phone, text reminders, and 2 hours of edits per month.',
};

// Written only by the server when leads are imported with progress; never accepted from POST /api/log.
export const IMPORTED_CHANNEL = 'imported';

export const ENUMS = {
  problem: ['outdated', 'down', 'parked', 'nosite', 'social'],
  status: ['queued', 'active', 'replied', 'won', 'lost', 'done'],
  track: ['cold', 'demo'],
  account: ['', 'A', 'B'],
  // 'reply' is the photo-permission message; 'undo' (channel) cancels an earlier row.
  logTrack: ['cold', 'demo', 'reply'],
  channel: ['ig', 'fb', 'email', 'undo'],
};

const TEXT_FIELDS = ['name', 'city', 'owner', 'email', 'hook', 'note'];
const URL_FIELDS = ['fb', 'ig', 'site', 'demoLink'];
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
  verified: false, order: 0,
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
  if ('demoTurnaround' in out) {
    // One line only: it is pasted into messages and into the AI prompt.
    out.demoTurnaround = out.demoTurnaround.replace(/\s+/g, ' ').trim();
    if (!out.demoTurnaround) throw new HttpError(400, 'Demo delivery time cannot be empty');
    if (out.demoTurnaround.length > 160) throw new HttpError(400, 'Demo delivery time must be 160 characters or fewer');
    if (/https?:\/\/|www\.|[$€£]\s?\d/i.test(out.demoTurnaround)) throw new HttpError(400, 'Demo delivery time must not contain a link or a price');
  }
  for (const n of [1, 2, 3]) {
    const name = `pkg${n}Name`;
    if (name in out && !out[name]) throw new HttpError(400, `Package ${n} needs a name`);
    for (const [field, optional] of [[`pkg${n}Setup`, false], [`pkg${n}Monthly`, true]]) {
      if (!(field in out)) continue;
      const v = out[field].replace(/[$,\s]/g, '');
      if (!v && optional) { out[field] = ''; continue; }
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) {
        throw new HttpError(400, `${field.includes('Setup') ? 'Setup' : 'Monthly'} price for package ${n} must be a number${optional ? ' (or empty for no monthly fee)' : ''}`);
      }
      out[field] = v;
    }
    const note = `pkg${n}Note`;
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
    account: pickEnum(['A', 'B'], input.account, 'account'),
    track: pickEnum(ENUMS.logTrack, input.track, 'track'),
    step,
    channel: pickEnum(ENUMS.channel, input.channel, 'channel'),
    text,
  };
}
