import { LlmError } from './llm.js';

/**
 * One request at a time, and at most `maxRpm` request starts in any rolling 60 seconds.
 * If the next free slot is further away than `maxWaitMs` the job is rejected with a retry hint instead of
 * holding a serverless function open. State is per process (per instance on Vercel).
 */
export function createQueue({ maxRpm = 10, maxWaitMs = 8000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const starts = [];
  let tail = Promise.resolve();

  const prune = (t) => {
    while (starts.length && starts[0] <= t - 60000) starts.shift();
  };
  const waitNeeded = () => {
    const t = now();
    prune(t);
    return starts.length >= maxRpm ? starts[0] + 60000 - t : 0;
  };

  return {
    /** Milliseconds until a request could start without waiting (0 when a slot is free). */
    nextSlotIn: waitNeeded,
    run(fn) {
      const job = tail.then(async () => {
        const wait = waitNeeded();
        if (wait > maxWaitMs) throw new LlmError('rate_limited', 'Local rate limit reached.', { retryAfterMs: wait });
        if (wait > 0) await sleep(wait);
        starts.push(now());
        return fn();
      });
      tail = job.catch(() => {});
      return job;
    },
  };
}
