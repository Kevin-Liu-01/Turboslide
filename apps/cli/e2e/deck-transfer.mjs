#!/usr/bin/env node
// Deck transfer against a running studio (docs/deck-transfer.md), `node apps/cli/e2e/deck-transfer.mjs`:
// `turboslide deck push` uploads a scratch deck (a copy of decks/fixture) to the studio through
// POST /api/decks/bundle, the studio lists it and serves its editor page, `deck pull` downloads it
// through GET /api/decks/<id>/bundle into decks/ under another id with every slide and asset byte
// identical, a second push without --replace lands on a free sibling id and a push with --replace
// replaces, and a bundle with a bad slide is refused with 400 before anything is written. The
// studio must listen on TURBOSLIDE_STUDIO_URL (default http://localhost:4321); when nothing answers
// there the script starts the dev server the way scripts/check.mjs does and stops it at the end.
// With TURBOSLIDE_TOKEN in the environment the CLI sends it as the bearer (a studio started with
// the same variable requires it); the scratch decks are removed afterwards.
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '@turboslide/cli/cli';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STUDIO_URL = process.env.TURBOSLIDE_STUDIO_URL ?? 'http://localhost:4321';
const DECK = 'e2e-transfer';
const PULLED = 'e2e-transfer-pulled';
const DECKS_DIR = join(ROOT, 'decks');
const SERVER_TIMEOUT_MS = 120_000;

const log = (line) => process.stderr.write(`${line}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seedDeck(id) {
  const dir = join(DECKS_DIR, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(DECKS_DIR, 'fixture', 'slides'), join(dir, 'slides'), { recursive: true });
  if (existsSync(join(DECKS_DIR, 'fixture', 'assets'))) {
    cpSync(join(DECKS_DIR, 'fixture', 'assets'), join(dir, 'assets'), { recursive: true });
  }
  const manifest = JSON.parse(readFileSync(join(DECKS_DIR, 'fixture', 'deck.json'), 'utf8'));
  manifest.id = id;
  manifest.title = 'E2E transfer deck';
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}

function removeDecks(ids) {
  for (const id of ids) {
    rmSync(join(DECKS_DIR, id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
  }
}

function snapshot(dir, relative = '') {
  const out = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative === '' ? entry.name : posix.join(relative, entry.name);
    if (entry.isDirectory())
      for (const [k, v] of snapshot(join(dir, entry.name), rel)) out.set(k, v);
    else out.set(rel, readFileSync(join(dir, entry.name)).toString('base64'));
  }
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

let server = null;

async function ensureServer() {
  if (await isUp(STUDIO_URL)) {
    log(`deck-transfer: using the studio at ${STUDIO_URL}`);
    return;
  }
  if (new URL(STUDIO_URL).port !== '4321') {
    throw new Error(`nothing answers at ${STUDIO_URL}; start the studio there first`);
  }
  log('deck-transfer: starting the studio dev server on 4321');
  server = spawn(
    'pnpm',
    ['--filter', '@turboslide/studio', 'exec', 'vite', 'dev', '--port', '4321', '--strictPort'],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'ignore'] },
  );
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(STUDIO_URL)) return;
    if (server.exitCode !== null) throw new Error(`the dev server exited with ${server.exitCode}`);
    await sleep(500);
  }
  throw new Error('the dev server did not answer within 120 s');
}

async function stopServer() {
  if (!server) return;
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
  log('deck-transfer: dev server stopped');
}

/** Runs the CLI in process with a scratch config dir, so the hosts file never touches ~/.config. */
async function cli(argv, configDir) {
  let stdout = '';
  let stderr = '';
  const env = { ...process.env, TURBOSLIDE_CONFIG_DIR: configDir };
  const code = await runCli(argv, {
    cwd: ROOT,
    env,
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

function tokenArgs() {
  return process.env.TURBOSLIDE_TOKEN ? ['--token', process.env.TURBOSLIDE_TOKEN] : [];
}

function authHeaders() {
  return process.env.TURBOSLIDE_TOKEN
    ? { authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}` }
    : {};
}

