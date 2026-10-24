import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../server/queue.js';

function fakeClock() {
  const c = { t: 1_000_000 };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.t += ms; };
  return c;
}

test('never more than maxRpm starts in any rolling 60 seconds, one at a time', async () => {
  for (const maxRpm of [3, 10]) {
    const clock = fakeClock();
    const q = createQueue({ maxRpm, maxWaitMs: Infinity, now: clock.now, sleep: clock.sleep });
    const starts = [];
    let running = 0;
    let maxRunning = 0;
    const jobs = Array.from({ length: 35 }, (_, i) => q.run(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      starts.push(clock.now());
      clock.t += 1500; // each call takes 1.5s
      running--;
      return i;
    }));
    assert.deepEqual(await Promise.all(jobs), Array.from({ length: 35 }, (_, i) => i));
    assert.equal(maxRunning, 1);
    for (let i = 0; i < starts.length; i++) {
      const inWindow = starts.filter((s) => s > starts[i] - 60000 && s <= starts[i]).length;
      assert.ok(inWindow <= maxRpm, `maxRpm ${maxRpm}: ${inWindow} starts within 60s at job ${i}`);
    }
  }
});

test('rejects with rate_limited and a retry hint instead of waiting longer than maxWaitMs', async () => {
  const clock = fakeClock();
  const q = createQueue({ maxRpm: 2, maxWaitMs: 5000, now: clock.now, sleep: clock.sleep });
  await q.run(async () => 'a');
  await q.run(async () => 'b');
  assert.ok(q.nextSlotIn() > 5000);
  await assert.rejects(q.run(async () => 'c'), (e) => e.code === 'rate_limited' && e.retryAfterMs > 5000 && e.retryAfterMs <= 60000);
  clock.t += 60000;
  assert.equal(q.nextSlotIn(), 0);
  assert.equal(await q.run(async () => 'd'), 'd');
});

test('a failing job does not block the queue', async () => {
  const clock = fakeClock();
  const q = createQueue({ maxRpm: 10, now: clock.now, sleep: clock.sleep });
  await assert.rejects(q.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await q.run(async () => 'ok'), 'ok');
});
