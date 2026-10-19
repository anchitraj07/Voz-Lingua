import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency). Real environment variables always win.
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch { /* no .env file – fine */ }

const env = process.env;
const isProd = env.NODE_ENV === 'production';
// Keycloak is used only when KEYCLOAK_ISSUER_URL is set explicitly (in .env or the environment).
// Without it the site uses its built-in email + password accounts, so nothing external has to be running.
const keycloakIssuerUrl = env.KEYCLOAK_ISSUER_URL || '';
const keycloakClientId = env.KEYCLOAK_CLIENT_ID || (keycloakIssuerUrl ? 'voz-lingua-web' : '');
const appOrigin = env.APP_ORIGIN || (keycloakIssuerUrl && !isProd ? 'http://localhost:5173' : '');

export const config = {
  root,
  isProd,
  port: Number(env.PORT || 3001),
  host: env.HOST || '127.0.0.1',
  dbPath: env.DB_PATH || path.join(root, 'data', 'voz-lingua.db'),
  keycloakIssuerUrl,
  keycloakClientId,
  appOrigin,
  keycloakEnabled: Boolean(keycloakIssuerUrl && keycloakClientId && appOrigin),
  keycloakRequireVerifiedEmail: env.KEYCLOAK_REQUIRE_VERIFIED_EMAIL
    ? env.KEYCLOAK_REQUIRE_VERIFIED_EMAIL === '1'
    : isProd,
  // Only trust X-Forwarded-* when you are behind your own reverse proxy (nginx, Caddy, Cloudflare...)
  trustProxy: env.TRUST_PROXY === '1',
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : isProd,
  // In development the Vite proxy rewrites Host to the API address, so trust the Vite dev origins explicitly.
  allowedOrigins: [
    ...(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    ...(isProd || env.NODE_ENV === 'test' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
  ],
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  // Pricing/payment is not built yet, so new plan selections wait for admin confirmation by default.
  requireApproval: env.REQUIRE_APPROVAL !== '0',
  seedSampleData: env.SEED_SAMPLE_DATA !== '0',
  cancelHours: Number(env.CANCEL_HOURS || 12),
  minLeadHours: 2,
  // Academy schedule is defined in IST (UTC+05:30, no daylight saving). Students see their own timezone.
  academyTz: 'Asia/Kolkata',
  academyOffsetMin: 330,
  sessionIdleMs: 7 * 24 * 3600e3,
  sessionMaxMs: 30 * 24 * 3600e3,
};
