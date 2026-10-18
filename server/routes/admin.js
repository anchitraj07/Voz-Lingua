import { route } from '../http.js';
import { q, tx, audit } from '../db.js';
import * as S from '../security.js';
import { generateBatchSessions, addDays, academyToday } from '../scheduling.js';
import { catalogue, planOut } from './public.js';

const A = { auth: 'admin' };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'program';
const price = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw S.bad('Price must be a positive number');
  return Math.round(n * 100);
};

route('GET', '/api/admin/overview', A, () => {
  const c = (sql, ...p) => q.get(sql, ...p).c;
  const now = Date.now();
  return {
    students: c(`SELECT COUNT(*) c FROM users WHERE role='student'`),
    pending: q.all(`SELECT s.id, s.created_at AS createdAt, u.name, u.email, p.name AS planName FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN plans p ON p.id=s.plan_id WHERE s.status='pending' ORDER BY s.id`),
    upcomingClasses: c(`SELECT COUNT(*) c FROM class_sessions WHERE status='scheduled' AND starts_at>?`, now),
    leads: c('SELECT COUNT(*) c FROM leads'),
  };
});

/* ----- students & subscriptions ----- */
route('GET', '/api/admin/students', A, () => ({
  students: q.all(`SELECT id, name, email, phone, level, timezone, is_active AS isActive, created_at AS createdAt,
    (SELECT COUNT(*) FROM bookings b WHERE b.user_id=users.id AND b.status='attended') AS attended,
    (SELECT group_concat(p.name || ' (' || s.status || ')', ', ') FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=users.id AND s.status<>'cancelled') AS plans
    FROM users WHERE role='student' ORDER BY id DESC LIMIT 500`).map((s) => ({ ...s, isActive: !!s.isActive })),
}));

route('PATCH', '/api/admin/students/:id', A, ({ params, body, user, ip }) => {
  const active = S.bool(body.isActive) ? 1 : 0;
  const r = q.run(`UPDATE users SET is_active=? WHERE id=? AND role='student'`, active, params.id);
  if (!r.changes) throw new S.HttpError(404, 'Student not found');
  if (!active) q.run('DELETE FROM sessions WHERE user_id=?', params.id);
  audit(user.id, active ? 'student_enabled' : 'student_disabled', ip, String(params.id));
  return { ok: true };
});

route('POST', '/api/admin/subscriptions/:id', A, ({ params, body, user, ip }) => {
  const status = S.oneOf(body.status, 'Status', ['active', 'paused', 'cancelled']);
  const r = q.run('UPDATE subscriptions SET status=?, updated_at=? WHERE id=?', status, Date.now(), params.id);
  if (!r.changes) throw new S.HttpError(404, 'Subscription not found');
  audit(user.id, 'subscription_' + status, ip, String(params.id));
  return { ok: true };
});

/* ----- programs & plans (all names / prices live here, editable any time) ----- */
route('GET', '/api/admin/catalogue', A, () => ({ programs: catalogue({ includeInactive: true }) }));

route('POST', '/api/admin/programs', A, ({ body, user, ip }) => {
  const name = S.str(body.name, 'Name', { max: 80 });
  const kind = S.oneOf(body.kind, 'Type', ['group', 'one_on_one']);
  const parentId = S.int(body.parentId, 'Parent', { min: 1, optional: true });
  if (parentId && !q.get('SELECT id FROM programs WHERE id=?', parentId)) throw S.bad('Parent program not found');
  let s = slug(name);
  if (q.get('SELECT id FROM programs WHERE slug=?', s)) s += '-' + S.randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  const id = q.run('INSERT INTO programs(slug,name,kind,tagline,description,parent_id,sort_order) VALUES(?,?,?,?,?,?,?)', s, name, kind,
    S.str(body.tagline, 'Tagline', { optional: true, max: 140 }), S.str(body.description, 'Description', { optional: true, max: 1000, multiline: true }), parentId,
    q.get('SELECT COALESCE(MAX(sort_order),0)+1 n FROM programs').n).lastInsertRowid;
  audit(user.id, 'program_create', ip, String(id));
  return { id: Number(id) };
});

route('PATCH', '/api/admin/programs/:id', A, ({ params, body, user, ip }) => {
  const r = q.run('UPDATE programs SET name=?, tagline=?, description=?, active=? WHERE id=?', S.str(body.name, 'Name', { max: 80 }),
    S.str(body.tagline, 'Tagline', { optional: true, max: 140 }), S.str(body.description, 'Description', { optional: true, max: 1000, multiline: true }), S.bool(body.active) ? 1 : 0, params.id);
  if (!r.changes) throw new S.HttpError(404, 'Program not found');
  audit(user.id, 'program_update', ip, String(params.id));
  return { ok: true };
});

