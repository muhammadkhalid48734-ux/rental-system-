import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rowToLead, leadToRow, cleanLead, IMPORTED_CHANNEL } from '../schema.js';
import { HttpError, ah } from '../util.js';

const normName = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * One Log row per message an imported lead already received (steps 0..step-1). Only the latest carries a date
 * (lastSentAt); earlier ones are blank. All are marked "imported", which the client keeps out of today's meters.
 */
export function backfillRows(lead) {
  if (lead.track !== 'cold' || !(lead.step > 0)) return [];
  return Array.from({ length: lead.step }, (_, i) => [
    i === lead.step - 1 ? lead.lastSentAt : '', lead.id, lead.account, 'cold', i, IMPORTED_CHANNEL,
  ]);
}

// Shared by POST /api/leads and the seed script. Skips names that already exist.
export async function createLeads(store, inputs) {
  const leads = (await store.getRows('Leads')).map(rowToLead);
  const seen = new Set(leads.map((l) => normName(l.name)));
  let order = leads.reduce((m, l) => Math.max(m, l.order || 0), 0);
  const created = [];
  const skipped = [];
  for (const input of inputs) {
    const lead = cleanLead(input, null);
    const key = normName(lead.name);
    if (seen.has(key)) {
      skipped.push(lead.name);
      continue;
    }
    seen.add(key);
    lead.id = randomUUID();
    lead.order = ++order;
    created.push(lead);
  }
  if (created.length) await store.appendRows('Leads', created.map(leadToRow));
  const logRows = created.flatMap(backfillRows);
  if (logRows.length) await store.appendRows('Log', logRows);
  return { created, skipped, logged: logRows.length };
}

export function leadsRouter(store, lock) {
  const r = Router();

  r.get('/', ah(async (_req, res) => {
    const leads = (await store.getRows('Leads')).map(rowToLead).filter((l) => l.id);
    res.json({ leads });
  }));

  r.post('/', ah(async (req, res) => {
    const body = req.body;
    const inputs = Array.isArray(body) ? body : Array.isArray(body?.leads) ? body.leads : [body];
    if (inputs.length > 500) throw new HttpError(400, 'Too many leads in one request (max 500)');
    res.json(await lock(() => createLeads(store, inputs)));
  }));

  // The id is accepted in the path (/api/leads/<id>) or as ?id=<id>. The client uses the query form, because it
  // is a single path segment and so works with any single-segment function routing.
  const idOf = (req) => {
    const id = req.params.id ?? req.query.id;
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'Lead id is required');
    return id;
  };

  const patch = ah(async (req, res) => {
    const id = idOf(req);
    const lead = await lock(async () => {
      const rows = await store.getRows('Leads');
      const i = rows.findIndex((row) => row[0] === id);
      if (i < 0) throw new HttpError(404, 'Lead not found');
      const updated = cleanLead(req.body, rowToLead(rows[i]));
      await store.updateRow('Leads', i, leadToRow(updated));
      return updated;
    });
    res.json({ lead });
  });

  const remove = ah(async (req, res) => {
    const id = idOf(req);
    await lock(async () => {
      const rows = await store.getRows('Leads');
      const i = rows.findIndex((row) => row[0] === id);
      if (i < 0) throw new HttpError(404, 'Lead not found');
      await store.deleteRow('Leads', i);
    });
    res.json({ ok: true });
  });

  r.patch('/', patch);
  r.patch('/:id', patch);
  r.delete('/', remove);
  r.delete('/:id', remove);

  return r;
}
