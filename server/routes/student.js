import { route } from '../http.js';
import { q, tx, audit } from '../db.js';
import { config } from '../config.js';
import * as S from '../security.js';
import { academyToUtc, addDays, weekdayOf, academyToday, userOverlap, countTaken } from '../scheduling.js';
import { planOut } from './public.js';

const HOUR = 3600e3;
const BOOKING_SQL = `
  SELECT b.id AS bookingId, b.status AS bookingStatus, s.id AS sessionId, s.title, s.kind, s.starts_at AS startsAt,
         s.duration_min AS durationMin, s.teacher, s.meeting_url AS meetingUrl, s.status AS sessionStatus,
         p.id AS programId, p.name AS programName
    FROM bookings b JOIN class_sessions s ON s.id=b.session_id JOIN programs p ON p.id=s.program_id`;
const bookingOut = (r) => ({ ...r, status: r.sessionStatus === 'cancelled' ? 'cancelled' : r.bookingStatus });

function requireActiveSub(userId, programId) {
  const sub = q.get(`SELECT s.id FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND p.program_id=? AND s.status='active'`, userId, programId);
  if (!sub) throw new S.HttpError(403, 'You need an active plan for this program before booking. Pick a plan under "My Plan".');
}

/* ---------- plans / subscriptions ---------- */
const subsFor = (userId) => q.all(
  `SELECT s.id, s.status, s.created_at AS createdAt, p.*, pr.name AS programName, pr.kind AS programKind
     FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN programs pr ON pr.id=p.program_id
    WHERE s.user_id=? ORDER BY s.id DESC`, userId)
  .map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, programName: r.programName, programKind: r.programKind, plan: planOut(r) }));

route('GET', '/api/subscriptions', { auth: 'user' }, ({ user }) => ({ subscriptions: subsFor(user.id) }));

route('POST', '/api/subscriptions', { auth: 'user', limit: { name: 'subscribe', max: 20, windowMs: 3600e3 } }, ({ user, body, ip }) => {
  const plan = q.get('SELECT p.*, pr.active AS pr_active FROM plans p JOIN programs pr ON pr.id=p.program_id WHERE p.id=?', S.int(body.planId, 'Plan', { min: 1 }));
  if (!plan || !plan.active || !plan.pr_active) throw new S.HttpError(404, 'That plan is not available');
  const now = Date.now();
  try {
    q.run('INSERT INTO subscriptions(user_id,plan_id,status,created_at,updated_at) VALUES(?,?,?,?,?)', user.id, plan.id, config.requireApproval ? 'pending' : 'active', now, now);
  } catch { throw new S.HttpError(409, 'You already have this plan'); }
  audit(user.id, 'subscribe', ip, String(plan.id));
  return { subscriptions: subsFor(user.id) };
});

route('POST', '/api/subscriptions/:id/cancel', { auth: 'user' }, ({ user, params, ip }) => {
  const r = q.run(`UPDATE subscriptions SET status='cancelled', updated_at=? WHERE id=? AND user_id=? AND status IN ('pending','active','paused')`, Date.now(), params.id, user.id); // user_id check = no IDOR
  if (!r.changes) throw new S.HttpError(404, 'Plan not found');
  audit(user.id, 'unsubscribe', ip, String(params.id));
  return { subscriptions: subsFor(user.id) };
});

/* ---------- overview ---------- */
route('GET', '/api/me/overview', { auth: 'user' }, ({ user }) => {
  const now = Date.now();
  const c = (st) => q.get(`SELECT COUNT(*) c, COALESCE(SUM(s.duration_min),0) m FROM bookings b JOIN class_sessions s ON s.id=b.session_id WHERE b.user_id=? AND b.status=?`, user.id, st);
  const attended = c('attended'), missed = c('missed');
  const upcoming = q.all(`${BOOKING_SQL} WHERE b.user_id=? AND b.status='booked' AND s.status='scheduled' AND s.starts_at+s.duration_min*60000>? ORDER BY s.starts_at LIMIT 5`, user.id, now).map(bookingOut);
  const upcomingCount = q.get(`SELECT COUNT(*) c FROM bookings b JOIN class_sessions s ON s.id=b.session_id WHERE b.user_id=? AND b.status='booked' AND s.status='scheduled' AND s.starts_at>?`, user.id, now).c;
  const done = attended.c + missed.c;
  return {
    stats: { upcoming: upcomingCount, attended: attended.c, missed: missed.c, hoursLearned: Math.round(attended.m / 6) / 10, attendanceRate: done ? Math.round((attended.c / done) * 100) : null },
    upcoming, subscriptions: subsFor(user.id),
  };
});

/* ---------- bookings (calendar & class list) ---------- */
route('GET', '/api/bookings', { auth: 'user' }, ({ user, query }) => {
  const from = S.int(query.from ?? Date.now() - 90 * 24 * HOUR, 'from', { min: 0 }), to = S.int(query.to ?? Date.now() + 366 * 24 * HOUR, 'to', { min: 0 });
  if (to - from > 500 * 24 * HOUR) throw S.bad('Date range too large');
  const rows = q.all(`${BOOKING_SQL} WHERE b.user_id=? AND s.starts_at>=? AND s.starts_at<? ORDER BY s.starts_at`, user.id, from, to).map(bookingOut);
  return { bookings: rows, cancelHours: config.cancelHours };
});

