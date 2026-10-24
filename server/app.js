import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { authMiddleware, authSettings, logout } from './auth.js';
import { isProduction } from './env.js';
import { DEFAULT_MODEL, LlmError, generate } from './llm.js';
import { createQueue } from './queue.js';
import { CSP } from './csp.js';
import { leadsRouter } from './routes/leads.js';
import { configRouter } from './routes/config.js';
import { logRouter } from './routes/log.js';
import { generateRouter } from './routes/generate.js';
import { HttpError, makeLock } from './util.js';

const STATUS_BY_LLM_CODE = { rate_limited: 429, bad_key: 503, provider_down: 502, not_configured: 503, bad_output: 502 };

/**
 * Builds the Express app. Used by the local server (server/index.js) and by the Vercel function (api/[...path].js).
 * `localOnly` restricts it to localhost host names (local dev only; off on Vercel).
 */
export function createApp({ store, env = process.env, localOnly = false, staticDir = null, llm = { generate }, queue, auth = {} } = {}) {
  const app = express();
  const lock = makeLock();
  const settings = authSettings(env);
  const llmQueue = queue ?? createQueue({
    maxRpm: Math.max(1, Number(env.GROQ_MAX_RPM) || 10),
    maxWaitMs: 8000,
  });

  app.disable('x-powered-by');
  if (isProduction(env)) app.set('trust proxy', 1); // Vercel's proxy sets x-forwarded-* headers

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  if (localOnly) {
    // Block DNS-rebinding style requests: only answer to localhost host names.
    app.use((req, res, next) => {
      const host = (req.headers.host || '').replace(/:\d+$/, '');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return res.status(403).json({ error: 'Forbidden host' });
      return next();
    });
  }

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Every /api route goes through this; only POST /api/login is reachable without a session.
  app.use('/api', authMiddleware(settings, auth));

  app.post('/api/logout', logout(settings));
  app.get('/api/session', (_req, res) => {
    res.json({
      ok: true,
      authRequired: settings.required,
      llm: { configured: Boolean(env.GROQ_API_KEY), model: env.GROQ_MODEL || DEFAULT_MODEL },
    });
  });
  app.use('/api/leads', leadsRouter(store, lock));
  app.use('/api/config', configRouter(store, lock));
  app.use('/api/log', logRouter(store, lock));
  app.use('/api/generate', generateRouter({ store, llm, queue: llmQueue, env }));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use((_req, res, next) => {
      res.setHeader('Content-Security-Policy', CSP);
      next();
    });
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof LlmError) {
      return res.status(STATUS_BY_LLM_CODE[err.code] || 502).json({ error: err.message, code: err.code, retryAfterMs: err.retryAfterMs });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    const code = err?.code || err?.response?.status;
    console.error('[error]', err?.message || err);
    let message = 'Something went wrong talking to Google Sheets.';
    if (code === 403 || code === 404) {
      message = 'Google Sheets refused access. Check GOOGLE_SHEET_ID and that the sheet is shared with the service account email (Editor).';
    } else if (code === 429) {
      message = 'Google Sheets rate limit hit. Wait a minute and try again.';
    }
    return res.status(502).json({ error: message });
  });

  return app;
}
