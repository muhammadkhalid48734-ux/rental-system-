// Per lead + message step: the personalized versions, which one is showing, and the user's unsent edit.
// Lives in localStorage so reopening the app does not regenerate anything. Cleared when the message is sent.

const PREFIX = 'outreach-desk:gen:';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export const EMPTY = Object.freeze({ versions: [], pos: 0, draft: null, at: 0 });

const map = new Map();
const listeners = new Set();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const e = JSON.parse(localStorage.getItem(k));
        if (Date.now() - (e.at || 0) > MAX_AGE_MS) stale.push(k);
        else map.set(k.slice(PREFIX.length), Object.freeze({ ...EMPTY, ...e }));
      } catch {
        stale.push(k);
      }
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable: keep everything in memory */ }
}

function persist(key, entry) {
  try {
    if (entry) localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    else localStorage.removeItem(PREFIX + key);
  } catch { /* storage unavailable or full */ }
}

const emit = () => listeners.forEach((fn) => fn());

export const genCache = {
  get(key) {
    load();
    return map.get(key) ?? EMPTY;
  },
  update(key, fn) {
    load();
    const next = { ...fn(map.get(key) ?? EMPTY), at: Date.now() };
    if (!next.versions.length && next.draft === null) {
      if (map.delete(key)) { persist(key, null); emit(); }
      return;
    }
    const frozen = Object.freeze(next);
    map.set(key, frozen);
    persist(key, frozen);
    emit();
  },
  clear(key) {
    load();
    if (map.delete(key)) { persist(key, null); emit(); }
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