const planFields = (b) => [
  S.str(b.name, 'Name', { max: 80 }), S.str(b.description, 'Description', { optional: true, max: 500, multiline: true }), price(b.price),
  S.oneOf(b.currency || 'INR', 'Currency', ['INR', 'USD', 'EUR', 'GBP', 'AED']), S.oneOf(b.billingPeriod || 'month', 'Billing period', ['month', 'course', 'session']),
  S.int(b.sessionsPerWeek, 'Sessions per week', { min: 1, max: 14 }), S.int(b.sessionMinutes, 'Session length', { min: 15, max: 240 }),
  JSON.stringify((Array.isArray(b.features) ? b.features : []).slice(0, 12).map((f) => S.str(f, 'Feature', { max: 120 }))), S.bool(b.active) ? 1 : 0,
];
route('POST', '/api/admin/programs/:id/plans', A, ({ params, body, user, ip }) => {
  if (!q.get('SELECT id FROM programs WHERE id=?', params.id)) throw new S.HttpError(404, 'Program not found');
  const id = q.run(`INSERT INTO plans(program_id,name,description,price_minor,currency,billing_period,sessions_per_week,session_minutes,features,active) VALUES(?,?,?,?,?,?,?,?,?,?)`, params.id, ...planFields(body)).lastInsertRowid;
  audit(user.id, 'plan_create', ip, String(id));
  return { id: Number(id) };
});
route('PATCH', '/api/admin/plans/:id', A, ({ params, body, user, ip }) => {
  const r = q.run(`UPDATE plans SET name=?,description=?,price_minor=?,currency=?,billing_period=?,sessions_per_week=?,session_minutes=?,features=?,active=? WHERE id=?`, ...planFields(body), params.id);
  if (!r.changes) throw new S.HttpError(404, 'Plan not found');
  audit(user.id, 'plan_update', ip, String(params.id));
  return { plan: planOut(q.get('SELECT * FROM plans WHERE id=?', params.id)) };
});

/* ----- group batches ----- */
route('GET', '/api/admin/batches', A, () => ({
  batches: q.all(`SELECT b.*, p.name AS programName,
     (SELECT COUNT(*) FROM class_sessions s WHERE s.batch_id=b.id AND s.status='scheduled' AND s.starts_at>?) AS upcoming
     FROM batches b JOIN programs p ON p.id=b.program_id ORDER BY b.active DESC, b.id DESC`, Date.now())
    .map((b) => ({ id: b.id, programId: b.program_id, programName: b.programName, title: b.title, level: b.level, weekdays: b.weekdays.split(',').map(Number), startTime: b.start_time, durationMin: b.duration_min, capacity: b.capacity, startDate: b.start_date, weeks: b.weeks, teacher: b.teacher, meetingUrl: b.meeting_url, active: !!b.active, upcoming: b.upcoming })),
}));

