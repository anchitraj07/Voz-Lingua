import * as oidc from 'openid-client';
import { appendSetCookie, route } from '../http.js';
import { q, tx, audit } from '../db.js';
import { config } from '../config.js';
import { startSession } from './auth.js';
import * as S from '../security.js';

const PROVIDER = 'keycloak';
const TRANSACTION_MAX_AGE = 10 * 60e3;
const STATE_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
let clientPromise;

function bindingCookieName(state) {
  return `vl_oidc_${state}`;
}

function setBindingCookie(res, state, token, maxAge) {
  appendSetCookie(res,
    `${bindingCookieName(state)}=${token}; HttpOnly; SameSite=Lax; Path=/api/auth/keycloak; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`);
}

function clearBindingCookie(res, state) {
  setBindingCookie(res, state, '', 0);
}

export function verifyBrowserBinding(transaction, token) {
  return typeof token === 'string' && token.length <= 100
    && typeof transaction?.browser_binding_hash === 'string'
    && S.safeEqual(S.sha256(token), transaction.browser_binding_hash);
}

function settings() {
  if (!config.keycloakIssuerUrl || !config.keycloakClientId || !config.appOrigin) {
    throw new S.HttpError(503, 'Keycloak sign-in is not configured on this server.');
  }
  let issuer, app;
  try {
    issuer = new URL(config.keycloakIssuerUrl);
    app = new URL(config.appOrigin);
  } catch {
    throw new S.HttpError(500, 'Keycloak sign-in is misconfigured.');
  }
  if (!['http:', 'https:'].includes(issuer.protocol) || app.origin !== config.appOrigin) {
    throw new S.HttpError(500, 'Keycloak sign-in is misconfigured.');
  }
  if (config.isProd && (issuer.protocol !== 'https:' || app.protocol !== 'https:')) {
    throw new S.HttpError(500, 'Keycloak sign-in requires HTTPS in production.');
  }
  if (issuer.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(issuer.hostname)) {
    throw new S.HttpError(500, 'HTTP Keycloak is allowed only on localhost.');
  }
  return { issuer, app, redirectUri: new URL('/api/auth/keycloak/callback', app).href };
}

