import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-'));
process.env.DB_PATH = path.join(tmp, 't.db');
process.env.ADMIN_EMAIL = 'owner@voz.test';
process.env.ADMIN_PASSWORD = 'Zx9-Strong-Passphrase';
process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ISSUER_URL = '';
process.env.KEYCLOAK_CLIENT_ID = '';
process.env.APP_ORIGIN = '';

const { start } = await import('../server/index.js');
let server, base;
before(async () => { server = await start(0, '127.0.0.1'); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const { db } = await import('../server/db.js');
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async req(method, url, body, headers = {}) {
    const h = { Origin: base, ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (this.cookie) h.Cookie = this.cookie;
    if (this.csrf && !('X-CSRF-Token' in h)) h['X-CSRF-Token'] = this.csrf;
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (data?.csrf) this.csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }
}
const good = { name: 'Asha Verma', email: 'asha@example.com', password: 'Bonjour-2026-ok', level: 'A1', timezone: 'Asia/Kolkata', acceptTerms: true };
const admin = new Client(), asha = new Client(), ravi = new Client();
let programs;

test('public catalogue + security headers', async () => {
  const r = await new Client().req('GET', '/api/public/programs');
  assert.equal(r.status, 200);
  programs = r.data.programs;
  assert.deepEqual(programs.map((p) => p.kind), ['group', 'one_on_one']);
  assert.equal(programs[0].plans[0].price, null);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('Keycloak OIDC endpoints report disabled configuration explicitly', async () => {
  const c = new Client();
  assert.deepEqual((await c.req('GET', '/api/auth/keycloak/status')).data, { enabled: false });
  const start = await c.req('GET', '/api/auth/keycloak/start?mode=signup&terms=1');
  assert.equal(start.status, 503);
  assert.match(start.data.error, /Keycloak sign-in is not configured/);
});

test('Keycloak OIDC callbacks require the initiating browser binding', async () => {
  const { verifyBrowserBinding } = await import('../server/routes/oidc.js');
  const { sha256 } = await import('../server/security.js');
  const browserToken = 'browser-bound-random-value';
  const transaction = { browser_binding_hash: sha256(browserToken) };
  assert.equal(verifyBrowserBinding(transaction, browserToken), true);
  assert.equal(verifyBrowserBinding(transaction, 'different-browser-token'), false);
  assert.equal(verifyBrowserBinding(transaction, undefined), false);
  assert.equal(verifyBrowserBinding({ browser_binding_hash: null }, browserToken), false);
});

test('Keycloak identity sync creates a passwordless local student and links verified existing email', async () => {
  const { syncUser } = await import('../server/routes/oidc.js');
  const { q } = await import('../server/db.js');
  const { verifyPassword } = await import('../server/security.js');
  const id = syncUser({
    sub: 'kc-student-001', email: 'keycloak@example.com', name: 'Keycloak Student', email_verified: true,
  });
  const user = q.get('SELECT * FROM users WHERE id=?', id);
  assert.equal(user.role, 'student');
  assert.equal(user.level, 'A0');
  assert.equal(user.timezone, 'Asia/Kolkata');
  assert.equal(user.password_hash, '!keycloak-only');
  assert.equal(await verifyPassword('not-a-password', user.password_hash), false);
  assert.equal(q.get('SELECT subject FROM external_identities WHERE user_id=?', id).subject, 'kc-student-001');

  const legacyId = Number(q.run(
    'INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)',
    'Legacy Admin', 'legacy-admin@example.com', '!legacy-password', 'admin', Date.now(),
  ).lastInsertRowid);
  const linked = syncUser({
    sub: 'kc-admin-verified', email: 'legacy-admin@example.com', name: 'Admin from Keycloak', email_verified: true,
  });
  assert.equal(linked, legacyId);
  assert.equal(q.get('SELECT role FROM users WHERE id=?', linked).role, 'admin');
  assert.equal(q.get('SELECT name FROM users WHERE id=?', linked).name, 'Admin from Keycloak');

  q.run('INSERT INTO users(name,email,password_hash,is_active,created_at) VALUES(?,?,?,?,?)',
    'Disabled User', 'disabled@example.com', '!legacy-password', 0, Date.now());
  assert.throws(() => syncUser({
    sub: 'kc-disabled-user', email: 'disabled@example.com', name: 'Disabled User', email_verified: true,
  }), /account is disabled/);
});

test('signup validation, cookie flags, duplicate handling', async () => {
  const c = new Client();
  assert.equal((await c.req('POST', '/api/auth/signup', { ...good, password: 'short1' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/signup', { ...good, password: 'onlylettersssss' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/signup', { ...good, acceptTerms: false })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/signup', { ...good, email: 'nope' })).status, 400);
  const ok = await asha.req('POST', '/api/auth/signup', good);
  assert.equal(ok.status, 201);
  const sc = ok.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  assert.equal(ok.data.user.email, 'asha@example.com');
  assert.ok(!JSON.stringify(ok.data).includes('password'));
  assert.equal((await new Client().req('POST', '/api/auth/signup', good)).status, 409);
  assert.equal((await ravi.req('POST', '/api/auth/signup', { ...good, name: 'Ravi Kumar', email: 'ravi@example.com' })).status, 201);
});

test('CSRF / origin / auth guards', async () => {
  assert.equal((await new Client().req('GET', '/api/bookings')).status, 401);
  assert.equal((await asha.req('POST', '/api/auth/logout-all', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await asha.req('PATCH', '/api/me', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await asha.req('GET', '/api/admin/overview')).status, 403);
  const me = await asha.req('GET', '/api/auth/me');
  assert.equal(me.data.user.name, 'Asha Verma');
});

test('login: generic errors, lockout, session rotation', async () => {
  const c = new Client();
  const a = await c.req('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'whatever-123' });
  const b = await c.req('POST', '/api/auth/login', { email: 'asha@example.com', password: 'wrong-pass-123' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.data.error, b.data.error);
  for (let i = 0; i < 4; i++) await c.req('POST', '/api/auth/login', { email: 'asha@example.com', password: 'wrong-pass-123' });
  const locked = await c.req('POST', '/api/auth/login', { email: 'asha@example.com', password: good.password });
  assert.equal(locked.status, 429);
  // unlock directly to continue testing
  const { q } = await import('../server/db.js');
  q.run('UPDATE users SET locked_until=0, failed_logins=0');
  const { rateReset } = await import('../server/security.js'); rateReset('login-acct:asha@example.com');
  const ok = await c.req('POST', '/api/auth/login', { email: 'ASHA@example.com', password: good.password });
  assert.equal(ok.status, 200);
  const inj = await new Client().req('POST', '/api/auth/login', { email: "' OR 1=1 --", password: 'x' });
  assert.equal(inj.status, 401);
});

test('admin login + plan editing', async () => {
  assert.equal((await admin.req('POST', '/api/auth/login', { email: 'owner@voz.test', password: 'Zx9-Strong-Passphrase' })).status, 200);
  const cat = await admin.req('GET', '/api/admin/catalogue');
  const plan = cat.data.programs[0].plans[0];
  const upd = await admin.req('PATCH', `/api/admin/plans/${plan.id}`, { ...plan, name: 'Group Starter', price: 4999.5, features: ['A', 'B'] });
  assert.equal(upd.status, 200); assert.equal(upd.data.plan.price, 4999.5);
  const np = await admin.req('POST', `/api/admin/programs`, { name: 'Business French', kind: 'one_on_one', parentId: programs[1].id });
  assert.equal(np.status, 200);
  await admin.req('POST', `/api/admin/programs/${np.data.id}/plans`, { name: 'Biz', price: null, sessionsPerWeek: 2, sessionMinutes: 60, features: [], active: true });
  assert.equal((await admin.req('GET', '/api/admin/catalogue')).data.programs.length, 3);
});

let batch, ashaBooking;
test('group flow: plan pending -> blocked -> approved -> join -> cancel rules', async () => {
  const planId = programs[0].plans[0].id;
  assert.equal((await asha.req('POST', '/api/subscriptions', { planId })).status, 200);
  assert.equal((await asha.req('POST', '/api/subscriptions', { planId })).status, 409);
  const bl = (await asha.req('GET', `/api/programs/${programs[0].id}/batches`)).data.batches;
  assert.ok(bl.length >= 3); batch = bl[0];
  assert.equal((await asha.req('POST', `/api/batches/${batch.id}/join`, {})).status, 403); // not approved yet

  const ov = (await admin.req('GET', '/api/admin/overview')).data;
  assert.equal(ov.pending.length, 1);
  assert.equal((await admin.req('POST', `/api/admin/subscriptions/${ov.pending[0].id}`, { status: 'active' })).status, 200);

  assert.equal((await asha.req('POST', `/api/batches/${batch.id}/join`, {})).status, 200);
  const after = (await asha.req('GET', `/api/programs/${programs[0].id}/batches`)).data.batches.find((b) => b.id === batch.id);
  assert.equal(after.joined, true); assert.equal(after.seatsLeft, batch.seatsLeft - 1);

  const lr = await asha.req('GET', '/api/bookings'); assert.equal(lr.status, 200, JSON.stringify(lr.data)); const list = lr.data.bookings;
  assert.ok(list.length >= 20); ashaBooking = list[0];
  // overlap: another batch at same time is not seeded, but joining the same batch again is idempotent
  assert.equal((await asha.req('POST', `/api/batches/${batch.id}/join`, {})).status, 200);
  { const rr = await asha.req('GET', '/api/bookings'); assert.equal(rr.status, 200, JSON.stringify(rr.data)); assert.equal(rr.data.bookings.length, list.length); }

  const ics = await asha.req('GET', '/api/calendar.ics');
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.data, /BEGIN:VEVENT/);

  // IDOR: Ravi cannot cancel Asha's booking
  assert.equal((await ravi.req('POST', `/api/bookings/${ashaBooking.bookingId}/cancel`, {})).status, 404);
  assert.equal((await asha.req('POST', `/api/bookings/${ashaBooking.bookingId}/cancel`, {})).status, 200);
  assert.equal((await asha.req('POST', `/api/bookings/${ashaBooking.bookingId}/cancel`, {})).status, 409);
});

test('capacity is enforced', async () => {
  const { q } = await import('../server/db.js');
  q.run('UPDATE batches SET capacity=1 WHERE id=?', batch.id);
  q.run('UPDATE class_sessions SET capacity=1 WHERE batch_id=?', batch.id);
  await ravi.req('POST', '/api/subscriptions', { planId: programs[0].plans[0].id });
  const sub = (await admin.req('GET', '/api/admin/overview')).data.pending[0];
  await admin.req('POST', `/api/admin/subscriptions/${sub.id}`, { status: 'active' });
  const r = await ravi.req('POST', `/api/batches/${batch.id}/join`, {});
  assert.equal(r.status, 409); assert.match(r.data.error, /full/);
});

test('one-on-one: pick days+slots, conflicts block double booking', async () => {
  const prog = programs[1];
  for (const c of [asha, ravi]) await c.req('POST', '/api/subscriptions', { planId: prog.plans[0].id });
  for (const s of (await admin.req('GET', '/api/admin/overview')).data.pending) await admin.req('POST', `/api/admin/subscriptions/${s.id}`, { status: 'active' });

  const slots = (await asha.req('GET', `/api/programs/${prog.id}/slots`)).data;
  assert.equal(slots.maxPerWeek, 2); assert.ok(slots.slots.length >= 20);
  const mon = slots.slots.filter((s) => s.weekday === 1).slice(0, 2);
  const tooMany = await asha.req('POST', '/api/one-on-one/book', { programId: prog.id, availabilityIds: slots.slots.slice(0, 3).map((s) => s.id), startDate: slots.minDate, weeks: 2 });
  assert.equal(tooMany.status, 400);
  const body = { programId: prog.id, availabilityIds: mon.map((s) => s.id), startDate: slots.minDate, weeks: 3 };
  const ok = await asha.req('POST', '/api/one-on-one/book', body);
  assert.equal(ok.status, 200); assert.equal(ok.data.created, 6);
  const clash = await ravi.req('POST', '/api/one-on-one/book', body);
  assert.equal(clash.status, 409); assert.ok(clash.data.details.conflicts.length > 0);
  assert.equal((await ravi.req('POST', '/api/one-on-one/book', { ...body, startDate: '2020-01-01' })).status, 400);
  // cancel frees the slot
  const mine = (await asha.req('GET', '/api/bookings')).data.bookings.filter((b) => b.kind === 'one_on_one');
  assert.equal((await asha.req('POST', `/api/bookings/${mine[0].bookingId}/cancel`, {})).status, 200);
});

test('admin: batch creation, attendance feeds student stats', async () => {
  const gp = programs[0];
  const bad = await admin.req('POST', '/api/admin/batches', { programId: gp.id, title: 'X', level: 'A1', weekdays: [], startTime: '10:00', durationMin: 60, capacity: 5, startDate: '2030-01-07', weeks: 2 });
  assert.equal(bad.status, 400);
  const mk = await admin.req('POST', '/api/admin/batches', { programId: gp.id, title: 'B1 Batch', level: 'B1', weekdays: [1, 3], startTime: '18:00', durationMin: 60, capacity: 6, startDate: '2030-01-07', weeks: 2, meetingUrl: 'https://meet.example.com/x' });
  assert.equal(mk.data.sessions, 4);
  assert.equal((await admin.req('POST', '/api/admin/batches', { programId: gp.id, title: 'B', level: 'B1', weekdays: [1], startTime: '18:00', durationMin: 60, capacity: 6, startDate: '2030-01-07', weeks: 2, meetingUrl: 'javascript:alert(1)' })).status, 400);
  const sess = (await admin.req('GET', '/api/admin/sessions')).data.sessions.find((s) => s.students.length);
  const st = sess.students[0];
  assert.equal((await admin.req('POST', `/api/admin/bookings/${st.bookingId}/status`, { status: 'attended' })).status, 200);
  const who = st.email === 'asha@example.com' ? asha : ravi;
  assert.equal((await who.req('GET', '/api/me/overview')).data.stats.attended, 1);
});

test('profile, password change invalidates other sessions, delete account', async () => {
  const other = new Client();
  await other.req('POST', '/api/auth/login', { email: 'ravi@example.com', password: good.password });
  assert.equal((await ravi.req('PATCH', '/api/me', { name: 'Ravi K', phone: '+91 98765 43210', level: 'A2', timezone: 'Europe/Paris' })).status, 200);
  assert.equal((await ravi.req('PATCH', '/api/me', { name: 'R', phone: '', level: 'A2', timezone: 'Not/AZone' })).status, 400);
  assert.equal((await ravi.req('POST', '/api/me/password', { currentPassword: 'bad', newPassword: 'Another-Pass-9999' })).status, 400);
  assert.equal((await ravi.req('POST', '/api/me/password', { currentPassword: good.password, newPassword: 'Another-Pass-9999' })).status, 200);
  assert.equal((await other.req('GET', '/api/auth/me')).data.user, null);
  assert.equal((await ravi.req('DELETE', '/api/me', { password: 'nope' })).status, 400);
  assert.equal((await ravi.req('DELETE', '/api/me', { password: 'Another-Pass-9999' })).status, 200);
  assert.equal((await new Client().req('POST', '/api/auth/login', { email: 'ravi@example.com', password: 'Another-Pass-9999' })).status, 401);
});

test('leads honeypot, logout, static path traversal, oversized body', async () => {
  const c = new Client();
  assert.equal((await c.req('POST', '/api/public/leads', { name: 'Bot', email: 'b@b.co', website: 'spam' })).status, 200);
  assert.equal((await c.req('POST', '/api/public/leads', { name: 'Meera Rao', email: 'meera@example.com', interest: 'Group' })).status, 200);
  assert.equal((await admin.req('GET', '/api/admin/leads')).data.leads.length, 1);
  assert.equal((await c.req('POST', '/api/public/leads', { name: 'A'.repeat(200000), email: 'x@x.co' })).status, 413);
  for (const p of ['/..%2f..%2fserver%2fconfig.js', '/.env', '/%2e%2e/package.json']) {
    const r = await fetch(base + p); assert.ok([403, 404].includes(r.status), p + ' -> ' + r.status);
  }
  assert.equal((await asha.req('POST', '/api/auth/logout', {})).status, 200);
  assert.equal((await asha.req('GET', '/api/bookings')).status, 401);
});
