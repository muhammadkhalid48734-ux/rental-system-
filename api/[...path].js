// Vercel serverless entry: every /api/* request lands here and is served by the Express app.
import { createApp } from '../server/app.js';
import { authSettings } from '../server/auth.js';
import { createStore, lazyInit } from '../server/store.js';

export function createHandler({ store, env = process.env } = {}) {
  let app;
  return function handler(req, res) {
    // Fail closed: without a usable password and session secret nothing is served.
    const settings = authSettings(env);
    if (!settings.ok) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Server is not configured: ${settings.problems.join('; ')}.`, code: 'not_configured' }));
      return undefined;
    }
    try {
      // The Sheets connection is opened lazily, so unauthenticated requests never trigger Google calls.
      app ??= createApp({ store: lazyInit(store ?? createStore({ env })), env, localOnly: false });
    } catch (err) {
      console.error('[startup]', err.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Server is not configured correctly. Check the environment variables and the function logs.', code: 'not_configured' }));
      return undefined;
    }
    return app(req, res);
  };
}

export default createHandler();