route('POST', '/api/bookings/:id/cancel', { auth: 'user' }, ({ user, params, ip }) => {
  tx(() => {
    const b = q.get(`SELECT b.status, s.id sid, s.kind, s.starts_at FROM bookings b JOIN class_sessions s ON s.id=b.session_id WHERE b.id=? AND b.user_id=?`, params.id, user.id);
    if (!b) throw new S.HttpError(404, 'Class not found');
    if (b.status !== 'booked') throw new S.HttpError(409, 'This class can no longer be cancelled');
    if (b.starts_at - Date.now() < config.cancelHours * HOUR) throw new S.HttpError(409, `Classes can only be cancelled at least ${config.cancelHours} hours before they start`);
    q.run(`UPDATE bookings SET status='cancelled' WHERE id=?`, params.id);
    if (b.kind === 'one_on_one') q.run(`UPDATE class_sessions SET status='cancelled' WHERE id=?`, b.sid); // frees the slot for others
  });
  audit(user.id, 'booking_cancel', ip, String(params.id));
  return { ok: true };
});

/* ---------- group batches ---------- */
function batchesFor(userId, programId) {
  const now = Date.now();
  return q.all(`SELECT * FROM batches WHERE program_id=? AND active=1 ORDER BY id`, programId).map((b) => {
    const sessions = q.all(`SELECT id, starts_at FROM class_sessions WHERE batch_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at`, b.id, now);
    const mine = sessions.length ? q.get(`SELECT COUNT(*) c FROM bookings WHERE user_id=? AND status='booked' AND session_id IN (${sessions.map(() => '?').join(',')})`, userId, ...sessions.map((s) => s.id)).c : 0;
    const taken = sessions.length ? Math.max(...sessions.map((s) => countTaken(s.id))) : 0;
    return {
      id: b.id, title: b.title, level: b.level, weekdays: b.weekdays.split(',').map(Number), startTime: b.start_time, durationMin: b.duration_min,
      teacher: b.teacher, capacity: b.capacity, seatsLeft: Math.max(0, b.capacity - taken), sessionsRemaining: sessions.length,
      nextSessionAt: sessions[0]?.starts_at ?? null, joined: mine > 0,
    };
  }).filter((b) => b.sessionsRemaining > 0);
}

route('GET', '/api/programs/:id/batches', { auth: 'user' }, ({ user, params }) => ({ batches: batchesFor(user.id, params.id), academyTz: config.academyTz }));

route('POST', '/api/batches/:id/join', { auth: 'user', limit: { name: 'booking', max: 30, windowMs: 3600e3 } }, ({ user, params, ip }) => {
  tx(() => {
    const batch = q.get('SELECT * FROM batches WHERE id=? AND active=1', params.id);
    if (!batch) throw new S.HttpError(404, 'Batch not found');
    requireActiveSub(user.id, batch.program_id);
    const sessions = q.all(`SELECT * FROM class_sessions WHERE batch_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at`, batch.id, Date.now());
    if (!sessions.length) throw new S.HttpError(409, 'This batch has no upcoming classes');
    for (const s of sessions) {
      const mine = q.get(`SELECT status FROM bookings WHERE session_id=? AND user_id=?`, s.id, user.id);
      if (mine && mine.status === 'booked') continue;
      if (countTaken(s.id) >= s.capacity) throw new S.HttpError(409, 'This batch is full');
      if (userOverlap(user.id, s.starts_at, s.starts_at + s.duration_min * 60e3)) throw new S.HttpError(409, 'This batch clashes with a class you already have booked');
      q.run(`INSERT INTO bookings(session_id,user_id,status,created_at) VALUES(?,?,'booked',?) ON CONFLICT(session_id,user_id) DO UPDATE SET status='booked' WHERE status='cancelled'`, s.id, user.id, Date.now());
    }
  });
  audit(user.id, 'batch_join', ip, String(params.id));
  return { ok: true };
});

route('POST', '/api/batches/:id/leave', { auth: 'user' }, ({ user, params, ip }) => {
  q.run(`UPDATE bookings SET status='cancelled' WHERE user_id=? AND status='booked' AND session_id IN (SELECT id FROM class_sessions WHERE batch_id=? AND starts_at>?)`, user.id, params.id, Date.now() + config.cancelHours * HOUR);
  audit(user.id, 'batch_leave', ip, String(params.id));
  return { ok: true };
});

