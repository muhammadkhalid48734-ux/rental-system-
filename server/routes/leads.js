import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rowToLead, leadToRow, cleanLead } from '../schema.js';
import { HttpError, ah } from '../util.js';

const normName = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

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
  return { created, skipped };
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

  r.patch('/:id', ah(async (req, res) => {
    const lead = await lock(async () => {
      const rows = await store.getRows('Leads');
      const i = rows.findIndex((row) => row[0] === req.params.id);
      if (i < 0) throw new HttpError(404, 'Lead not found');
      const updated = cleanLead(req.body, rowToLead(rows[i]));
      await store.updateRow('Leads', i, leadToRow(updated));
      return updated;
    });
    res.json({ lead });
  }));

  r.delete('/:id', ah(async (req, res) => {
    await lock(async () => {
      const rows = await store.getRows('Leads');
      const i = rows.findIndex((row) => row[0] === req.params.id);
      if (i < 0) throw new HttpError(404, 'Lead not found');
      await store.deleteRow('Leads', i);
    });
    res.json({ ok: true });
  }));

  return r;
}
