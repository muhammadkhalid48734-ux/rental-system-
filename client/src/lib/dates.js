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
