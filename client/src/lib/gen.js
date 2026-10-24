import { api } from '../api.js';
import { genCache } from './genCache.js';

export const KIND_BY_STAGE = {
  pitch: 'cold', fu1: 'followup1', fu2: 'followup2', fu3: 'followup3',
  reply: 'replyAck', demo: 'demo', nudge1: 'demoNudge1', nudge2: 'demoNudge2', nudge3: 'demoNudge3',
};

const MAX_VERSIONS = 12;

/** Cache key: lead + message step (the demo message also depends on the link it contains). */
export const cacheKey = (lead, stage) =>
  `${lead.id}:${stage.key}${stage.key === 'demo' ? `:${String(lead.demoLink || '').trim()}` : ''}`;

/**
 * What the card shows. `all[0]` is always the offline template (rebuilt from current data, never stored);
 * the stored versions follow it. `edited` means the textarea differs from the version being shown.
 */
export function view(entry, template) {
  const all = [{ text: template, source: 'template' }, ...entry.versions];
  const pos = Math.min(Math.max(entry.pos, 0), all.length - 1);
  const shown = all[pos];
  const text = entry.draft ?? shown.text;
  return { all, pos, shown, text, edited: entry.draft !== null && entry.draft !== shown.text };
}

/** Saves an unsent edit as its own version so replacing it on screen never loses it. */
export function stashEdit(key, template) {
  genCache.update(key, (cur) => {
    const v = view(cur, template);
    if (!v.edited) return { ...cur, draft: null };
    const versions = [...cur.versions, { text: cur.draft, source: v.shown.source, edited: true, at: Date.now() }].slice(-MAX_VERSIONS);
    return { ...cur, versions, draft: null };
  });
}

export function goTo(key, template, target) {
  genCache.update(key, (cur) => {
    const max = cur.versions.length; // all.length - 1
    return { ...cur, pos: Math.min(Math.max(target, 0), max), draft: null };
  });
}

/**
 * Asks the server for a new draft and stores it as a new version. A "template" answer (the AI draft failed
 * the server's checks twice) just shows the template again. Throws on provider errors.
 */
export async function requestVariant({ lead, stage, hint, template }) {
  const key = cacheKey(lead, stage);
  const cur = genCache.get(key);
  const previousVariants = [template, ...cur.versions.map((v) => v.text), cur.draft].filter(Boolean).slice(-5);
  const res = await api.generate({
    leadId: lead.id,
    kind: KIND_BY_STAGE[stage.key],
    hint: hint || undefined,
    previousVariants,
  });
  if (res.source === 'personalized') {
    genCache.update(key, (c) => {
      const versions = [...c.versions, { text: res.text, source: 'personalized', at: Date.now() }].slice(-MAX_VERSIONS);
      return { ...c, versions, pos: versions.length, draft: null };
    });
  } else {
    genCache.update(key, (c) => ({ ...c, pos: 0, draft: null }));
  }
  return res;
}

export function errorMessage(err) {
  const why = err.detail ? ` Groq says: ${err.detail}` : '';
  switch (err.code) {
    case 'rate_limited':
      return `Rate limit reached. Try again in about ${Math.max(1, Math.ceil((err.retryAfterMs || 60000) / 1000))}s.${why}`;
    case 'not_configured':
      return 'AI personalization is off. Add your Groq API key on the server (see Settings).';
    case 'bad_key':
      return 'The AI provider rejected the API key. Check the Groq key on the server.';
    case 'provider_down':
      return `${err.message || 'The AI provider is not responding. Try again shortly.'}${why}`;
    default:
      return `${err.message || 'Could not generate a message.'}${why}`;
  }
}
