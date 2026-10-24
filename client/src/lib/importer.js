import { dayToIso, parseDay, ymd } from './dates.js';

// Parses rows pasted from a spreadsheet. Column order:
//   business, website, Instagram, Facebook, note, email
// optional progress columns (leads you already messaged before using the app):
//   status, step, lastSentAt (YYYY-MM-DD), account (A or B)

const EMPTY = /^(?:|none|n\/a|na|no|-|--|—|null|no website|no site)$/i;
const TRACKING = /^(?:fbclid|gclid|igshid|igsh|mc_cid|mc_eid|_ga|ref|ref_src|utm_.*|fb_.*)$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;

export const normName = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function cleanUrl(raw, kind = 'site') {
  let s = String(raw || '').trim();
  if (EMPTY.test(s)) return '';
  if (kind !== 'site' && !/[./]/.test(s)) {
    s = `${kind === 'ig' ? 'instagram.com' : 'facebook.com'}/${s.replace(/^@/, '')}`;
  } else if (/^@/.test(s)) {
    s = `instagram.com/${s.slice(1)}`;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return '';
  }
}

export function extractEmail(...texts) {
  for (const t of texts) {
    const m = String(t || '').match(EMAIL_RE);
    if (m) return m[0].toLowerCase().replace(/[.,;:]+$/, '');
  }
  return '';
}

export function guessProblem({ site, note }) {
  const n = String(note || '').toLowerCase();
  if (/\b(down|not loading|won'?t load|doesn'?t load|dead|404|500|offline|can'?t (open|reach)|broken|unreachable|error|timed? ?out)\b/.test(n)) return 'down';
  if (/\b(parked|for sale|godaddy|get this domain|expired|domain)\b/.test(n)) return 'parked';
  if (!site) return /\b(social|posts?|active|facebook only|instagram only|ig only|fb only)\b/.test(n) ? 'social' : 'nosite';
  if (/\b(no site|no website|nosite)\b/.test(n)) return 'nosite';
  return 'outdated';
}

const isSocialHost = (url, host) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').endsWith(host);
  } catch {
    return false;
  }
};

export const IMPORT_STATUSES = ['queued', 'active', 'replied', 'won', 'lost', 'done'];

const blankCell = (v) => /^(?:|-|--|—|n\/a|na|none|null)$/i.test(String(v ?? '').trim());
export const cellText = (v) => (blankCell(v) ? '' : String(v).trim());

/** Raw text of columns 7-10, or null when the row has none (old 6-column behaviour). */
function rawProgress(cells) {
  const [status = '', step = '', lastSent = '', account = ''] = cells.slice(6, 10);
  return [status, step, lastSent, account].some((c) => !blankCell(c)) ? { status, step, lastSent, account } : null;
}

/**
 * Checks the progress columns of one row and turns them into lead fields.
 * Returns { errors, notes, progress }; progress is null when there are errors.
 * Cold track always; step = messages already sent; lastSentAt is stored as local midday of the given day.
 */
export function resolveProgress(raw, { now = new Date(), defaultAccount = '' } = {}) {
  const errors = [];
  const notes = [];
  const statusIn = cellText(raw.status).toLowerCase();
  const stepIn = cellText(raw.step);
  const dayIn = cellText(raw.lastSent);
  let account = cellText(raw.account).toUpperCase();

  let status = statusIn;
  if (status && !IMPORT_STATUSES.includes(status)) {
    errors.push(`status “${cellText(raw.status)}” must be one of: ${IMPORT_STATUSES.join(', ')}`);
    status = '';
  }
  let step = null;
  if (stepIn !== '') {
    if (!/^\d+$/.test(stepIn) || Number(stepIn) > 4) errors.push(`step “${stepIn}” must be a whole number from 0 to 4 (messages already sent)`);
    else step = Number(stepIn);
  }
  let day = '';
  if (dayIn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIn)) errors.push(`lastSentAt “${dayIn}” must look like YYYY-MM-DD`);
    else if (!parseDay(dayIn)) errors.push(`lastSentAt “${dayIn}” is not a real date`);
    else if (dayIn > ymd(now)) errors.push(`lastSentAt ${dayIn} is in the future`);
    else day = dayIn;
  }
  if (account && account !== 'A' && account !== 'B') {
    errors.push(`account “${cellText(raw.account)}” must be A or B`);
    account = '';
  }
  if (!account && defaultAccount) {
    account = defaultAccount;
    notes.push(`account set to ${defaultAccount} (your default)`);
  }

  const fieldsOk = !errors.length;
  const effStatus = status || (step > 0 ? 'active' : 'queued');
  const effStep = step ?? (effStatus === 'done' ? 4 : 0);
  if (fieldsOk) {
    if (!status && step > 0) notes.push('status set to active (a step was given)');
    if (step === null && effStatus === 'done') notes.push('step set to 4 (done)');

    if (effStatus === 'queued') {
      if (effStep > 0) errors.push('a queued lead has not been messaged yet, so step must be 0 (or change the status)');
      if (day) errors.push('a queued lead has not been messaged yet, so remove lastSentAt (or change the status)');
    } else {
      if (effStatus === 'active' && effStep === 0) errors.push('active needs step 1-3 (messages already sent)');
      if (effStatus === 'active' && effStep === 4) errors.push('step 4 means every message was sent: use status done');
      if (effStatus === 'done' && effStep === 0) errors.push('done needs step 1-4 (messages already sent)');
      if (effStep === 0 && day) errors.push('lastSentAt is set but step is 0 (no message sent yet)');
      if (effStatus === 'active' && effStep > 0 && effStep < 4 && !day) errors.push('active needs lastSentAt (YYYY-MM-DD) to work out the next due date');
    }
    if (effStep > 0 && !account) errors.push('account (A or B) is required for a lead that was already messaged, so follow-ups come from the same account');
  }

  if (errors.length) return { errors, notes, progress: null };
  return {
    errors,
    notes,
    progress: {
      status: effStatus,
      track: 'cold',
      step: effStep,
      account,
      lastSentDay: day,
      lastSentAt: day ? dayToIso(day, now) : '',
      // A reply that is still unanswered should show up in "Replies to handle" right away.
      repliedAt: effStatus === 'replied' ? now.toISOString() : '',
    },
  };
}

export function parsePaste(text, existingNames = []) {
  const seen = new Set(existingNames.map(normName));
  const rows = [];
  let skippedDup = 0;
  let skippedEmpty = 0;

  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  lines.forEach((line, i) => {
    const cells = line.split('\t').map((c) => c.trim());
    if (i === 0 && /^(business|business name|name)$/i.test(cells[0])) return;
    const name = cells[0];
    if (!name) { skippedEmpty++; return; }

    let site = cleanUrl(cells[1], 'site');
    let ig = cleanUrl(cells[2], 'ig');
    let fb = cleanUrl(cells[3], 'fb');
    const note = cells[4] || '';
    // A "website" that is really a social page belongs in the social column.
    if (site && isSocialHost(site, 'instagram.com')) { ig = ig || site; site = ''; }
    if (site && isSocialHost(site, 'facebook.com')) { fb = fb || site; site = ''; }

    const email = extractEmail(cells[5], note, cells.slice(10).join(' '));
    const key = normName(name);
    const dup = seen.has(key);
    if (dup) skippedDup++;
    seen.add(key);

    rows.push({
      name, site, ig, fb, email, note,
      problem: guessProblem({ site, note }),
      dup,
      raw: rawProgress(cells),
    });
  });

  return { rows, fresh: rows.filter((r) => !r.dup), skippedDup, skippedEmpty, hasProgress: rows.some((r) => r.raw) };
}
