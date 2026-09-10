#!/usr/bin/env node
// `pnpm check`: the M1 acceptance chain from MILESTONES.md, run in order from the repo root.
// Every step is the literal command from the milestone plan, with one guard: step 3 first proves
// the generated files are tracked, because `git diff --exit-code` passes trivially on untracked
// paths. The runner adds only what the plan assumes about its environment: it creates
// .turboslide/, it skips the steps that read Kevin's Prototemplate checkout when that path is
// missing (CI; set TURBOSLIDE_PROTOTEMPLATE_DECK to point at one), and for the steps that need the
// studio it starts the dev server on 4321 and stops it afterwards with the server log capped
// (AGENTS.md, dev-server rules). Nothing is claimed done until every step exits 0.
//
//   node scripts/check.mjs                run everything
//   node scripts/check.mjs --list         print the numbered steps
//   node scripts/check.mjs --from 6       start at step 6
//   node scripts/check.mjs --only 4,5     run only those steps
//   node scripts/check.mjs --strict       fail instead of skipping when the Prototemplate deck is missing
//   node scripts/check.mjs --keep-server  leave a dev server the runner started running
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROTOTEMPLATE_DECK =
  process.env.TURBOSLIDE_PROTOTEMPLATE_DECK ?? '/Users/kevinliu/repos/Prototemplate/deck';
const STUDIO_URL = 'http://localhost:4321';
const SERVER_LOG = '.turboslide/dev-server.log';
const LOG_CAP_BYTES = 2 * 1024 * 1024;
const SERVER_TIMEOUT_MS = 120_000;

// MILESTONES.md, M1 acceptance, in order. `needs` marks the environment a step depends on.
const steps = [
  { cmd: 'pnpm install --frozen-lockfile' },
  { cmd: 'pnpm exec tsr generate --config apps/studio/tsr.config.json' },
  {
    // `git ls-files --error-unmatch` exits 1 when a pathspec matches no tracked file, so an
    // uncommitted generated tree fails here instead of passing the diff by having nothing to diff.
    // The plan writes the route as apps/studio/src/routes/openapi.json.ts; on disk it is
    // openapi[.]json.ts because TanStack Router's file routing escapes a dot in a segment with
    // [.], and the :(literal) pathspec magic stops git from reading the brackets as a glob class.
    cmd: "git ls-files --error-unmatch packages/agent/generated skills/*/references docs/grammar.md ':(literal)apps/studio/src/routes/openapi[.]json.ts' > /dev/null && pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md ':(literal)apps/studio/src/routes/openapi[.]json.ts'",
  },
  { cmd: 'pnpm exec tsc -b' },
  { cmd: 'pnpm test' },
  { cmd: 'pnpm build && node scripts/check-client-bundle.mjs apps/studio/dist' },
  {
    cmd: `pnpm exec turboslide import ${PROTOTEMPLATE_DECK} --into gt-brand --json > .turboslide/import.json`,
    needs: 'prototemplate',
  },
  {
    cmd: `node -e "const r=require('./.turboslide/import.json'); if(r.slides!==85||r.sections!==8||r.htmlBlocks>4) process.exit(1)"`,
    needs: 'prototemplate',
  },
  { cmd: 'pnpm exec turboslide validate decks/gt-brand' },
  {
    cmd: 'pnpm exec turboslide render all --theme light,dark --scale 1 --out .turboslide/render --json',
  },
  {
    cmd: `node -e "const r=require('./.turboslide/render/render.json'); if(r.length!==170||r.some(x=>x.pageErrors.length)) process.exit(1)"`,
  },
  {
    cmd: `node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot ${PROTOTEMPLATE_DECK} --max-mismatch 0.005 --skip-html-escapes`,
    needs: 'prototemplate',
  },
  { cmd: 'pnpm exec turboslide sheet all --cols 4 --thumb 480 --numbered --out .turboslide/sheet' },
  {
    cmd: `node -e "const fs=require('fs'); for (const t of ['light','dark']) { fs.statSync('.turboslide/sheet/sheet-'+t+'.png'); const m=JSON.parse(fs.readFileSync('.turboslide/sheet/sheet-'+t+'.json')); if(m.cells.length!==85) process.exit(1) }"`,
  },
  { cmd: 'pnpm exec turboslide lint all --json > .turboslide/lint.json' },
  { cmd: 'pnpm exec turboslide build --out .turboslide/brand-deck.html --budget 16' },
  { cmd: 'pnpm exec playwright test apps/studio/e2e/viewer.spec.ts', needs: 'server' },
  {
    cmd: `pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/deck/gt-brand --widths 1440,1280,390 --themes light,dark`,
    needs: 'server',
  },
];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('list')) {
  steps.forEach((step, i) =>
    console.log(`${String(i + 1).padStart(2)}  ${step.needs ? `[${step.needs}] ` : ''}${step.cmd}`),
  );
  process.exit(0);
}

