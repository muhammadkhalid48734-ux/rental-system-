// Local server (npm run dev / npm start / npm run demo). On Vercel the app runs from api/[...path].js instead.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { authSettings } from './auth.js';
import { isProduction } from './env.js';
import { createStore } from './store.js';
import { seedExamples } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const PORT = Number(process.env.PORT) || 3001;
const HOST = '127.0.0.1'; // local use only: never listen on the network
const memory = process.argv.includes('--memory');

const auth = authSettings();
if (!auth.ok) {
  console.error(`\nCannot start: ${auth.problems.join('; ')}.\n`);
  process.exit(1);
}

let store;
try {
  store = createStore({ memory });
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

const app = createApp({
  store,
  localOnly: true,
  staticDir: path.join(here, '..', 'client', 'dist'),
});

app.listen(PORT, HOST, () => {
  const mode = isProduction() ? 'production' : 'development';
  console.log(`Outreach Desk API on http://localhost:${PORT} (${store.kind} storage, ${mode}, login ${auth.required ? 'required' : 'off'})`);
});