/* ---------- one-on-one slots ---------- */
route('GET', '/api/programs/:id/slots', { auth: 'user' }, ({ user, params }) => {
  const prog = q.get(`SELECT kind FROM programs WHERE id=? AND active=1`, params.id);
  if (!prog || prog.kind !== 'one_on_one') throw new S.HttpError(404, 'Program not found');
  const slots = q.all('SELECT id, weekday, start_time AS startTime, duration_min AS durationMin, teacher FROM availability WHERE program_id=? AND active=1 ORDER BY weekday, start_time', params.id);
  const maxPerWeek = q.get(`SELECT MAX(p.sessions_per_week) m FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND p.program_id=? AND s.status='active'`, user.id, params.id).m || 0;
  return { slots, maxPerWeek, academyTz: config.academyTz, minDate: addDays(academyToday(), 1), maxDate: addDays(academyToday(), 60) };
});

route('POST', '/api/one-on-one/book', { auth: 'user', limit: { name: 'booking', max: 30, windowMs: 3600e3 } }, ({ user, body, ip }) => {
  const programId = S.int(body.programId, 'Program', { min: 1 });
  const weeks = S.int(body.weeks, 'Weeks', { min: 1, max: 12 });
  const startDate = S.dateStr(body.startDate, 'Start date');
  if (!Array.isArray(body.availabilityIds) || !body.availabilityIds.length || body.availabilityIds.length > 7) throw S.bad('Choose between 1 and 7 weekly slots');
  const ids = [...new Set(body.availabilityIds.map((v) => S.int(v, 'Slot', { min: 1 })))];
  if (startDate < academyToday() || startDate > addDays(academyToday(), 60)) throw S.bad('Start date must be within the next 60 days');

  const created = tx(() => {
    const prog = q.get(`SELECT kind FROM programs WHERE id=? AND active=1`, programId);
    if (!prog || prog.kind !== 'one_on_one') throw new S.HttpError(404, 'Program not found');
    requireActiveSub(user.id, programId);
    const maxPerWeek = q.get(`SELECT MAX(p.sessions_per_week) m FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND p.program_id=? AND s.status='active'`, user.id, programId).m;
    if (ids.length > maxPerWeek) throw S.bad(`Your plan includes ${maxPerWeek} session(s) per week`);

    const now = Date.now(), conflicts = [], plan = [];
    for (const id of ids) {
      const a = q.get('SELECT * FROM availability WHERE id=? AND program_id=? AND active=1', id, programId);
      if (!a) throw new S.HttpError(404, 'One of the slots is no longer available');
      let date = startDate;
      while (weekdayOf(date) !== a.weekday) date = addDays(date, 1);
      for (let w = 0; w < weeks; w++, date = addDays(date, 7)) {
        const start = academyToUtc(date, a.start_time), end = start + a.duration_min * 60e3;
        if (start < now + config.minLeadHours * HOUR) continue;
        const taken = q.get(`SELECT id FROM class_sessions WHERE kind='one_on_one' AND status='scheduled' AND COALESCE(teacher,'')=COALESCE(?,'') AND starts_at<? AND starts_at+duration_min*60000>?`, a.teacher, end, start);
        if (taken || userOverlap(user.id, start, end)) conflicts.push({ date, time: a.start_time });
        else plan.push({ a, start });
      }
    }
    if (conflicts.length) throw new S.HttpError(409, 'Some of those times are already taken. Pick different slots or another start date.', { conflicts });
    if (!plan.length) throw S.bad('No upcoming dates fall in that range');
    const prof = q.get('SELECT name FROM programs WHERE id=?', programId);
    for (const { a, start } of plan) {
      const sid = q.run(`INSERT INTO class_sessions(program_id,kind,title,starts_at,duration_min,capacity,teacher,meeting_url) VALUES(?,?,?,?,?,?,?,?)`,
        programId, 'one_on_one', prof.name, start, a.duration_min, 1, a.teacher, a.meeting_url).lastInsertRowid;
      q.run(`INSERT INTO bookings(session_id,user_id,status,created_at) VALUES(?,?,'booked',?)`, sid, user.id, now);
    }
    return plan.length;
  });
  audit(user.id, 'one_on_one_book', ip, `${created} sessions`);
  return { created };
});

/* ---------- calendar export (.ics) ---------- */
const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => line.match(/.{1,73}/gu).join('\r\n ');

route('GET', '/api/calendar.ics', { auth: 'user' }, ({ res, user }) => {
  const rows = q.all(`${BOOKING_SQL} WHERE b.user_id=? AND b.status IN ('booked','attended') AND s.status='scheduled' AND s.starts_at>?`, user.id, Date.now() - 30 * 24 * HOUR);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VOZ LINGUA//Classes//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:VOZ LINGUA classes'];
  for (const r of rows) lines.push('BEGIN:VEVENT', `UID:booking-${r.bookingId}@vozlingua`, `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(r.startsAt)}`, `DTEND:${icsDate(r.startsAt + r.durationMin * 60e3)}`, `SUMMARY:${icsEsc('VOZ LINGUA – ' + r.title)}`,
    `DESCRIPTION:${icsEsc((r.teacher ? 'Tutor: ' + r.teacher + '\n' : '') + (r.meetingUrl || ''))}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  const out = lines.map(fold).join('\r\n') + '\r\n';
  res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="voz-lingua-classes.ics"', 'Cache-Control': 'no-store' });
  res.end(out);
});
