import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createStore } from './store.js';
import { createLeads } from './routes/leads.js';

// Fake leads, clearly marked. The handles are placeholders, not real accounts.
export const EXAMPLE_LEADS = [
  {
    name: 'EXAMPLE – Sunny Day Bounce Co',
    city: 'Austin, TX',
    owner: 'Jamie Example',
    ig: 'https://www.instagram.com/example_do_not_message/',
    fb: 'https://www.facebook.com/example.do.not.message',
    site: 'https://sunnydaybounce.example',
    problem: 'down',
    hook: 'your pastel balloon arches',
    note: 'EXAMPLE — fake lead for trying the app. Delete it from the Leads tab.',
  },
  {
    name: 'EXAMPLE – Party Palace Rentals',
    city: 'Tampa, FL',
    owner: '',
    ig: 'https://www.instagram.com/example_do_not_message/',
    problem: 'nosite',
    hook: '',
    note: 'EXAMPLE — fake lead for trying the app. Delete it from the Leads tab.',
  },
  {
    name: 'EXAMPLE – Jump Zone Party Rentals',
    city: 'Denver, CO',
    owner: 'Sam Example',
    fb: 'https://www.facebook.com/example.do.not.message',
    email: 'hello@jumpzone.example',
    site: 'https://jumpzone.example',
    problem: 'outdated',
    hook: 'the water slide lineup',
    note: 'EXAMPLE — fake lead for trying the app. Delete it from the Leads tab.',
  },
];

export async function seedExamples(store) {
  return createLeads(store, EXAMPLE_LEADS);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = createStore({ memory: process.argv.includes('--memory') });
  await store.init();
  const { created, skipped } = await seedExamples(store);
  console.log(`Seeded ${created.length} example lead(s)${skipped.length ? `, skipped ${skipped.length} that already exist` : ''}.`);
}
