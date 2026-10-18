import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { q } from './db.js';
import { handle } from './http.js';
import { seedIfEmpty, ensureAdmin } from './seed.js';
import './routes/auth.js';
import './routes/public.js';
import './routes/student.js';
import './routes/admin.js';

export async function start(port = config.port, host = config.host) {
  seedIfEmpty();
  await ensureAdmin();
  setInterval(() => q.run('DELETE FROM sessions WHERE expires_at<?', Date.now()), 3600e3).unref();
  const server = http.createServer(handle);
  server.requestTimeout = 30e3; server.headersTimeout = 15e3; server.keepAliveTimeout = 5e3;
  await new Promise((r) => server.listen(port, host, r));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await start();
  console.log(`VOZ LINGUA server listening on http://${config.host}:${s.address().port} (${config.isProd ? 'production' : 'development'})`);
  if (!config.adminEmail && !q.get(`SELECT id FROM users WHERE role='admin'`)) console.warn('No admin yet: set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart.');
  const stop = () => s.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
