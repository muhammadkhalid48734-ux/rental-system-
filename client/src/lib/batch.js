import { cacheKey, errorMessage, requestVariant, view } from './gen.js';
import { genCache } from './genCache.js';

// "Generate all for today": one lead at a time, outside React so it keeps running across tab switches.

const initial = { running: false, total: 0, done: 0, current: '', waitMs: 0, summary: '' };
let state = { ...initial };
let snapshot = { ...state };
const listeners = new Set();
let controller = null;

const emit = () => {
  snapshot = { ...state };
  listeners.forEach((fn) => fn());
};
const set = (patch) => {
  state = { ...state, ...patch };
  emit();
};

function pause(ms, signal) {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const tick = () => {
      const left = end - Date.now();
      if (signal.aborted || left <= 0) { set({ waitMs: 0 }); resolve(); return; }
      set({ waitMs: left });
      setTimeout(tick, Math.min(1000, left));
    };
    tick();
  });
}

export const batch = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => snapshot,
  cancel() {
    controller?.abort();
  },
  dismiss() {
    if (!state.running) set({ ...initial });
  },

  /** items: [{ lead, stage, template }] in on-screen order. */
  async start(items) {
    if (state.running) return;
    const todo = [];
    let skippedEdited = 0;
    let already = 0;
    for (const it of items) {
      const entry = genCache.get(cacheKey(it.lead, it.stage));
      if (view(entry, it.template).edited) skippedEdited++;
      else if (entry.versions.some((v) => v.source === 'personalized')) already++;
      else todo.push(it);
    }

    controller = new AbortController();
    set({ ...initial, running: true, total: todo.length });
    let personalized = 0;
    let fellBack = 0;
    let failures = 0;
    let stopped = '';

    for (let i = 0; i < todo.length; i++) {
      if (controller.signal.aborted) { stopped = 'Cancelled.'; break; }
      set({ done: i, current: todo[i].lead.name });
      try {
        const res = await requestVariant({ ...todo[i], hint: '' });
        failures = 0;
        if (res.source === 'personalized') personalized++;
        else fellBack++;
        if (res.pace > 0 && i < todo.length - 1 && !controller.signal.aborted) await pause(res.pace, controller.signal);
      } catch (err) {
        if (err.code === 'rate_limited' || err.code === 'not_configured' || err.code === 'bad_key' || err.status === 401) {
          stopped = errorMessage(err);
          break;
        }
        failures++;
        if (failures >= 2) { stopped = errorMessage(err); break; }
      }
    }

    const done = personalized + fellBack;
    const parts = [`${personalized} personalized`];
    if (fellBack) parts.push(`${fellBack} fell back to the template`);
    if (already) parts.push(`${already} already had one`);
    if (skippedEdited) parts.push(`${skippedEdited} skipped because you edited them`);
    const rest = todo.length - done;
    let summary = `${parts.join(', ')}.`;
    if (stopped) summary = `Stopped: ${stopped} ${summary}${rest > 0 ? ` The other ${rest} stay as templates.` : ''}`;
    set({ running: false, done, current: '', waitMs: 0, summary });
  },
};
