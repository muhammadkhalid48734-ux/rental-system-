const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Whole calendar days from a to b (positive when b is later). Rounding absorbs DST shifts.
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

export const isSameDay = (a, b) => ymd(a) === ymd(b);

export const fmtLongDate = (d) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const fmtShortDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Strict YYYY-MM-DD -> local Date at 00:00, or null when it is not a real calendar date. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return y >= 2000 && date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/**
 * A stored timestamp for a date-only value: local midday, so the calendar day is the same in any timezone
 * (follow-up due dates are computed per day). Today's date never lands in the future.
 */
export function dayToIso(day, now = new Date()) {
  const d = parseDay(day);
  if (!d) return '';
  d.setHours(12, 0, 0, 0);
  return (d > now ? now : d).toISOString();
}
