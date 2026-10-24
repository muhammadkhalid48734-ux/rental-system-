import { Router } from 'express';
import { CONFIG_DEFAULTS, cleanConfig } from '../schema.js';
import { ah } from '../util.js';

export async function readConfig(store) {
  const out = { ...CONFIG_DEFAULTS };
  for (const [k, v] of await store.getRows('Config')) if (k in out) out[k] = v ?? '';
  return out;
}

export function configRouter(store, lock) {
  const r = Router();

  r.get('/', ah(async (_req, res) => {
    res.json({ config: await readConfig(store) });
  }));

  r.put('/', ah(async (req, res) => {
    const config = await lock(async () => {
      const merged = { ...(await readConfig(store)), ...cleanConfig(req.body) };
      await store.replaceAll('Config', Object.entries(merged));
      return merged;
    });
    res.json({ config });
  }));

  return r;
}
