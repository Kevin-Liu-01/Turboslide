#!/usr/bin/env node
// B4's dev server on 4464 (B4_SCRATCH names the scratch folder; <tmpdir>/turboslide-b4 by default) (docs/PEOPLE.md 5.1): the round's dev server environment with the
// overlay root and the identity database under this scratch folder, so nothing of the drive
// touches the repo's .turboslide/ or the machine's shared <tmpdir>/turboslide. The two secrets
// are minted here and written to b4-env.json (mode 600) for the drive; no bootstrap bearer, so
// the agent surface admits the session cookie on localhost; nothing is printed but the pid and
// the log path.
//   node b4-server.mjs start | stop
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from "node:os";
import { join } from "node:path";

const HERE = process.env.B4_SCRATCH ?? join(tmpdir(), "turboslide-b4");
const WORKTREE = '/Users/kevinliu/repos/Turboslide-people';
const PORT = '4464';
const OVERLAY = join(HERE, 'b4-overlay');
const ENV_FILE = join(HERE, 'b4-env.json');
const PID_FILE = join(HERE, 'b4-server.pid');
const LOG = join(HERE, 'b4-dev-4464.log');

const mode = process.argv[2] ?? 'start';
if (mode === 'stop') {
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf8'));
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    rmSync(PID_FILE, { force: true });
    console.log(`stopped ${pid}`);
  } else console.log('no pid file');
  process.exit(0);
}

// a fresh overlay per start: the identity database, the principals and the users folder start
// empty, so the day's upload quota and the served files are this run's alone
rmSync(OVERLAY, { recursive: true, force: true });
mkdirSync(OVERLAY, { recursive: true });
// no TURBOSLIDE_TOKEN: with one set, a request without a bearer is refused on the agent surface
// (server/auth.ts), and the drive reaches /api/actions as the signed in browser does, with the
// session cookie on localhost; the drive's address is the deployment admin for the sweep
const secrets = {
  TURBOSLIDE_SESSION_SECRET: randomBytes(32).toString('hex'),
  TURBOSLIDE_DOWNLOAD_SECRET: randomBytes(32).toString('hex'),
};
const DRIVE_EMAIL = 'b4-drive@example.test';
const env = {
  ...process.env,
  TURBOSLIDE_STORE: 'tmp',
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_LOCAL_OPEN: '1',
  TURBOSLIDE_AUTH_DB: '.turboslide/auth-b4.sqlite',
  TURBOSLIDE_MAIL: 'capture',
  TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
  TURBOSLIDE_OVERLAY_DIR: OVERLAY,
  TURBOSLIDE_ADMIN_EMAILS: DRIVE_EMAIL,
  ...secrets,
};
writeFileSync(
  ENV_FILE,
  JSON.stringify(
    {
      ...secrets,
      TURBOSLIDE_AUTH_DB_PATH: join(OVERLAY, '.turboslide', 'auth-b4.sqlite'),
      TURBOSLIDE_OVERLAY_DIR: OVERLAY,
      DRIVE_EMAIL,
      BASE: `http://localhost:${PORT}`,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
const log = openSync(LOG, 'a');
const child = spawn(
  join(WORKTREE, 'apps/studio/node_modules/.bin/vite'),
  ['dev', '--port', PORT, '--strictPort'],
  { cwd: join(WORKTREE, 'apps/studio'), env, detached: true, stdio: ['ignore', log, log] },
);
writeFileSync(PID_FILE, String(child.pid));
child.unref();
console.log(`started pid ${child.pid}; log ${LOG}`);
