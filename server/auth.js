import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isProduction } from './env.js';

const SESSION_DAYS = 7;
const MIN_PASSWORD = 10;
const MIN_SECRET = 32;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 40;
const WINDOW_MS = 15 * 60 * 1000;
const FAIL_DELAY_MS = 600;

/** Decides whether auth is on and whether the configuration is usable. */
export function authSettings(env = process.env) {
  const prod = isProduction(env);
  const password = env.APP_PASSWORD || '';
  const secret = env.SESSION_SECRET || '';
  const problems = [];
  if (prod) {
    if (!password) problems.push('APP_PASSWORD is not set');
    else if (password.length < MIN_PASSWORD) problems.push(`APP_PASSWORD must be at least ${MIN_PASSWORD} characters`);
    if (!secret) problems.push('SESSION_SECRET is not set');
    else if (secret.length < MIN_SECRET) problems.push(`SESSION_SECRET must be at least ${MIN_SECRET} characters (try: openssl rand -hex 32)`);
  } else if (password && !secret) {
    problems.push('SESSION_SECRET is required when APP_PASSWORD is set');
  }
  // Locally, with neither variable set, the app is open (it only listens on 127.0.0.1).
  const required = prod || Boolean(password);
  return { prod, required, password, secret, problems, ok: problems.length === 0 };
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url');

export function createSession(secret, now = Date.now()) {
  const payload = b64(JSON.stringify({ v: 1, exp: now + SESSION_DAYS * 86400000 }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || typeof token !== 'string') return false;
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra !== undefined) return false;
  const expected = sign(payload, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { v, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return v === 1 && Number.isFinite(exp) && exp > now;
  } catch {
    return false;
  }
}

// Compare digests so length differences don't leak and the compare is constant-time.
export function passwordMatches(given, actual) {
  const h = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(h(given), h(actual));
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isSecure = (req, settings) => settings.prod || req.secure || req.headers['x-forwarded-proto'] === 'https';
// "__Host-" pins the cookie to this exact host over HTTPS; it can't be used on plain-http localhost.
const cookieName = (secure) => (secure ? '__Host-od_session' : 'od_session');

function setCookie(res, req, settings, value, maxAgeSec) {
  const secure = isSecure(req, settings);
  const attrs = [`${cookieName(secure)}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

/**
 * Failed-login limiter. On serverless this memory is per instance, so it is best-effort:
 * the fixed delay, constant-time compare and a long password are the real defence.
 */
export function makeLoginLimiter({ now = () => Date.now() } = {}) {
  const byIp = new Map();
  let global = { count: 0, resetAt: 0 };
  const fresh = (rec) => (rec && rec.resetAt > now() ? rec : null);
  return {
    check(ip) {
      const rec = fresh(byIp.get(ip));
      const g = fresh(global);
      if (rec && rec.count >= MAX_FAILS_PER_IP) return Math.ceil((rec.resetAt - now()) / 1000);
      if (g && g.count >= MAX_FAILS_GLOBAL) return Math.ceil((g.resetAt - now()) / 1000);
      return 0;
    },
    fail(ip) {
      const rec = fresh(byIp.get(ip)) || { count: 0, resetAt: now() + WINDOW_MS };
      rec.count++;
      byIp.set(ip, rec);
      const g = fresh(global) || { count: 0, resetAt: now() + WINDOW_MS };
      g.count++;
      global = g;
      if (byIp.size > 5000) byIp.clear();
    },
    success(ip) {
      byIp.delete(ip);
    },
  };
}

/** Blocks writes whose Origin points at a different host (defence in depth on top of SameSite=Lax). */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function authMiddleware(settings, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), limiter = makeLoginLimiter() } = {}) {
  return async (req, res, next) => {
    if (!settings.ok) {
      return res.status(500).json({ error: `Server is not configured: ${settings.problems.join('; ')}.`, code: 'not_configured' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req)) {
      return res.status(403).json({ error: 'Cross-origin request blocked', code: 'bad_origin' });
    }

    if (req.method === 'POST' && req.path === '/login') {
      if (!settings.required) return res.json({ ok: true });
      const wait = limiter.check(req.ip);
      if (wait) {
        res.setHeader('Retry-After', String(wait));
        return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, code: 'too_many_attempts', retryAfter: wait });
      }
      const given = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!passwordMatches(given, settings.password)) {
        limiter.fail(req.ip);
        await sleep(FAIL_DELAY_MS);
        return res.status(401).json({ error: 'Wrong password.', code: 'bad_password' });
      }
      limiter.success(req.ip);
      setCookie(res, req, settings, createSession(settings.secret), SESSION_DAYS * 86400);
      return res.json({ ok: true });
    }

    if (!settings.required) return next();
    const token = parseCookies(req.headers.cookie)[cookieName(isSecure(req, settings))];
    if (!verifySession(token, settings.secret)) {
      return res.status(401).json({ error: 'Not signed in.', code: 'unauthenticated' });
    }
    return next();
  };
}

export function logout(settings) {
  return (req, res) => {
    setCookie(res, req, settings, '', 0);
    res.json({ ok: true });
  };
}
