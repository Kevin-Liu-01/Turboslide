#!/usr/bin/env node
// The bundled logo index snapshot (docs/FEATURES.md 4.2; build/hotfix.md section 9). Writes
// apps/studio/src/server/logo-index.snapshot.json, the copy of the logo index the deployment
// carries in its function bundle so a cold instance answers the picker while the public store's
// edge refuses `system/logo-index.json` for the minutes after a write of it (the window every
// refresh opens; before this a cold instance answered 503 on every logo route for its length).
// The snapshot is read from the current index on the store when the store holds a real build, and
// built from thesvg.org's `icons.json` through the refresh's own builder (`refreshLogoIndex` in
// apps/studio/src/server/logo-index.ts, over the network upstream and sharp, the same reads pass
// and flags) when the store holds none or the ten mark fixture another deployment's fixture
// refresh wrote there. `lastError` is stripped: a snapshot never names a failure of its own day.
// Rebuilt by this script at each ship and committed (the ship note's checklist).
//
//   node scripts/build-logo-index-snapshot.mjs --store <public store host>   the store's index when real, else icons.json
//   node scripts/build-logo-index-snapshot.mjs --upstream                    icons.json through the builder, whatever the store holds
//   node scripts/build-logo-index-snapshot.mjs --check                       the committed snapshot parses; its facts
//   node scripts/build-logo-index-snapshot.mjs --dry                         the builder imports; nothing fetched or written
//
// The store host is TURBOSLIDE_PUBLIC_STORE_HOST when the flag is absent (the same variable the
// deployment carries; a public host, never a token). The builder is loaded through Vite's module
// runner from apps/studio (the server sources use extensionless imports Node's type stripping
// cannot follow), with `sharp` externalized as the app's own config keeps it. A plain file over
// PLAIN_MAX_BYTES is refused with the size named, so the gzip path is a decision and never a
// surprise. Nothing here prints a token.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = resolve(ROOT, 'apps/studio');
const OUT = resolve(STUDIO, 'src/server/logo-index.snapshot.json');
/** The most a plain snapshot may weigh before the gzip path is taken instead (build/hotfix.md 9). */
const PLAIN_MAX_BYTES = 4 * 1024 * 1024;
/** A real build lists this many icons at least; the fixture lists ten. */
const REAL_BUILD_MIN_ICONS = 1000;
/** The reads pass over 4,940 marks at a concurrency of 8 takes minutes; the budget is generous. */
const BUILD_BUDGET_MS = 30 * 60 * 1000;
const BUILD_ROUNDS_MAX = 6;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null;
};
const say = (line) => process.stderr.write(`build-logo-index-snapshot: ${line}\n`);

/** The facts of an index, for the log and the check. */
function factsOf(index) {
  const icons = Array.isArray(index.icons) ? index.icons : [];
  return {
    icons: icons.length,
    brands: icons.filter((row) => row.collection === 'brands').length,
    flagged: icons.filter((row) => typeof row.readsOnPaper === 'boolean').length,
    cachedMarks: Object.keys(index.cached ?? {}).length,
    updatedAt: index.updatedAt ?? null,
    builtAt: index.builtAt ?? null,
    progress: index.progress ?? null,
    lastError: index.lastError ?? null,
  };
}

/** True for an index the picker can serve as a real build: the module's shape, a complete build, many icons. */
function isRealBuild(index) {
  if (typeof index !== 'object' || index === null || index.v !== 1) return false;
  if (!Array.isArray(index.icons) || index.icons.length < REAL_BUILD_MIN_ICONS) return false;
  if (typeof index.updatedAt !== 'string') return false;
  if (index.progress !== undefined) return false;
  return true;
}

