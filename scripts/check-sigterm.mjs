#!/usr/bin/env node
// The SIGTERM pin of the node-server build (PERF-18, hardening HR-O#8; docs/hardening/HARDENING.md
// 8.4): the built server, sent SIGTERM while a client holds a keep-alive connection, exits within
// 10 s with code 0. Before the shutdown plugin (apps/studio/src/server/plugins/shutdown.ts) the
// listener closed and the process stayed alive until SIGKILL.
//
//   NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy
//   node scripts/check-sigterm.mjs [--port 4870] [--server apps/studio/.output/server/index.mjs]
//
// The port must be free: the script stops with 2 when something already answers on it.
//
// The server runs with the local test settings of the hardening lanes (the tmp store, the memory
// channel, mail captured, an auth database and secrets under a scratch folder this script removes).
// Prints one JSON line; exits 0 when the pin holds, 1 when it does not, 2 when the server never
// answered.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const port = Number(option('--port', '4870'));
const server = resolve(option('--server', 'apps/studio/.output/server/index.mjs'));
const PIN_MS = 10_000;
const KILL_AFTER_MS = 30_000;
const READY_MS = 180_000;

if (!existsSync(server)) {
  console.error(`check-sigterm: ${server} is missing; build the node-server output first`);
  process.exit(2);
}

/** One GET on a keep-alive connection; resolves with the status, leaves the socket open. */
const agentGet = (path) =>
  new Promise((done, fail) => {
    const req = request(
      { host: '127.0.0.1', port, path, headers: { connection: 'keep-alive' } },
      (res) => {
        res.resume();
        res.on('end', () => done(res.statusCode));
      },
    );
    req.on('error', fail);
    req.end();
  });

// a server already on the port would answer for the one this script starts
const busy = await agentGet('/home').then(
  () => true,
  () => false,
);
if (busy) {
  console.error(`check-sigterm: port ${port} already answers; pass a free one with --port`);
  process.exit(2);
}

const scratch = mkdtempSync(join(tmpdir(), 'turboslide-sigterm-'));
const secret = () => randomBytes(32).toString('hex');
const child = spawn(process.execPath, [server], {
  env: {
    ...process.env,
    PORT: String(port),
    NITRO_PORT: String(port),
    TURBOSLIDE_STORE: 'tmp',
    TURBOSLIDE_OVERLAY_DIR: join(scratch, 'overlay'),
    TURBOSLIDE_REALTIME: 'memory',
    TURBOSLIDE_LOCAL_OPEN: '1',
    TURBOSLIDE_AUTH_DB: join(scratch, 'auth.sqlite'),
    TURBOSLIDE_MAIL: 'capture',
    TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
    TURBOSLIDE_SESSION_SECRET: secret(),
    TURBOSLIDE_DOWNLOAD_SECRET: secret(),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-4000);
});
const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })));

const started = Date.now();
let ready = false;
while (Date.now() - started < READY_MS) {
  try {
    const status = await agentGet('/home');
    if (status !== undefined && status < 500) {
      ready = true;
      break;
    }
  } catch {
    // not listening yet
  }
  await new Promise((wait) => setTimeout(wait, 500));
}

let result;
if (!ready) {
  child.kill('SIGKILL');
  await exited;
  result = { ok: false, error: 'the server never answered /home', stderr: stderr.slice(-800) };
} else {
  const readyMs = Date.now() - started;
  const sent = Date.now();
  child.kill('SIGTERM');
  const timer = new Promise((done) => setTimeout(() => done(null), KILL_AFTER_MS));
  const outcome = await Promise.race([exited, timer]);
  const exitedAfterMs = outcome === null ? null : Date.now() - sent;
  if (outcome === null) {
    child.kill('SIGKILL');
    await exited;
  }
  result = {
    ok: outcome !== null && outcome.code === 0 && exitedAfterMs <= PIN_MS,
    readyMs,
    exitedAfterMs,
    code: outcome?.code ?? null,
    signal: outcome?.signal ?? null,
    pinMs: PIN_MS,
  };
}
rmSync(scratch, { recursive: true, force: true });
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : result.readyMs === undefined ? 2 : 1);
