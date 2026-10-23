// Parses rows pasted from a spreadsheet. Column order:
//   business, website, Instagram, Facebook, note, email

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

    const email = extractEmail(cells[5], note, cells.slice(6).join(' '));
    const key = normName(name);
    const dup = seen.has(key);
    if (dup) skippedDup++;
    seen.add(key);

    rows.push({
      name, site, ig, fb, email, note,
      problem: guessProblem({ site, note }),
      dup,
    });
  });

  return { rows, fresh: rows.filter((r) => !r.dup), skippedDup, skippedEmpty };
}
