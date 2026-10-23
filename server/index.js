import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { createStore } from './store.js';
import { seedExamples } from './seed.js';
import { leadsRouter } from './routes/leads.js';
import { configRouter } from './routes/config.js';
import { logRouter } from './routes/log.js';
import { HttpError, makeLock } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const PORT = Number(process.env.PORT) || 3001;
const HOST = '127.0.0.1'; // local tool with no login: never listen on the network
const memory = process.argv.includes('--memory');

const store = createStore({ memory });
const lock = makeLock();
const app = express();

// Block DNS-rebinding style requests: only answer to localhost host names.
app.use((req, res, next) => {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return res.status(403).json({ error: 'Forbidden host' });
  next();
});
app.use(express.json({ limit: '1mb' }));

app.use('/api/leads', leadsRouter(store, lock));
app.use('/api/config', configRouter(store, lock));
app.use('/api/log', logRouter(store, lock));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

const dist = path.join(here, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  const code = err?.code || err?.response?.status;
  console.error('[error]', err?.message || err);
  let message = 'Something went wrong talking to Google Sheets.';
  if (code === 403 || code === 404) {
    message = 'Google Sheets refused access. Check GOOGLE_SHEET_ID and that the sheet is shared with the service account email (Editor).';
  } else if (code === 429) {
    message = 'Google Sheets rate limit hit. Wait a minute and try again.';
  }
  res.status(502).json({ error: message });
});

try {
  await store.init();
  if (memory) {
    await seedExamples(store);
    console.log('Demo mode: data lives in memory only and resets on restart.');
  }
} catch (err) {
  console.error(`\nCould not start: ${err.message}\n`);
  if (!memory) console.error('Check .env and that the sheet is shared with the service account (see README.md).\n');
  process.exit(1);
}

app.listen(PORT, HOST, () => {
  console.log(`Outreach Desk API on http://localhost:${PORT} (${store.kind} storage)`);
});
