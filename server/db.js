import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
  level TEXT NOT NULL DEFAULT 'A1',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  ip TEXT, user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- A program is a top-level offering (Group, Specialised...). parent_id lets you add branches later
-- (e.g. Specialised -> Business French, DELF/TCF prep) without changing code.
CREATE TABLE IF NOT EXISTS programs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('group','one_on_one')),
  tagline TEXT, description TEXT,
  parent_id INTEGER REFERENCES programs(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id),
  name TEXT NOT NULL, description TEXT,
  price_minor INTEGER,                       -- NULL = "pricing coming soon"
  currency TEXT NOT NULL DEFAULT 'INR',
  billing_period TEXT NOT NULL DEFAULT 'month' CHECK(billing_period IN ('month','course','session')),
  sessions_per_week INTEGER NOT NULL DEFAULT 2,
  session_minutes INTEGER NOT NULL DEFAULT 60,
  features TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK(status IN ('pending','active','paused','cancelled')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_sub ON subscriptions(user_id, plan_id) WHERE status IN ('pending','active','paused');

CREATE TABLE IF NOT EXISTS batches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id),
  title TEXT NOT NULL, level TEXT NOT NULL,
  weekdays TEXT NOT NULL,                    -- "1,3,5" (0=Sun..6=Sat) in academy time
  start_time TEXT NOT NULL, duration_min INTEGER NOT NULL, capacity INTEGER NOT NULL,
  start_date TEXT NOT NULL, weeks INTEGER NOT NULL,
  teacher TEXT, meeting_url TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS availability(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id),
  weekday INTEGER NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER NOT NULL,
  teacher TEXT, meeting_url TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS class_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id),
  batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('group','one_on_one')),
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,                -- UTC epoch ms
  duration_min INTEGER NOT NULL, capacity INTEGER NOT NULL,
  teacher TEXT, meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_cs_time ON class_sessions(starts_at);
CREATE INDEX IF NOT EXISTS idx_cs_batch ON class_sessions(batch_id);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','cancelled','attended','missed')),
  created_at INTEGER NOT NULL,
  UNIQUE(session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, interest TEXT, message TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, event TEXT NOT NULL, ip TEXT, detail TEXT, created_at INTEGER NOT NULL
);
`);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};
export function audit(userId, event, ip, detail) {
  q.run('INSERT INTO audit_log(user_id,event,ip,detail,created_at) VALUES(?,?,?,?,?)', userId ?? null, event, ip ?? null, detail ?? null, Date.now());
}