route('POST', '/api/admin/batches', A, ({ body, user, ip }) => {
  const programId = S.int(body.programId, 'Program', { min: 1 });
  if (!q.get(`SELECT id FROM programs WHERE id=? AND kind='group'`, programId)) throw S.bad('Choose a group program');
  if (!Array.isArray(body.weekdays) || !body.weekdays.length) throw S.bad('Choose at least one weekday');
  const weekdays = [...new Set(body.weekdays.map((d) => S.int(d, 'Weekday', { min: 0, max: 6 })))].sort();
  const b = {
    program_id: programId, title: S.str(body.title, 'Title', { max: 80 }), level: S.oneOf(body.level, 'Level', S.LEVELS), weekdays: weekdays.join(','),
    start_time: S.timeStr(body.startTime), duration_min: S.int(body.durationMin, 'Duration', { min: 15, max: 240 }), capacity: S.int(body.capacity, 'Capacity', { min: 1, max: 100 }),
    start_date: S.dateStr(body.startDate, 'Start date'), weeks: S.int(body.weeks, 'Weeks', { min: 1, max: 52 }),
    teacher: S.str(body.teacher, 'Tutor', { optional: true, max: 80 }), meeting_url: S.httpsUrl(body.meetingUrl, 'Meeting link'),
  };
  if (b.start_date < academyToday()) throw S.bad('Start date cannot be in the past');
  const out = tx(() => {
    b.id = q.run(`INSERT INTO batches(program_id,title,level,weekdays,start_time,duration_min,capacity,start_date,weeks,teacher,meeting_url) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      b.program_id, b.title, b.level, b.weekdays, b.start_time, b.duration_min, b.capacity, b.start_date, b.weeks, b.teacher, b.meeting_url).lastInsertRowid;
    return { id: Number(b.id), sessions: generateBatchSessions(b) };
  });
  audit(user.id, 'batch_create', ip, String(out.id));
  return out;
});

route('POST', '/api/admin/batches/:id/close', A, ({ params, user, ip }) => {
  tx(() => {
    q.run('UPDATE batches SET active=0 WHERE id=?', params.id);
    q.run(`UPDATE class_sessions SET status='cancelled' WHERE batch_id=? AND starts_at>?`, params.id, Date.now());
  });
  audit(user.id, 'batch_close', ip, String(params.id));
  return { ok: true };
});

/* ----- one-on-one weekly availability ----- */
route('GET', '/api/admin/availability', A, () => ({
  slots: q.all(`SELECT a.id, a.program_id AS programId, p.name AS programName, a.weekday, a.start_time AS startTime, a.duration_min AS durationMin, a.teacher, a.meeting_url AS meetingUrl
    FROM availability a JOIN programs p ON p.id=a.program_id WHERE a.active=1 ORDER BY a.program_id, a.weekday, a.start_time`),
}));
route('POST', '/api/admin/availability', A, ({ body, user, ip }) => {
  const programId = S.int(body.programId, 'Program', { min: 1 });
  if (!q.get(`SELECT id FROM programs WHERE id=? AND kind='one_on_one'`, programId)) throw S.bad('Choose a one-on-one program');
  const days = (Array.isArray(body.weekdays) ? body.weekdays : [body.weekday]).map((d) => S.int(d, 'Weekday', { min: 0, max: 6 }));
  const times = (Array.isArray(body.times) ? body.times : [body.startTime]).map((t) => S.timeStr(t));
  if (days.length * times.length > 100) throw S.bad('Too many slots at once');
  const dur = S.int(body.durationMin, 'Duration', { min: 15, max: 240 }), teacher = S.str(body.teacher, 'Tutor', { optional: true, max: 80 }), url = S.httpsUrl(body.meetingUrl, 'Meeting link');
  let n = 0;
  tx(() => { for (const d of new Set(days)) for (const t of new Set(times)) {
    if (q.get('SELECT id FROM availability WHERE program_id=? AND weekday=? AND start_time=? AND COALESCE(teacher,\'\')=COALESCE(?,\'\') AND active=1', programId, d, t, teacher)) continue;
    q.run('INSERT INTO availability(program_id,weekday,start_time,duration_min,teacher,meeting_url) VALUES(?,?,?,?,?,?)', programId, d, t, dur, teacher, url); n++;
  } });
  audit(user.id, 'availability_add', ip, String(n));
  return { added: n };
});
route('DELETE', '/api/admin/availability/:id', A, ({ params, user, ip }) => {
  q.run('UPDATE availability SET active=0 WHERE id=?', params.id); // existing bookings are untouched
  audit(user.id, 'availability_remove', ip, String(params.id));
  return { ok: true };
});

/* ----- sessions & attendance ----- */
route('GET', '/api/admin/sessions', A, ({ query }) => {
  const from = S.int(query.from ?? Date.now() - 7 * 86400e3, 'from', { min: 0 }), to = S.int(query.to ?? Date.now() + 30 * 86400e3, 'to', { min: 0 });
  if (to - from > 120 * 86400e3) throw S.bad('Date range too large');
  const sessions = q.all(`SELECT s.id, s.title, s.kind, s.starts_at AS startsAt, s.duration_min AS durationMin, s.capacity, s.teacher, s.meeting_url AS meetingUrl, s.status, p.name AS programName
    FROM class_sessions s JOIN programs p ON p.id=s.program_id WHERE s.starts_at>=? AND s.starts_at<? ORDER BY s.starts_at LIMIT 500`, from, to);
  const att = q.all(`SELECT b.id AS bookingId, b.session_id AS sessionId, b.status, u.name, u.email FROM bookings b JOIN users u ON u.id=b.user_id
    WHERE b.session_id IN (SELECT id FROM class_sessions WHERE starts_at>=? AND starts_at<?) AND b.status<>'cancelled'`, from, to);
  return { sessions: sessions.map((s) => ({ ...s, students: att.filter((a) => a.sessionId === s.id) })) };
});
route('POST', '/api/admin/bookings/:id/status', A, ({ params, body, user, ip }) => {
  const status = S.oneOf(body.status, 'Status', ['booked', 'attended', 'missed']);
  const r = q.run(`UPDATE bookings SET status=? WHERE id=? AND status<>'cancelled'`, status, params.id);
  if (!r.changes) throw new S.HttpError(404, 'Booking not found');
  audit(user.id, 'attendance', ip, `${params.id}:${status}`);
  return { ok: true };
});
route('PATCH', '/api/admin/sessions/:id', A, ({ params, body, user, ip }) => {
  const r = q.run('UPDATE class_sessions SET meeting_url=?, teacher=? WHERE id=?', S.httpsUrl(body.meetingUrl, 'Meeting link'), S.str(body.teacher, 'Tutor', { optional: true, max: 80 }), params.id);
  if (!r.changes) throw new S.HttpError(404, 'Session not found');
  audit(user.id, 'session_update', ip, String(params.id));
  return { ok: true };
});
route('POST', '/api/admin/sessions/:id/cancel', A, ({ params, user, ip }) => {
  q.run(`UPDATE class_sessions SET status='cancelled' WHERE id=?`, params.id);
  audit(user.id, 'session_cancel', ip, String(params.id));
  return { ok: true };
});

route('GET', '/api/admin/leads', A, () => ({
  leads: q.all('SELECT id, name, email, phone, interest, message, created_at AS createdAt FROM leads ORDER BY id DESC LIMIT 300'),
}));
