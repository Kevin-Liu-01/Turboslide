#!/usr/bin/env node
// `pnpm check`: the M1 acceptance chain from MILESTONES.md, run in order from the repo root, plus
// the M2 format gate (step 19) and the two steps of the Google Slides parity round (steps 20 and
// 21, docs/gslides-parity/SPEC.md 14.1). Every step is the literal command from the milestone plan,
// with one guard: step 3 first proves the generated files are tracked, because
// `git diff --exit-code` passes trivially on untracked paths. The runner adds only what the plan
// assumes about its environment: it creates .turboslide/, it skips the steps that read Kevin's
// Prototemplate checkout when that path is missing (CI; set TURBOSLIDE_PROTOTEMPLATE_DECK to point
// at one), and for the steps that need the studio it starts the dev server on 4321 and stops it
// afterwards with the server log capped (AGENTS.md, dev-server rules). Nothing is claimed done
// until every step exits 0.
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
// The pages step 18 audits, fetched once the server answers, with the client module graph they
// name, so Vite's SSR transforms and its dependency optimizer have run before a browser opens
// them (measured: `--only 18` on a cold server failed three runs of three with `state "list" did
// not apply` on the first audit, while the same step passed in the full chain after step 17 had
// warmed the server; the shell driver now also waits for hydration, this keeps that wait short).
const WARM_PATHS = ['/deck/gt-brand', '/edit/gt-brand', '/new', '/decks'];
const WARM_TIMEOUT_MS = 120_000;
const WARM_MODULE_CAP = 4000;
const WARM_CONCURRENCY = 8;

// The editor shell binds no bare letters (gslides-parity SPEC 10.2), so its chrome lint enters its
// states through what exists at every audited width: grid view from the bottom bar, the File
// menu from the menu bar, the Version history panel from Google's Cmd+Option+Shift+H
// (packages/headless/src/shell.ts SHELL_STATES; the toolbar's Theme button collapses into More at
// 390 px and the bottom bar's panel button sits under the dev server's devtools trigger). The
// home page has no states.
const EDITOR_STATES = 'editorGrid,editorMenu,editorPanel';
// Step 20 (gslides-parity SPEC 14.1): the Google parity audit once the verifier has written it;
// until then the menu model tests stand in, so the step is never a silent pass.
const PARITY_AUDIT = 'scripts/gslides-parity-audit.mjs';

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
    cmd: "git ls-files --error-unmatch packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts' > /dev/null && pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'",
  },
  { cmd: 'pnpm exec tsc -b' },
  { cmd: 'pnpm test' },
  { cmd: 'pnpm build && node scripts/check-client-bundle.mjs apps/studio/dist' },
  {
    cmd: `pnpm exec turboslide import ${PROTOTEMPLATE_DECK} --into gt-brand --json > .turboslide/import.json`,
    needs: 'prototemplate',
  },
  {
    cmd: `node -e "const r=require('./.turboslide/import.json'); if(r.slides!==85||r.sections!==8||r.htmlBlocks!==0) process.exit(1)"`,
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
    cmd: `node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot ${PROTOTEMPLATE_DECK} --max-mismatch 0.005`,
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
    // the viewer, then the editor: the editor's toolbar carries the deck name, the status chip,
    // Search and the Export menu, and the M5 verification found its chip drawn under Search at
    // 1280 while only /deck was audited here
    // gslides-parity SPEC 14.1: the editor, the draft and the home page join the audit
    cmd: `pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/deck/gt-brand --widths 1440,1280,390 --themes light,dark && pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/edit/gt-brand --widths 1440,1280,390 --themes light,dark --states ${EDITOR_STATES} && pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/new --widths 1440,1280,390 --themes light,dark --states ${EDITOR_STATES} && pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/decks --widths 1440,1280,390 --themes light,dark --states ''`,
    needs: 'server',
  },
  // MILESTONES.md M2 acceptance, added after the M2 review found 41 files that `pnpm format` had
  // not touched: the tree is prettier-clean (AGENTS.md code rules). Last, so the M1 step numbers
  // that AGENTS.md and the status documents cite stay valid.
  { cmd: 'pnpm format:check' },
  // gslides-parity SPEC 14.1, steps 20 and 21: the Google parity audit (the verifier's script;
  // the menu model tests until it exists) and the parity round's end to end specs, the ten tasks
  // of SPEC 11.2 first
  existsSync(PARITY_AUDIT)
    ? {
        cmd: `node ${PARITY_AUDIT} --base ${STUDIO_URL} --out docs/gslides-parity/verification/parity-audit.json`,
        needs: 'server',
      }
    : {
        cmd: 'pnpm exec vitest run --dir packages/chrome menus/__tests__',
      },
  {
    cmd: 'pnpm exec playwright test apps/studio/e2e/ten-tasks.spec.ts apps/studio/e2e/text-editing.spec.ts apps/studio/e2e/filmstrip.spec.ts apps/studio/e2e/home.spec.ts apps/studio/e2e/present.spec.ts apps/studio/e2e/landing.spec.ts apps/studio/e2e/gslides-actions.spec.ts apps/studio/e2e/deck-transfer.spec.ts',
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

async function fetchText(path) {
  const response = await fetch(`${STUDIO_URL}${path}`, {
    signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
  });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    text: await response.text(),
  };
}

