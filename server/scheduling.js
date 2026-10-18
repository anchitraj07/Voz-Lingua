import { config } from './config.js';
import { q } from './db.js';

const DAY = 86400e3;
/** "2026-10-20" + "19:00" in academy time (IST) -> UTC epoch ms */
export function academyToUtc(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - config.academyOffsetMin * 60e3;
}
export const dateToDayMs = (date) => Date.parse(date + 'T00:00:00Z');
export const addDays = (date, n) => new Date(dateToDayMs(date) + n * DAY).toISOString().slice(0, 10);
export const weekdayOf = (date) => new Date(dateToDayMs(date)).getUTCDay();
/** Today's date in academy time */
export const academyToday = (now = Date.now()) => new Date(now + config.academyOffsetMin * 60e3).toISOString().slice(0, 10);

export function generateBatchSessions(batch) {
  const days = batch.weekdays.split(',').map(Number);
  const ins = `INSERT INTO class_sessions(program_id,batch_id,kind,title,starts_at,duration_min,capacity,teacher,meeting_url) VALUES(?,?,?,?,?,?,?,?,?)`;
  let n = 0;
  for (let i = 0; i < batch.weeks * 7; i++) {
    const date = addDays(batch.start_date, i);
    if (!days.includes(weekdayOf(date))) continue;
    q.run(ins, batch.program_id, batch.id, 'group', batch.title, academyToUtc(date, batch.start_time), batch.duration_min, batch.capacity, batch.teacher, batch.meeting_url);
    n++;
  }
  return n;
}

/** Does this user already have a booked class overlapping [start,end)? */
export function userOverlap(userId, start, end) {
  return q.get(
    `SELECT s.starts_at FROM bookings b JOIN class_sessions s ON s.id=b.session_id
     WHERE b.user_id=? AND b.status='booked' AND s.status='scheduled'
       AND s.starts_at < ? AND s.starts_at + s.duration_min*60000 > ?`, userId, end, start);
}
export const countTaken = (sessionId) =>
  q.get(`SELECT COUNT(*) c FROM bookings WHERE session_id=? AND status IN ('booked','attended','missed')`, sessionId).c;
