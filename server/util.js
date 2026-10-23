export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Serialises writes so read-modify-write cycles against the Sheet never interleave.
export function makeLock() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(() => fn());
    tail = run.catch(() => {});
    return run;
  };
}

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