async function main() {
  const configDir = mkdtempSync(join(tmpdir(), 'turboslide-e2e-config-'));
  const created = new Set([DECK, PULLED]);
  const steps = [];
  let current = '';
  const step = async (name, fn) => {
    current = name;
    const startedAt = Date.now();
    const value = await fn();
    steps.push(`${name} (${Date.now() - startedAt} ms)`);
    log(`ok   ${name}`);
    return value;
  };
  const local = seedDeck(DECK);
  try {
    await ensureServer();

    const remoteId = await step('deck push creates the deck on the studio', async () => {
      const run = await cli(
        ['deck', 'push', DECK, '--to', STUDIO_URL, ...tokenArgs(), '--replace', '--json'],
        configDir,
      );
      assert(run.code === 0, `push exited ${run.code}: ${run.stderr}`);
      const result = JSON.parse(run.stdout);
      assert(result.deckId === DECK, `pushed as ${result.deckId}`);
      assert(result.url === `${STUDIO_URL}/edit/${DECK}`, `editor url ${result.url}`);
      const token = process.env.TURBOSLIDE_TOKEN;
      assert(token === undefined || !run.stderr.includes(token), 'the token was printed');
      return result.deckId;
    });

    await step('the studio lists the deck and serves its editor shell', async () => {
      const list = await fetch(new URL('/decks', STUDIO_URL));
      assert(list.status === 200, `/decks ${list.status}`);
      const html = await list.text();
      assert(html.includes(`data-deck="${remoteId}"`), '/decks does not list the pushed deck');
      assert(html.includes('data-control="connect.card"'), '/decks has no Connect card');
      const editor = await fetch(new URL(`/edit/${remoteId}`, STUDIO_URL));
      assert(editor.status === 200, `/edit/${remoteId} ${editor.status}`);
      const present = await fetch(new URL(`/deck/${remoteId}?present=1`, STUDIO_URL));
      assert(present.status === 200, `/deck/${remoteId}?present=1 ${present.status}`);
    });

    await step('the bundle route answers the zip with the manifest facts', async () => {
      const response = await fetch(new URL(`/api/decks/${remoteId}/bundle`, STUDIO_URL), {
        headers: authHeaders(),
      });
      if (response.status !== 200)
        throw new Error(`bundle ${response.status}: ${await response.text()}`);
      assert((response.headers.get('content-type') ?? '').includes('application/zip'), 'not a zip');
      const facts = JSON.parse(response.headers.get('x-turboslide-bundle') ?? '{}');
      assert(facts.deckId === remoteId, 'X-Turboslide-Bundle names another deck');
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert(bytes[0] === 0x50 && bytes[1] === 0x4b, 'the body is not a zip');
      const disposition = response.headers.get('content-disposition') ?? '';
      assert(disposition.includes(`${remoteId}-r`), `content-disposition ${disposition}`);
    });

    await step('deck pull recreates the deck under another id byte for byte', async () => {
      rmSync(join(DECKS_DIR, PULLED), { recursive: true, force: true });
      const run = await cli(
        ['deck', 'pull', remoteId, '--from', STUDIO_URL, ...tokenArgs(), '--as', PULLED, '--json'],
        configDir,
      );
      assert(run.code === 0, `pull exited ${run.code}: ${run.stderr}`);
      const result = JSON.parse(run.stdout);
      assert(result.deckId === PULLED && result.sourceDeckId === remoteId, JSON.stringify(result));
      const before = snapshot(local);
      const after = snapshot(join(DECKS_DIR, PULLED));
      before.delete('deck.json');
      after.delete('deck.json');
      assert(before.size === after.size, `${before.size} files locally, ${after.size} pulled`);
      for (const [path, bytes] of before)
        assert(after.get(path) === bytes, `${path} differs after the round trip`);
    });

    await step('a second push without --replace lands on a free sibling id', async () => {
      const run = await cli(
        ['deck', 'push', DECK, '--to', STUDIO_URL, ...tokenArgs(), '--json'],
        configDir,
      );
      assert(run.code === 0, `push exited ${run.code}: ${run.stderr}`);
      const result = JSON.parse(run.stdout);
      assert(
        result.deckId !== DECK && result.deckId.startsWith(`${DECK}-`),
        `sibling id ${result.deckId}`,
      );
      assert(result.renamed === true && result.replaced === false, JSON.stringify(result));
      created.add(result.deckId);
    });

    await step('a bundle with a bad slide is refused with 400 and nothing is written', async () => {
      // built outside decks/, since a checkout's studio serves that very folder
      const broken = join(mkdtempSync(join(tmpdir(), 'turboslide-e2e-broken-')), `${DECK}-broken`);
      cpSync(local, broken, { recursive: true });
      const manifest = JSON.parse(readFileSync(join(broken, 'deck.json'), 'utf8'));
      manifest.id = `${DECK}-broken`;
      writeFileSync(join(broken, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      const slide = readdirSync(join(broken, 'slides'))[0];
      writeFileSync(
        join(broken, 'slides', slide),
        `{ "schemaVersion": 1, "id": "${slide.replace(/\.json$/, '')}", "kind": "content" }\n`,
      );
      const run = await cli(
        ['deck', 'push', broken, '--to', STUDIO_URL, ...tokenArgs()],
        configDir,
      );
      rmSync(dirname(broken), { recursive: true, force: true });
      assert(run.code === 2, `push of a broken deck exited ${run.code}`);
      assert(/answered 400: .*does not validate/.test(run.stderr), `stderr: ${run.stderr}`);
      const list = await fetch(new URL('/decks', STUDIO_URL));
      assert(
        !(await list.text()).includes(`data-deck="${DECK}-broken`),
        'the broken deck was written',
      );
    });

    if (process.env.TURBOSLIDE_TOKEN) {
      await step('without the bearer the routes answer 401', async () => {
        const response = await fetch(new URL(`/api/decks/${remoteId}/bundle`, STUDIO_URL));
        assert(response.status === 401, `bundle without a token ${response.status}`);
        const upload = await fetch(new URL('/api/decks/bundle', STUDIO_URL), {
          method: 'POST',
          body: new Uint8Array(4),
        });
        assert(upload.status === 401, `upload without a token ${upload.status}`);
      });
    }

    log(`deck-transfer: ${steps.length} steps passed`);
    for (const line of steps) log(`  ${line}`);
  } catch (error) {
    log(
      `deck-transfer: failed at "${current}": ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    removeDecks([...created]);
    rmSync(configDir, { recursive: true, force: true });
    await stopServer();
  }
}

await main();
