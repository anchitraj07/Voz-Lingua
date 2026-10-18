// Runs the API server and the Vite dev server together. Ctrl+C stops both.
import { spawn } from 'node:child_process';
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (c) => { console.log(`[${name}] exited (${c})`); process.exit(c ?? 0); });
  return p;
};
const procs = [run('api', 'npm', ['run', 'dev:server']), run('web', 'npm', ['run', 'dev:client'])];
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => procs.forEach((p) => p.kill()));