// the module URLs a dev page or a transformed module names: script and modulepreload tags,
// static and dynamic imports; Vite rewrites every import to a root-relative URL in dev
function moduleUrls(text) {
  const urls = new Set();
  for (const m of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(\/[^"]+)"/g))
    urls.add(m[1]);
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\/[^"'\s]+)["']/g))
    urls.add(m[1]);
  return urls;
}

async function warmServer() {
  const t = Date.now();
  const seen = new Set();
  const queue = [];
  for (const path of WARM_PATHS) {
    const { status, text } = await fetchText(path);
    if (status >= 400) throw new Error(`warm-up: ${STUDIO_URL}${path} answered ${status}`);
    for (const url of moduleUrls(text)) {
      if (seen.has(url)) continue;
      seen.add(url);
      queue.push(url);
    }
  }
  // the client module graph, crawled breadth first: each request transforms one module and lets
  // the optimizer discover the dependencies it imports; a module that fails is left to the browser
  let fetched = 0;
  let inflight = 0;
  const worker = async () => {
    while (queue.length > 0 || inflight > 0) {
      const url = queue.shift();
      if (url === undefined) {
        await sleep(20);
        continue;
      }
      if (fetched >= WARM_MODULE_CAP) continue;
      fetched += 1;
      inflight += 1;
      try {
        const { status, type, text } = await fetchText(url);
        if (status < 400 && /javascript|ecmascript/.test(type)) {
          for (const next of moduleUrls(text)) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
          }
        }
      } catch {
        // a module the browser will report if it matters
      } finally {
        inflight -= 1;
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
  console.log(
    `check: warmed ${WARM_PATHS.join(' and ')} with ${fetched} client module(s) in ${((Date.now() - t) / 1000).toFixed(1)} s`,
  );
}

async function ensureServer() {
  if (server) return;
  if (await isUp(STUDIO_URL)) {
    console.log(
      `check: reusing the server already listening on ${STUDIO_URL} (it is not stopped afterwards)`,
    );
    await warmServer();
    return;
  }
  // A kept server outlives this process, so its output is discarded rather than piped: a pipe to
  // an exited parent kills the server on its next log line (measured: the server left by
  // `--keep-server` answered one more lint run and then refused connections). Never an unbounded
  // file (AGENTS.md, dev-server rules).
  if (!keepServer) serverLog = cappedLog(SERVER_LOG);
  const child = spawn(
    'pnpm',
    ['--filter', '@turboslide/studio', 'exec', 'vite', 'dev', '--port', '4321', '--strictPort'],
    {
      cwd: ROOT,
      detached: true,
      stdio: keepServer ? ['ignore', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.on('data', (chunk) => serverLog.write(chunk));
  child.stderr?.on('data', (chunk) => serverLog.write(chunk));
  if (keepServer) child.unref();
  server = child;
  console.log(
    keepServer
      ? 'check: starting the studio dev server on 4321 (output discarded, it stays up after --keep-server)'
      : `check: starting the studio dev server on 4321 (log capped in ${SERVER_LOG})`,
  );
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(STUDIO_URL)) {
      await warmServer();
      return;
    }
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
