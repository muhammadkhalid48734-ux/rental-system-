// Must be called synchronously from a click handler so the browser treats it as a user gesture.
export function copyText(text) {
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    ok = false;
  }
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => ok);
  }
  return Promise.resolve(ok);
}

const CSV_COLS = [
  'id', 'name', 'city', 'owner', 'fb', 'ig', 'email', 'site', 'problem', 'hook', 'note',
  'status', 'track', 'step', 'account', 'lastSentAt', 'repliedAt', 'demoLink', 'verified', 'order',
];

export function leadsToCsv(leads) {
  // A leading = + - @ makes spreadsheets treat a cell as a formula, so neutralise it.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLS.join(',')];
  for (const l of leads) lines.push(CSV_COLS.map((c) => cell(l[c])).join(','));
  return lines.join('\n');
}
