import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
const N = 2 ** 15, R = 8, P = 1;

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export const bad = (m, d) => new HttpError(400, m, d);

/* ---------- passwords: scrypt + per-user random salt, constant-time compare ---------- */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  try {
    const [, n, r, p, salt, hash] = stored.split('$');
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length,
      { N: +n, r: +r, p: +p, maxmem: 128 * +n * +r * 2 });
    return crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}
let dummy;
/** Burn the same CPU for unknown emails so response time does not reveal which emails exist. */
export async function fakeVerify(password) {
  dummy ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummy);
}

const COMMON = new Set(['password', 'password1', 'password123', '1234567890', '12345678', 'qwertyuiop', 'iloveyou1', 'letmein123', 'welcome123', 'admin12345', 'frenchfrench']);
export function checkPassword(pw, { email = '', name = '' } = {}) {
  if (typeof pw !== 'string') throw bad('Password is required');
  if (pw.length < 10) throw bad('Password must be at least 10 characters');
  if (pw.length > 128) throw bad('Password must be at most 128 characters');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw bad('Password must include letters and numbers');
  if (COMMON.has(pw.toLowerCase())) throw bad('That password is too common');
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && pw.toLowerCase().includes(local)) throw bad('Password must not contain your email');
  if (name.length >= 4 && pw.toLowerCase().includes(name.toLowerCase())) throw bad('Password must not contain your name');
}

/* ---------- tokens ---------- */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- rate limiting (in-memory; use Redis if you scale to many servers) ---------- */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
export const rateReset = (key) => buckets.delete(key);
setInterval(() => { const n = Date.now(); for (const [k, v] of buckets) if (v.reset <= n) buckets.delete(k); }, 60e3).unref();

/* ---------- request helpers ---------- */
export function clientIp(req) {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.removeHeader('X-Powered-By');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

/* ---------- input validation ---------- */
export function str(v, name, { min = 1, max = 200, optional = false, multiline = false } = {}) {
  if (v === undefined || v === null || v === '') { if (optional) return null; throw bad(`${name} is required`); }
  if (typeof v !== 'string') throw bad(`${name} must be text`);
  let s = v.normalize('NFC').trim();
  s = multiline ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '') : s.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!s) { if (optional) return null; throw bad(`${name} is required`); }
  if (s.length < min) throw bad(`${name} must be at least ${min} characters`);
  if (s.length > max) throw bad(`${name} must be at most ${max} characters`);
  return s;
}
export function int(v, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (v === undefined || v === null || v === '') { if (optional) return null; throw bad(`${name} is required`); }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}`);
  return n;
}
export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
export function oneOf(v, name, list) { if (!list.includes(v)) throw bad(`${name} is invalid`); return v; }
export function email(v) {
  const s = str(v, 'Email', { max: 254 }).toLowerCase();
  if (!/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(s)) throw bad('Enter a valid email address');
  return s;
}
export function phone(v) {
  const s = str(v, 'Phone', { optional: true, max: 20 });
  if (s && !/^[+0-9 ()-]{7,20}$/.test(s)) throw bad('Enter a valid phone number');
  return s;
}
export function dateStr(v, name = 'Date') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${name} must be YYYY-MM-DD`);
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad(`${name} is not a valid date`);
  return v;
}
export function timeStr(v, name = 'Time') {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${name} must be HH:MM`);
  return v;
}
export function httpsUrl(v, name = 'Link') {
  const s = str(v, name, { optional: true, max: 300 });
  if (!s) return null;
  let u; try { u = new URL(s); } catch { throw bad(`${name} must be a valid https:// link`); }
  if (u.protocol !== 'https:') throw bad(`${name} must start with https://`);
  return u.toString();
}
export function timezone(v) {
  const s = str(v, 'Timezone', { max: 60 });
  try { new Intl.DateTimeFormat('en', { timeZone: s }); } catch { throw bad('Unknown timezone'); }
  return s;
}
export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];