/** The store's index through its public host: the bytes and the parsed index, or the reason there is none. */
async function readStore(host) {
  const url = `https://${host}/system/logo-index.json`;
  let response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    return {
      index: null,
      reason: `${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!response.ok) return { index: null, reason: `${url}: HTTP ${response.status}` };
  const text = await response.text();
  try {
    return { index: JSON.parse(text), reason: null, url };
  } catch {
    return { index: null, reason: `${url}: not JSON` };
  }
}

/**
 * The refresh's builder from apps/studio through Vite's module runner: logo-index.ts's exports,
 * and a close that stops the server.
 */
async function loadBuilder() {
  const vite = await import(pathToFileURL(resolve(STUDIO, 'node_modules/vite/dist/node/index.js')));
  const server = await vite.createServer({
    configFile: false,
    root: STUDIO,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const runner = vite.createServerModuleRunner(server.environments.ssr, { hmr: false });
  const mod = await runner.import('/src/server/logo-index.ts');
  return {
    mod,
    close: async () => {
      await runner.close();
      await server.close();
    },
  };
}

/** The index built from icons.json through the builder, in memory: no store, no write outside this process. */
async function buildFromUpstream(mod) {
  const store = mod.memoryLogoStore();
  const upstream = mod.networkUpstream();
  const rasterize = mod.sharpRasterizer();
  for (let round = 1; round <= BUILD_ROUNDS_MAX; round += 1) {
    const started = Date.now();
    const counts = await mod.refreshLogoIndex({
      store,
      upstream,
      rasterize,
      budgetMs: BUILD_BUDGET_MS,
      log: (line) => say(line),
    });
    say(
      `round ${round}: ${counts.icons} icons, ${counts.brands} brands, ${counts.fetched} fetched, ${counts.unavailable} unavailable${counts.progress ? `, progress ${counts.progress.done} of ${counts.progress.total}` : ''}${counts.lastError ? `, lastError ${counts.lastError.message}` : ''} in ${Math.round((Date.now() - started) / 1000)} s`,
    );
    if (counts.lastError !== undefined)
      throw new Error(`the upstream failed: ${counts.lastError.message}`);
    if (counts.progress === undefined) break;
    if (round === BUILD_ROUNDS_MAX) throw new Error('the build did not complete within the rounds');
  }
  const index = await store.readIndex();
  if (index === null) throw new Error('the builder wrote no index');
  return index;
}

async function main() {
  if (flag('check')) {
    if (!existsSync(OUT)) {
      say(`no snapshot at ${OUT}`);
      return 1;
    }
    const index = JSON.parse(readFileSync(OUT, 'utf8'));
    const facts = factsOf(index);
    const bytes = statSync(OUT).size;
    say(`${OUT}: ${bytes} bytes, ${JSON.stringify(facts)}`);
    if (!isRealBuild(index)) {
      say('the committed snapshot is not a real build');
      return 1;
    }
    return 0;
  }
  if (flag('dry')) {
    const { mod, close } = await loadBuilder();
    say(
      `the builder imports: ${Object.keys(mod).filter((k) => typeof mod[k] === 'function').length} functions, refreshLogoIndex ${typeof mod.refreshLogoIndex}`,
    );
    await close();
    return 0;
  }

  let index = null;
  let source = null;
  const host = option('store') ?? process.env.TURBOSLIDE_PUBLIC_STORE_HOST ?? null;
  if (!flag('upstream') && host !== null) {
    const read = await readStore(host);
    if (read.index === null)
      say(`the store's index is not readable (${read.reason}); building from icons.json`);
    else if (!isRealBuild(read.index))
      say(
        `the store holds no real build (${JSON.stringify(factsOf(read.index))}: the ten mark fixture of a fixture preview, or a partial build); building from icons.json`,
      );
    else {
      index = read.index;
      source = `the store's index at ${read.url}`;
    }
  } else if (!flag('upstream')) {
    say('no store host (--store or TURBOSLIDE_PUBLIC_STORE_HOST); building from icons.json');
  }

  const { mod, close } = await loadBuilder();
  try {
    if (index === null) {
      index = await buildFromUpstream(mod);
      source = "thesvg.org's icons.json through refreshLogoIndex over the network upstream";
    }
    // a snapshot never names a failure of its own day, and carries no partial build's progress
    const parsed = mod.parseLogoIndex(index);
    if (parsed === null) throw new Error('the index does not parse as the module wrote it');
    delete parsed.lastError;
    if (!isRealBuild(parsed))
      throw new Error(`not a real build: ${JSON.stringify(factsOf(parsed))}`);
    const bytes = mod.logoIndexBytes(parsed);
    if (bytes.byteLength > PLAIN_MAX_BYTES)
      throw new Error(
        `the plain snapshot is ${bytes.byteLength} bytes, over ${PLAIN_MAX_BYTES}: take the gzip path (build/hotfix.md 9) before committing`,
      );
    writeFileSync(OUT, bytes);
    say(
      `wrote ${OUT}: ${bytes.byteLength} bytes from ${source}; ${JSON.stringify(factsOf(parsed))}`,
    );
    return 0;
  } finally {
    await close();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    say(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
