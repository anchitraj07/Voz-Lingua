import { q, tx } from './db.js';
import { config } from './config.js';
import { generateBatchSessions, addDays, academyToday, weekdayOf } from './scheduling.js';
import { hashPassword, checkPassword } from './security.js';

/** First-run data. Names/prices are placeholders – edit them from the Admin panel (no code changes needed). */
export function seedIfEmpty() {
  if (q.get('SELECT COUNT(*) c FROM programs').c > 0) return;
  tx(() => {
    const ins = `INSERT INTO programs(slug,name,kind,tagline,description,sort_order) VALUES(?,?,?,?,?,?)`;
    const g = q.run(ins, 'group', 'Group Sessions', 'group', 'Learn together in small live batches',
      'Live online classes with a small group of learners at your level. Fixed weekly schedule, speaking practice in every class, and the motivation of learning with others.', 1).lastInsertRowid;
    const s = q.run(ins, 'specialised', 'Specialised One-on-One', 'one_on_one', 'A course designed around you',
      'Private sessions with your own tutor. You choose the days and time slots, and the syllabus is tailored to your goals — work, study, travel, or exams.', 2).lastInsertRowid;
    const pl = `INSERT INTO plans(program_id,name,description,price_minor,billing_period,sessions_per_week,session_minutes,features,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`;
    q.run(pl, g, 'Group Plan', 'Small-batch live French classes (plan name and pricing to be announced).', null, 'month', 3, 60,
      JSON.stringify(['Live classes with a certified tutor', 'Small batches', 'Speaking practice every class', 'Progress tracking in your dashboard']), 1);
    q.run(pl, s, 'Specialised Plan', 'Personalised one-on-one French coaching (plan name and pricing to be announced).', null, 'month', 2, 60,
      JSON.stringify(['One-on-one with your own tutor', 'You pick your days and time slots', 'Custom syllabus for your goal', 'Flexible rescheduling']), 1);

    if (!config.seedSampleData) return;
    // Sample schedule so the booking screens are not empty. Edit or deactivate in Admin.
    const start = addDays(academyToday(), 7 - ((weekdayOf(academyToday()) + 6) % 7)); // next Monday
    for (const [title, level, weekdays, time] of [
      ['A1 Evening Batch', 'A1', '1,3,5', '19:00'],
      ['A1 Weekend Batch', 'A1', '6,0', '10:00'],
      ['A2 Evening Batch', 'A2', '2,4', '19:30'],
    ]) {
      const b = { program_id: g, title, level, weekdays, start_time: time, duration_min: 60, capacity: 8, start_date: start, weeks: 8, teacher: 'VOZ LINGUA Tutor', meeting_url: null };
      b.id = q.run(`INSERT INTO batches(program_id,title,level,weekdays,start_time,duration_min,capacity,start_date,weeks,teacher) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        g, title, level, weekdays, time, 60, 8, start, 8, b.teacher).lastInsertRowid;
      generateBatchSessions(b);
    }
    for (const wd of [1, 2, 3, 4, 5]) for (const t of ['17:00', '18:00', '19:00', '20:00'])
      q.run(`INSERT INTO availability(program_id,weekday,start_time,duration_min,teacher) VALUES(?,?,?,?,?)`, s, wd, t, 60, 'VOZ LINGUA Tutor');
    for (const [wd, t] of [[6, '10:00'], [6, '11:00'], [6, '12:00']])
      q.run(`INSERT INTO availability(program_id,weekday,start_time,duration_min,teacher) VALUES(?,?,?,?,?)`, s, wd, t, 60, 'VOZ LINGUA Tutor');
  });
}

export async function ensureAdmin() {
  const { adminEmail: email, adminPassword: pw } = config;
  if (!email || !pw) return false;
  if (q.get('SELECT id FROM users WHERE email=?', email)) return false;
  checkPassword(pw, { email });
  q.run(`INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)`, 'Admin', email.toLowerCase(), await hashPassword(pw), 'admin', Date.now());
  console.log(`Created admin account for ${email}`);
  return true;
}
