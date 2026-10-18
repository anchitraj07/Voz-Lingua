// Usage: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='long-passphrase' npm run create-admin
import { ensureAdmin } from '../server/seed.js';
import { config } from '../server/config.js';
if (!config.adminEmail || !config.adminPassword) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (in .env or the environment).'); process.exit(1); }
const created = await ensureAdmin();
console.log(created ? 'Admin created.' : 'An account with that email already exists – nothing changed.');
