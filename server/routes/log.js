import { Router } from 'express';
import { cleanLogEntry, rowToLog } from '../schema.js';
import { ah } from '../util.js';
import { recordMessage } from '../history.js';

const WINDOW_MS = 14 * 24 * 3600 * 1000; // today's counts, undo slack, plus the streak and 7-day stats

export function logRouter(store, lock) {
  const r = Router();

  // Not in the original endpoint list, but the browser needs the log to count today's sends.
  r.get('/', ah(async (_req, res) => {
    const cutoff = Date.now() - WINDOW_MS;
    const log = (await store.getRows('Log')).map(rowToLog).filter((e) => Date.parse(e.timestamp) >= cutoff);
    res.json({ log });
  }));

  r.post('/', ah(async (req, res) => {
    const entry = cleanLogEntry(req.body);
    await lock(async () => {
      await store.appendRows('Log', [[entry.timestamp, entry.leadId, entry.account, entry.track, entry.step, entry.channel]]);
      await recordMessage(store, entry);
    });
    const { text, ...publicEntry } = entry;
    res.json({ entry: publicEntry });
  }));

  return r;
}