function getClient() {
  const { issuer } = settings();
  if (!clientPromise) {
    const options = issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined;
    clientPromise = oidc.discovery(issuer, config.keycloakClientId, undefined, undefined, options).catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function authErrorUrl() {
  const { app } = settings();
  return new URL('/login?auth=failed', app).href;
}

export function syncUser(claims, phone = null) {
  const subject = S.str(claims.sub, 'Keycloak subject', { max: 255 });
  const email = S.email(claims.email);
  const name = S.str(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || email,
    'Name', { min: 2, max: 80 });
  if (config.keycloakRequireVerifiedEmail && claims.email_verified !== true) {
    throw new S.HttpError(403, 'Please verify your email address in Keycloak before signing in.');
  }

  return tx(() => {
    const linked = q.get(
      `SELECT u.* FROM external_identities e JOIN users u ON u.id=e.user_id
        WHERE e.provider=? AND e.subject=?`, PROVIDER, subject);
    if (linked) {
      if (linked.is_active !== 1) throw new S.HttpError(403, 'This account is disabled. Contact support.');
      if (claims.email_verified !== true && email !== linked.email.toLowerCase()) {
        throw new S.HttpError(403, 'Verify your email address before changing it.');
      }
      q.run('UPDATE users SET name=?, email=?, phone=COALESCE(?,phone) WHERE id=?',
        name, email, phone, linked.id);
      return Number(linked.id);
    }

    const existing = q.get('SELECT id,is_active FROM users WHERE email=?', email);
    if (existing) {
      if (existing.is_active !== 1) throw new S.HttpError(403, 'This account is disabled. Contact support.');
      if (claims.email_verified !== true) {
        throw new S.HttpError(409, 'Verify your email address in Keycloak before linking this account.');
      }
      const otherIdentity = q.get('SELECT subject FROM external_identities WHERE provider=? AND user_id=?', PROVIDER, existing.id);
      if (otherIdentity) throw new S.HttpError(409, 'This account is already linked to another identity.');
      q.run('UPDATE users SET name=?, phone=COALESCE(?,phone) WHERE id=?', name, phone, existing.id);
      q.run('INSERT INTO external_identities(provider,subject,user_id,linked_at) VALUES(?,?,?,?)',
        PROVIDER, subject, existing.id, Date.now());
      return Number(existing.id);
    }

    // This marker is deliberately not a password hash, so local password auth cannot authenticate it.
    const id = q.run(
      `INSERT INTO users(name,email,password_hash,phone,role,level,timezone,created_at)
       VALUES(?,?,?,?,'student','A0',?,?)`,
      name, email, '!keycloak-only', phone, config.academyTz, Date.now()).lastInsertRowid;
    q.run('INSERT INTO external_identities(provider,subject,user_id,linked_at) VALUES(?,?,?,?)',
      PROVIDER, subject, id, Date.now());
    return Number(id);
  });
}

route('GET', '/api/auth/keycloak/start', { limit: { name: 'oidc-start', max: 20, windowMs: 15 * 60e3 } }, async ({ res, query }) => {
  const { app, redirectUri } = settings();
  const mode = query.mode === 'signup' ? 'signup' : 'login';
  const termsAccepted = query.terms === '1';
  if (mode === 'signup' && !termsAccepted) {
    throw new S.HttpError(400, 'Please accept the Terms of Service and Privacy Policy before signing up.');
  }

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const browserBinding = S.randomToken(32);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  q.run('INSERT INTO oidc_transactions(state,code_verifier,nonce,browser_binding_hash,mode,terms_accepted,created_at) VALUES(?,?,?,?,?,?,?)',
    state, codeVerifier, nonce, S.sha256(browserBinding), mode, Number(termsAccepted), Date.now());
  setBindingCookie(res, state, browserBinding, Math.floor(TRANSACTION_MAX_AGE / 1000));

  const client = await getClient();
  const url = oidc.buildAuthorizationUrl(client, {
    redirect_uri: redirectUri,
    scope: 'openid profile email phone',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    ...(mode === 'signup' ? { kc_action: 'register' } : {}),
  });
  redirect(res, url.href);
});

route('GET', '/api/auth/keycloak/callback', {}, async ({ req, res, query, ip }) => {
  const { app, redirectUri } = settings();
  if (query.error) {
    audit(null, 'keycloak_auth_cancelled', ip);
    if (typeof query.state === 'string' && STATE_PATTERN.test(query.state)) clearBindingCookie(res, query.state);
    return redirect(res, new URL('/login?auth=failed', app).href);
  }
  const state = typeof query.state === 'string' && STATE_PATTERN.test(query.state) ? query.state : '';
  const transaction = state && q.get('SELECT * FROM oidc_transactions WHERE state=?', state);
  if (!transaction || transaction.created_at < Date.now() - TRANSACTION_MAX_AGE) {
    if (transaction) q.run('DELETE FROM oidc_transactions WHERE state=?', state);
    if (state) clearBindingCookie(res, state);
    return redirect(res, authErrorUrl());
  }
  const browserBinding = S.parseCookies(req.headers.cookie)[bindingCookieName(state)];
  if (!verifyBrowserBinding(transaction, browserBinding)) {
    audit(null, 'keycloak_state_mismatch', ip);
    return redirect(res, authErrorUrl());
  }
  q.run('DELETE FROM oidc_transactions WHERE state=?', state);
  clearBindingCookie(res, state);

  try {
    const client = await getClient();
    const callbackUrl = new URL(req.url, app);
    const tokens = await oidc.authorizationCodeGrant(client, callbackUrl, {
      pkceCodeVerifier: transaction.code_verifier,
      expectedState: state,
      expectedNonce: transaction.nonce,
    });
    const claims = tokens.claims();
    if (!claims?.sub || !claims.email) throw new S.HttpError(403, 'Keycloak did not return the required account details.');
    const rawPhone = typeof claims.phone_number === 'string' ? claims.phone_number : null;
    const phone = rawPhone ? S.phone(rawPhone) : null;
    const userId = syncUser(claims, phone);
    const csrf = startSession(res, req, userId, ip);
    audit(userId, transaction.mode === 'signup' ? 'keycloak_signup' : 'keycloak_login', ip,
      transaction.terms_accepted ? 'terms_accepted' : null);
    redirect(res, new URL('/login', app).href);
    return { csrf };
  } catch (error) {
    if (error instanceof S.HttpError) {
      audit(null, 'keycloak_auth_rejected', ip, error.message);
      return redirect(res, authErrorUrl());
    }
    console.error('[keycloak]', 'OIDC callback failed', error);
    audit(null, 'keycloak_auth_error', ip);
    return redirect(res, authErrorUrl());
  }
});

route('GET', '/api/auth/keycloak/logout', {}, async ({ res }) => {
  const { app } = settings();
  const client = await getClient();
  const endpoint = client.serverMetadata().end_session_endpoint;
  if (!endpoint) return redirect(res, new URL('/', app).href);
  const url = new URL(endpoint);
  url.searchParams.set('client_id', config.keycloakClientId);
  url.searchParams.set('post_logout_redirect_uri', new URL('/', app).href);
  redirect(res, url.href);
});

route('GET', '/api/auth/keycloak/status', {}, () => ({ enabled: config.keycloakEnabled }));
