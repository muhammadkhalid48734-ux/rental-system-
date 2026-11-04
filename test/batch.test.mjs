import test from 'node:test';
import assert from 'node:assert/strict';
import { batch } from '../client/src/lib/batch.js';
import { cacheKey } from '../client/src/lib/gen.js';
import { genCache } from '../client/src/lib/genCache.js';
import { PROMPT_VERSION } from '../client/src/lib/messages.js';

// The batch runs in the browser; here fetch answers like the server would.
const calls = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push(body.leadId);
  return { ok: true, status: 200, json: async () => ({ text: `new wording for ${body.leadId}`, source: 'personalized', promptVersion: PROMPT_VERSION, pace: 0 }) };
};

const stage = { key: 'pitch' };
const item = (id) => ({ lead: { id, name: id }, stage, template: `template ${id}` });
const key = (id) => cacheKey({ id }, stage);
const finished = () => new Promise((resolve) => {
  const check = () => (batch.getSnapshot().running ? setTimeout(check, 5) : resolve(batch.getSnapshot()));
  check();
});

test('Generate all skips old-wording drafts and edited drafts; Regenerate old wording rewrites only old ones and never touches edits', async () => {
  genCache.clear(key('none')); genCache.clear(key('old')); genCache.clear(key('oldEdited')); genCache.clear(key('fresh'));
  genCache.update(key('old'), (c) => ({ ...c, versions: [{ text: 'old text', source: 'personalized' }], pos: 1 }));
  genCache.update(key('oldEdited'), (c) => ({ ...c, versions: [{ text: 'old text', source: 'personalized' }], pos: 1, draft: 'my own words' }));
  genCache.update(key('fresh'), (c) => ({ ...c, versions: [{ text: 'fresh text', source: 'personalized', pv: PROMPT_VERSION }], pos: 1 }));
  const items = ['none', 'old', 'oldEdited', 'fresh'].map(item);

  calls.length = 0;
  await batch.start(items);
  const first = await finished();
  assert.deepEqual(calls, ['none'], 'only the lead without any draft');
  assert.match(first.summary, /1 personalized/);
  assert.match(first.summary, /2 have old wording|1 have old wording/);
  assert.match(first.summary, /skipped because you edited/);
  batch.dismiss();

  calls.length = 0;
  await batch.start(items, 'old');
  const second = await finished();
  assert.deepEqual(calls, ['old'], 'old wording only; the edited draft and the current ones are left alone');
  assert.match(second.summary, /1 rewritten with the new wording/);
  assert.match(second.summary, /skipped because you edited/);
  batch.dismiss();

  assert.equal(genCache.get(key('oldEdited')).draft, 'my own words');
  const rewritten = genCache.get(key('old'));
  assert.equal(rewritten.versions.length, 2, 'the old draft stays as a version; nothing is overwritten');
  assert.equal(rewritten.versions[0].text, 'old text');
  assert.equal(rewritten.versions[1].pv, PROMPT_VERSION);
  assert.equal(rewritten.pos, 2);

  calls.length = 0;
  await batch.start(items, 'old');
  await finished();
  assert.deepEqual(calls, [], 'once rewritten, nothing is old any more');
});

test('Regenerate old wording stops cleanly on a rate limit and keeps the old drafts', async () => {
  const ids = ['r1', 'r2', 'r3'];
  for (const id of ids) {
    genCache.clear(key(id));
    genCache.update(key(id), (c) => ({ ...c, versions: [{ text: `old ${id}`, source: 'personalized' }], pos: 1 }));
  }
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    return { ok: false, status: 429, json: async () => ({ error: 'slow', code: 'rate_limited', retryAfterMs: 30000 }) };
  };
  await batch.start(ids.map(item), 'old');
  const s = await finished();
  assert.equal(n, 1, 'stops at the first rate limit');
  assert.match(s.summary, /^Stopped: Rate limit reached/);
  assert.match(s.summary, /The other 3 stay as they are/);
  for (const id of ids) assert.equal(genCache.get(key(id)).versions[0].text, `old ${id}`);
  batch.dismiss();
});
