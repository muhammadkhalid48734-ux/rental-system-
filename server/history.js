// Exact text of every message the user marked as sent, so later generations can avoid repeating it.

export function kindFor(track, step) {
  if (track === 'reply') return 'replyAck';
  if (track === 'cold') return step === 0 ? 'cold' : `followup${step}`;
  return step === 0 ? 'demo' : `demoNudge${step}`;
}

/** Called for every POST /api/log. A send with text adds a row; an undo adds a compensating row. */
export async function recordMessage(store, entry) {
  const kind = kindFor(entry.track, entry.step);
  if (entry.channel === 'undo') {
    await store.appendRows('Messages', [[entry.timestamp, entry.leadId, `${kind}:undo`, '']]);
  } else if (entry.text) {
    await store.appendRows('Messages', [[entry.timestamp, entry.leadId, kind, entry.text]]);
  }
}

/** Sent messages for a lead, oldest first, with undone ones cancelled out. */
export async function earlierMessages(store, leadId, limit = 6) {
  const rows = (await store.getRows('Messages'))
    .filter((r) => r[1] === leadId)
    .map(([timestamp, , kind, text]) => ({ timestamp, kind, text }))
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const out = [];
  for (const r of rows) {
    if (r.kind.endsWith(':undo')) {
      const base = r.kind.slice(0, -5);
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].kind === base) { out.splice(i, 1); break; }
      }
    } else {
      out.push(r);
    }
  }
  return out.slice(-limit);
}
