import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { q, audit } from './db.js';
import { HttpError, clientIp, parseCookies, rateLimit, securityHeaders, sha256, safeEqual } from './security.js';

export const COOKIE = config.cookieSecure ? '__Host-vl_sid' : 'vl_sid';
const routes = [];
export function route(method, pattern, opts, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([0-9]+)'; }) + '$');
  routes.push({ method, re, keys, opts: opts || {}, handler });
}

export function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' });
  res.end(data);
}

export function setSessionCookie(res, token, maxAgeSec) {
  appendSetCookie(res, `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`);
}

export function appendSetCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', current === undefined ? cookie : [...(Array.isArray(current) ? current : [current]), cookie]);
}

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    let failed = false;
    req.on('data', (c) => {
      size += c.length;
      if (failed) return;
      if (size > limit) { failed = true; chunks.length = 0; reject(new HttpError(413, 'Request too large')); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Blocks cross-site form posts / CSRF-style requests: browsers always send Origin on unsafe methods. */
function originOk(req) {
  const origin = req.headers.origin;
  if (origin) {
    if (config.allowedOrigins.includes(origin)) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  }
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none';
  return !config.isProd;
}

function loadSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token || token.length > 100) return null;
  const now = Date.now();
  const row = q.get(
    `SELECT s.token_hash, s.csrf, s.last_seen, s.expires_at, u.id, u.name, u.email, u.phone, u.role, u.level, u.timezone
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND u.is_active=1`, sha256(token));
  if (!row || row.expires_at <= now || row.last_seen + config.sessionIdleMs <= now) {
    if (row) q.run('DELETE FROM sessions WHERE token_hash=?', row.token_hash);
    return null;
  }
  if (now - row.last_seen > 60e3) q.run('UPDATE sessions SET last_seen=? WHERE token_hash=?', now, row.token_hash);
  const { token_hash, csrf, last_seen, expires_at, ...user } = row;
  return { hash: token_hash, csrf, user };
}

async function handleApi(req, res, url) {
  const ip = clientIp(req);
  const rl = rateLimit('global:' + ip, 300, 60e3);
  if (!rl.ok) { res.setHeader('Retry-After', rl.retryAfter); throw new HttpError(429, 'Too many requests. Please slow down.'); }

  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (unsafe && !originOk(req)) throw new HttpError(403, 'Cross-site request blocked');

  let match, params = {};
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.re);
    if (m) { match = r; r.keys.forEach((k, i) => (params[k] = Number(m[i + 1]))); break; }
  }
  if (!match) throw new HttpError(404, 'Not found');

  const { auth = false, limit } = match.opts;
  if (limit) {
    const r = rateLimit(`${limit.name}:${ip}`, limit.max, limit.windowMs);
    if (!r.ok) { res.setHeader('Retry-After', r.retryAfter); throw new HttpError(429, 'Too many attempts. Please try again later.'); }
  }

  const session = loadSession(req);
  if (auth && !session) throw new HttpError(401, 'Please log in');
  if (auth === 'admin' && session.user.role !== 'admin') throw new HttpError(403, 'Not allowed');
  if (session && unsafe && !safeEqual(req.headers['x-csrf-token'] || '', session.csrf)) throw new HttpError(403, 'Invalid security token. Refresh the page.');

  let body = {};
  if (unsafe) {
    const raw = await readBody(req);
    if (raw) {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON required');
      try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON'); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid JSON body');
    }
  }
  const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), body, ip, session, user: session?.user };
  const out = await match.handler(ctx);
  if (!res.writableEnded) json(res, 200, out ?? { ok: true });
}

/* ---------- static files (production build in /dist) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp' };
const DIST = path.join(config.root, 'dist');

function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed');
  let rel; try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Bad path'); }
  if (rel.includes('\0') || rel.split('/').some((s) => s.startsWith('.'))) throw new HttpError(404, 'Not found');
  let file = path.join(DIST, path.normalize(rel));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) throw new HttpError(403, 'Forbidden');
  let stat = fs.existsSync(file) ? fs.statSync(file) : null;
  if (!stat || stat.isDirectory()) {
    if (path.extname(rel)) throw new HttpError(404, 'Not found');
    file = path.join(DIST, 'index.html'); // SPA fallback
    stat = fs.existsSync(file) ? fs.statSync(file) : null;
    if (!stat) throw new HttpError(404, 'Frontend not built. Run "npm run build" (or use "npm run dev").');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': stat.size,
    'Cache-Control': file.includes(path.sep + 'assets' + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

export async function handle(req, res) {
  securityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) {
      if (e.status === 413) res.setHeader('Connection', 'close'); // stop reading the rest of an oversized upload
      return json(res, e.status, { error: e.message, details: e.details });
    }
    console.error('[error]', req.method, url.pathname, e);
    audit(null, 'server_error', clientIp(req), `${req.method} ${url.pathname}`);
    json(res, 500, { error: 'Something went wrong on our side. Please try again.' });
  }
}