const from = Number(value('from') ?? 1);
const only = value('only') ? new Set(value('only').split(',').map(Number)) : null;
const strict = flag('strict');
const keepServer = flag('keep-server');
const hasPrototemplate = existsSync(PROTOTEMPLATE_DECK);

process.chdir(ROOT);
mkdirSync('.turboslide', { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function cappedLog(path) {
  const stream = createWriteStream(path, { flags: 'w' });
  let written = 0;
  let capped = false;
  return {
    write(chunk) {
      if (capped) return;
      written += chunk.length;
      if (written > LOG_CAP_BYTES) {
        capped = true;
        stream.write(
          `\n[check.mjs] log capped at ${LOG_CAP_BYTES} bytes; further output dropped\n`,
        );
        return;
      }
      stream.write(chunk);
    },
    close() {
      stream.end();
    },
  };
}

let server = null;
let serverLog = null;

async function ensureServer() {
  if (server) return;
  if (await isUp(STUDIO_URL)) {
    console.log(
      `check: reusing the server already listening on ${STUDIO_URL} (it is not stopped afterwards)`,
    );
    return;
  }
  serverLog = cappedLog(SERVER_LOG);
  const child = spawn(
    'pnpm',
    ['--filter', '@turboslide/studio', 'exec', 'vite', 'dev', '--port', '4321', '--strictPort'],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (chunk) => serverLog.write(chunk));
  child.stderr.on('data', (chunk) => serverLog.write(chunk));
  server = child;
  console.log(`check: starting the studio dev server on 4321 (log capped in ${SERVER_LOG})`);
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(STUDIO_URL)) return;
    if (child.exitCode !== null)
      throw new Error(
        `dev server exited with ${child.exitCode} before answering; see ${SERVER_LOG}`,
      );
    await sleep(500);
  }
  throw new Error(
    `dev server did not answer on 4321 within ${SERVER_TIMEOUT_MS / 1000} s; see ${SERVER_LOG}`,
  );
}

async function stopServer() {
  if (!server) return;
  if (keepServer) {
    console.log(
      `check: leaving the dev server running (pid ${server.pid}) because of --keep-server`,
    );
    return;
  }
  const child = server;
  server = null;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && Date.now() < deadline) await sleep(100);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  serverLog?.close();
  console.log('check: dev server stopped');
}

process.on('SIGINT', async () => {
  await stopServer();
  process.exit(130);
});

let selected = steps.map((step, i) => ({ ...step, n: i + 1 })).filter((s) => s.n >= from);
if (only) selected = selected.filter((s) => only.has(s.n));
const lastServerStep = selected.filter((s) => s.needs === 'server').at(-1)?.n;

const startedAt = Date.now();
let exitCode = 0;
for (const step of selected) {
  const label = `check ${String(step.n).padStart(2)}/${steps.length}`;
  if (step.needs === 'prototemplate' && !hasPrototemplate) {
    if (strict) {
      console.error(
        `${label}: FAIL Prototemplate deck missing at ${PROTOTEMPLATE_DECK} (--strict)`,
      );
      exitCode = 1;
      break;
    }
    console.log(
      `${label}: skip (Prototemplate deck missing at ${PROTOTEMPLATE_DECK}; set TURBOSLIDE_PROTOTEMPLATE_DECK)\n    ${step.cmd}`,
    );
    continue;
  }
  if (step.needs === 'server') {
    try {
      await ensureServer();
    } catch (error) {
      console.error(`${label}: FAIL ${error instanceof Error ? error.message : String(error)}`);
      exitCode = 1;
      break;
    }
  }
  console.log(`${label}: ${step.cmd}`);
  const t = Date.now();
  const result = spawnSync(step.cmd, {
    shell: '/bin/sh',
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  });
  const seconds = ((Date.now() - t) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`${label}: FAIL exit ${result.status ?? result.signal} after ${seconds} s`);
    exitCode = result.status ?? 1;
    break;
  }
  console.log(`${label}: ok in ${seconds} s`);
  if (step.n === lastServerStep) await stopServer();
}

await stopServer();
const total = ((Date.now() - startedAt) / 1000).toFixed(1);
if (exitCode === 0)
  console.log(`check: all ${selected.length} selected step(s) passed in ${total} s`);
else console.error(`check: stopped after a failure (${total} s)`);
process.exit(exitCode);
