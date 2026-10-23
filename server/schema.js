import { HttpError } from './util.js';

export const LEAD_COLS = [
  'id', 'name', 'city', 'owner', 'fb', 'ig', 'email', 'site', 'problem', 'hook', 'note',
  'status', 'track', 'step', 'account', 'lastSentAt', 'repliedAt', 'demoLink', 'verified', 'order',
];
export const LOG_COLS = ['timestamp', 'leadId', 'account', 'track', 'step', 'channel'];

export const CONFIG_DEFAULTS = {
  accA: 'Account A',
  accB: 'Account B',
  cap: '10',
  gaps: '2,3,4',
  setupPrice: '$199',
  monthlyPrice: '$29',
  yourName: '',
  studio: '',
  address: '',
  autoMark: 'false',
};

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
  if ('autoMark' in out) out.autoMark = String(out.autoMark).toLowerCase() === 'true' ? 'true' : 'false';
  return out;
}

export function cleanLogEntry(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Expected a log entry');
  const leadId = str(input.leadId, 100);
  if (!leadId) throw new HttpError(400, 'leadId is required');
  const step = Number(input.step);
  if (!Number.isInteger(step) || step < 0 || step > 4) throw new HttpError(400, 'step must be 0-4');
  return {
    timestamp: new Date().toISOString(),
    leadId,
    account: pickEnum(['A', 'B'], input.account, 'account'),
    track: pickEnum(ENUMS.logTrack, input.track, 'track'),
    step,
    channel: pickEnum(ENUMS.channel, input.channel, 'channel'),
  };
}
