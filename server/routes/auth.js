import { route, json, setSessionCookie, COOKIE } from '../http.js';
import { q, audit } from '../db.js';
import { config } from '../config.js';
import * as S from '../security.js';

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, level: u.level, timezone: u.timezone });

function startSession(res, req, userId, ip) {
  const token = S.randomToken(32), csrf = S.randomToken(24), now = Date.now();
  q.run('INSERT INTO sessions(token_hash,user_id,csrf,created_at,last_seen,expires_at,ip,user_agent) VALUES(?,?,?,?,?,?,?,?)',
    S.sha256(token), userId, csrf, now, now, now + config.sessionMaxMs, ip, String(req.headers['user-agent'] || '').slice(0, 200));
  setSessionCookie(res, token, Math.floor(config.sessionMaxMs / 1000));
  return csrf;
}

route('POST', '/api/auth/signup', { limit: { name: 'signup', max: 8, windowMs: 3600e3 } }, async ({ req, res, body, ip }) => {
  const name = S.str(body.name, 'Name', { min: 2, max: 80 });
  const email = S.email(body.email);
  const phone = S.phone(body.phone);
  const level = S.oneOf(body.level || 'A0', 'Level', S.LEVELS);
  const timezone = body.timezone ? S.timezone(body.timezone) : config.academyTz;
  if (!S.bool(body.acceptTerms)) throw S.bad('Please accept the terms to continue');
  S.checkPassword(body.password, { email, name });

  const hash = await S.hashPassword(body.password); // always hash, so timing is the same either way
  if (q.get('SELECT id FROM users WHERE email=?', email)) {
    audit(null, 'signup_duplicate', ip, email);
    throw new S.HttpError(409, 'We could not create an account with these details. If you already registered, please log in.');
  }
  const id = q.run('INSERT INTO users(name,email,password_hash,phone,level,timezone,created_at) VALUES(?,?,?,?,?,?,?)', name, email, hash, phone, level, timezone, Date.now()).lastInsertRowid;
  audit(id, 'signup', ip);
  const csrf = startSession(res, req, Number(id), ip);
  const user = q.get('SELECT * FROM users WHERE id=?', id);
  json(res, 201, { user: publicUser(user), csrf });
});

route('POST', '/api/auth/login', { limit: { name: 'login-ip', max: 30, windowMs: 15 * 60e3 } }, async ({ req, res, body, ip }) => {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const generic = new S.HttpError(401, 'Incorrect email or password');
  if (!email || !password) throw generic;

  const per = S.rateLimit('login-acct:' + email, 10, 15 * 60e3);
  if (!per.ok) throw new S.HttpError(429, 'Too many attempts for this account. Try again in a few minutes.');

  const user = q.get('SELECT * FROM users WHERE email=?', email);
  if (!user) { await S.fakeVerify(password); audit(null, 'login_unknown', ip); throw generic; }
  if (user.locked_until > Date.now()) { audit(user.id, 'login_locked', ip); throw new S.HttpError(429, 'Account temporarily locked after too many failed attempts. Try again in 15 minutes.'); }

  const ok = await S.verifyPassword(password, user.password_hash);
  if (!ok || !user.is_active) {
    const fails = user.failed_logins + 1;
    if (fails >= 5) q.run('UPDATE users SET failed_logins=0, locked_until=? WHERE id=?', Date.now() + 15 * 60e3, user.id);
    else q.run('UPDATE users SET failed_logins=? WHERE id=?', fails, user.id);
    audit(user.id, 'login_failed', ip);
    throw generic;
  }
  q.run('UPDATE users SET failed_logins=0, locked_until=0 WHERE id=?', user.id);
  S.rateReset('login-acct:' + email);
  // New session id on every login (prevents session fixation)
  const old = S.parseCookies(req.headers.cookie)[COOKIE];
  if (old) q.run('DELETE FROM sessions WHERE token_hash=?', S.sha256(old));
  const csrf = startSession(res, req, user.id, ip);
  audit(user.id, 'login', ip);
  return { user: publicUser(user), csrf };
});

route('GET', '/api/auth/me', {}, ({ session }) => session ? { user: publicUser(session.user), csrf: session.csrf } : { user: null });

route('POST', '/api/auth/logout', { auth: 'user' }, ({ res, session, ip }) => {
  q.run('DELETE FROM sessions WHERE token_hash=?', session.hash);
  setSessionCookie(res, '', 0);
  audit(session.user.id, 'logout', ip);
  return { ok: true };
});

route('POST', '/api/auth/logout-all', { auth: 'user' }, ({ res, session, ip }) => {
  q.run('DELETE FROM sessions WHERE user_id=?', session.user.id);
  setSessionCookie(res, '', 0);
  audit(session.user.id, 'logout_all', ip);
  return { ok: true };
});

/* ----- profile ----- */
route('PATCH', '/api/me', { auth: 'user' }, ({ user, body }) => {
  const name = S.str(body.name, 'Name', { min: 2, max: 80 });
  const phone = S.phone(body.phone);
  const level = S.oneOf(body.level, 'Level', S.LEVELS);
  const timezone = S.timezone(body.timezone);
  q.run('UPDATE users SET name=?, phone=?, level=?, timezone=? WHERE id=?', name, phone, level, timezone, user.id);
  return { user: publicUser({ ...user, name, phone, level, timezone }) };
});

route('POST', '/api/me/password', { auth: 'user', limit: { name: 'pw-change', max: 10, windowMs: 3600e3 } }, async ({ req, res, user, session, body, ip }) => {
  const row = q.get('SELECT password_hash FROM users WHERE id=?', user.id);
  if (!(await S.verifyPassword(String(body.currentPassword || ''), row.password_hash))) throw new S.HttpError(400, 'Current password is incorrect');
  S.checkPassword(body.newPassword, { email: user.email, name: user.name });
  q.run('UPDATE users SET password_hash=? WHERE id=?', await S.hashPassword(body.newPassword), user.id);
  q.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', user.id, session.hash); // sign out every other device
  audit(user.id, 'password_changed', ip);
  return { ok: true };
});

route('DELETE', '/api/me', { auth: 'user', limit: { name: 'acct-delete', max: 5, windowMs: 3600e3 } }, async ({ res, user, body, ip }) => {
  if (user.role === 'admin') throw new S.HttpError(403, 'Admin accounts cannot be deleted here');
  const row = q.get('SELECT password_hash FROM users WHERE id=?', user.id);
  if (!(await S.verifyPassword(String(body.password || ''), row.password_hash))) throw new S.HttpError(400, 'Password is incorrect');
  // Free up any 1:1 slots this student was holding, then remove their data.
  q.run(`UPDATE class_sessions SET status='cancelled' WHERE kind='one_on_one' AND starts_at>? AND id IN (SELECT session_id FROM bookings WHERE user_id=?)`, Date.now(), user.id);
  q.run('DELETE FROM users WHERE id=?', user.id);
  audit(null, 'account_deleted', ip, String(user.id));
  setSessionCookie(res, '', 0);
  return { ok: true };
});
