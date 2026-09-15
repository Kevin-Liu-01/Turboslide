#!/usr/bin/env node
// Build-time hygiene for apps/studio (SPEC 3.3 item 5; MILESTONES M1 acceptance).
//
//   node scripts/check-client-bundle.mjs apps/studio/dist [--server <dir>]...
//
// Asserts two measured hazards from the tanstack report:
//   1. Section 5.2: the server-only marker written by apps/studio/src/server/health.ts appears in
//      zero files under <dist>/client and in at least one file under the server output, so a
//      createServerFn body never reached the browser bundle and the check itself is live.
//   2. Section 5.5: no Solid or devtools chunk appears in the server output (dropping the
//      devtools() Vite plugin left neodrag and solid-js chunks in the server bundle and every
//      request returned 500). File names and contents are both checked.
//   3. gslides-parity SPEC-2 8.3 (VERIFICATION finding 12): no client chunk names `node:fs`,
//      `node:path` or `node:zlib`. The linter's rendered layer reached the page through
//      `@turboslide/lint/run`; the pages import `@turboslide/lint/run-client` now and the
//      studio's lint server function loads the rendered layer inside its handler, so a builtin
//      in the client output means a server module joined the browser graph again.
//
//   4. gslides-parity SPEC-4 0.44, 3.12 (round four, the integrator at merge 2): the largest
//      client chunk stays under 600,000 bytes (measured 1,122,594 before the bundle diet), and,
//      with --base <origin>, the chunks each route's served document preloads (its `<script
//      type="module" src>` and `<link rel="modulepreload" href>` tags, read from the SSR'd head
//      of /decks, /deck/gt-brand and /edit/gt-brand) sum to less than the route's `js decoded`
//      ceiling of SPEC-4 4.1, sized from the client output that serves them (--client <dir>, the
//      node-server build's apps/studio/.output/public; <dist>/client otherwise). Check step 31
//      runs that form against the node-server build on 4321 after the perf budget.
//      The largest chunk ceiling gates once every diet step of 3.12 has landed (SPEC-4 0.27), and
//      the vendor group (React, the scheduler and the router in a `vendor` chunk through
//      Rolldown's `output.codeSplitting.groups`) has not: measured at merge 2 on Vite 8.2.2 with
//      Rolldown 1.2.8, the group splits a 216 KB vendor chunk out of a bare Rolldown build of the
//      same entry, and inside the studio's Vite build neither `codeSplitting.groups` nor
//      `output.manualChunks` is consulted (a function `test` or `name` is called zero times and
//      the output is byte identical with and without them), from the environment config or the
//      top level (build-4/integrator.md section 17). Until a `vendor-*.js` chunk is in the client
//      output the ceiling is reported with that reason and the entry chunk's attribution, never
//      failed; the per route preload ceilings below are asserted regardless. The fixer round cut
//      the entry from 914,233 to 577,949 bytes without the vendor group, by taking the schema
//      package and zod out of the root graph (render/dither-walk.ts) and the page copy out of
//      routes/home.tsx's head (components/home/home-meta.ts); build-4/integrator.md section 22.
//
// The default server output is <dist>/server. A Nitro deploy build (apps/studio/.output/server)
// is checked too when it exists, or pass it with --server. Source maps are skipped: a client map
// may carry the original source text without the code having shipped.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MARKER = 'TURBOSLIDE_SERVER_ONLY_MARKER';
/** SPEC-4 3.12, 4.1: the largest client chunk, in bytes. */
const LARGEST_CHUNK_BYTES = 600_000;
/** SPEC-4 3.12: the per route preload ceilings (bytes of the chunks the served document names). */
const ROUTE_PRELOAD_CEILINGS = {
  '/decks': 600_000,
  '/deck/gt-brand': 1_000_000,
  '/edit/gt-brand': 2_000_000,
};
/**
 * The builtins a page must never name (SPEC-2 8.3), matched as module specifiers in quotes. The
 * three of the specification, plus node:child_process: the render worker's cli.ts imports it,
 * and a server module that reaches that file from the editor's client graph stops the editor from
 * booting in dev (measured 2026-09-12: the page error "Cannot access node:child_process.spawn in
 * client code" from apps/studio/src/server/render.ts importing @turboslide/render-worker/cli).
 */
const NODE_BUILTINS = ['node:fs', 'node:path', 'node:zlib', 'node:child_process'];
const NODE_BUILTIN_PATTERNS = NODE_BUILTINS.map(
  (name) => new RegExp(`["'\`]${name.replace(':', '\\:')}(?:/[^"'\`]*)?["'\`]`),
);
const SOLID_PATTERNS = [
  /solid-js/,
  /@solid-primitives/,
  /neodrag/,
  /@tanstack\/devtools/,
  /@tanstack\/react-devtools/,
];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.txt']);

const argv = process.argv.slice(2);
const extraServers = [];
let base = null;
let clientOverride = null;
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--server' && argv[i + 1]) extraServers.push(argv[++i]);
  else if (argv[i] === '--base' && argv[i + 1]) base = argv[++i].replace(/\/$/, '');
  else if (argv[i] === '--client' && argv[i + 1]) clientOverride = argv[++i];
  else if (!argv[i].startsWith('--')) positional.push(argv[i]);
}
if (positional.length !== 1) {
  console.error(
    'usage: node scripts/check-client-bundle.mjs <dist dir> [--server <dir>]... [--base <origin> [--client <dir>]]',
  );
  process.exit(2);
}

const dist = resolve(positional[0]);
const clientDir = join(dist, 'client');
const serverDirs = [join(dist, 'server'), ...extraServers.map((d) => resolve(d))];
const nitroOut = resolve(dist, '..', '.output', 'server');
if (existsSync(nitroOut) && !serverDirs.includes(nitroOut)) serverDirs.push(nitroOut);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function isTextFile(file) {
  const dot = file.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(file.slice(dot));
}

const failures = [];
const notes = [];

if (!existsSync(clientDir)) {
  failures.push(`client output missing: ${clientDir}`);
}
const presentServers = serverDirs.filter((d) => existsSync(d));
if (presentServers.length === 0) {
  failures.push(`server output missing: ${serverDirs.join(', ')}`);
}

// 1. The marker.
const clientFiles = walk(clientDir).filter(isTextFile);
const clientHits = clientFiles.filter((f) => readFileSync(f, 'utf8').includes(MARKER));
for (const f of clientHits)
  failures.push(`server-only marker found in client file ${relative(dist, f)}`);
notes.push(`marker in client files: ${clientHits.length} of ${clientFiles.length} text files`);

let serverHits = 0;
for (const dir of presentServers) {
  const files = walk(dir).filter(isTextFile);
  const hits = files.filter((f) => readFileSync(f, 'utf8').includes(MARKER));
  serverHits += hits.length;
  notes.push(
    `marker in server files under ${relative(process.cwd(), dir)}: ${hits.length} of ${files.length} text files`,
  );
}
if (presentServers.length > 0 && serverHits === 0) {
  failures.push(
    `server-only marker "${MARKER}" not found in any server file: the check is not live (keep a route calling a server function that returns it, see apps/studio/src/server/health.ts)`,
  );
}

// 3. Node builtins in the client output (SPEC-2 8.3).
const clientScripts = clientFiles.filter((f) => /\.(?:js|mjs|cjs)$/.test(f));
let builtinHits = 0;
for (const file of clientScripts) {
  const text = readFileSync(file, 'utf8');
  for (const [i, pattern] of NODE_BUILTIN_PATTERNS.entries()) {
    if (!pattern.test(text)) continue;
    builtinHits += 1;
    failures.push(
      `client chunk ${relative(dist, file)} names ${NODE_BUILTINS[i]}: a server module reached the browser graph (SPEC-2 8.3; the linter's rendered layer stays behind @turboslide/lint/run)`,
    );
  }
}
notes.push(
  `node builtins (${NODE_BUILTINS.join(', ')}) in client scripts: ${builtinHits} of ${clientScripts.length} files`,
);

// 2. Solid and devtools chunks in the server output.
for (const dir of presentServers) {
  for (const file of walk(dir)) {
    const rel = relative(dist, file);
    const nameHit =
      SOLID_PATTERNS.find((p) => p.test(rel)) ||
      (/solid/i.test(rel.split('/').pop() ?? '') ? /solid/i : null);
    if (nameHit) failures.push(`Solid or devtools chunk in server output (file name): ${rel}`);
    if (!isTextFile(file)) continue;
    const text = readFileSync(file, 'utf8');
    const contentHit = SOLID_PATTERNS.find((p) => p.test(text));
    if (contentHit)
      failures.push(`Solid or devtools code in server output (${contentHit}): ${rel}`);
  }
}

// 4. The largest client chunk (SPEC-4 3.12): every script under the client output, source maps
//    excluded; the node-server build's output when --client names it, else <dist>/client.
const chunkDir = clientOverride ? resolve(clientOverride) : clientDir;
const chunkFiles = walk(chunkDir).filter((f) => /\.(?:js|mjs|cjs)$/.test(f));
if (chunkFiles.length === 0) {
  failures.push(`no client script under ${chunkDir} for the largest chunk ceiling (SPEC-4 3.12)`);
} else {
  const sized = chunkFiles
    .map((f) => ({ file: f, bytes: statSync(f).size }))
    .sort((a, b) => b.bytes - a.bytes);
  const largest = sized[0];
  // the vendor group of SPEC-4 3.12 has landed when a vendor chunk is in the output; until then
  // the ceiling is a report (SPEC-4 0.27: the ceiling gates once every diet step has landed)
  const vendorLanded = sized.some((s) =>
    /(?:^|[\\/])vendor-[^\\/]*\.js$/.test(relative(chunkDir, s.file)),
  );
  notes.push(
    `largest client chunk under ${relative(process.cwd(), chunkDir)}: ${relative(chunkDir, largest.file)} ${largest.bytes} B (ceiling ${LARGEST_CHUNK_BYTES}, ${vendorLanded ? 'asserted' : 'reported: no vendor chunk in the output, the vendor group of SPEC-4 3.12 has not landed'}); next ${sized
      .slice(1, 4)
      .map((s) => `${relative(chunkDir, s.file)} ${s.bytes}`)
      .join(', ')}`,
  );
  if (largest.bytes > LARGEST_CHUNK_BYTES) {
    const line = `largest client chunk ${relative(chunkDir, largest.file)} is ${largest.bytes} B, over the ${LARGEST_CHUNK_BYTES} B ceiling (SPEC-4 3.12, 4.1)`;
    if (vendorLanded) failures.push(line);
    else notes.push(`OVER (reported) ${line}`);
  }
}

// 5. The per route preload ceilings (SPEC-4 3.12), from the served heads when --base is given.
if (base !== null) {
  const sizeOf = new Map(
    chunkFiles.map((f) => ['/' + relative(chunkDir, f).split('\\').join('/'), statSync(f).size]),
  );
  for (const [route, ceiling] of Object.entries(ROUTE_PRELOAD_CEILINGS)) {
    let html;
    try {
      const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(60_000) });
      if (response.status !== 200) {
        failures.push(
          `${route} answered ${response.status} on ${base}; no head to read (SPEC-4 3.12)`,
        );
        continue;
      }
      html = await response.text();
    } catch (error) {
      failures.push(
        `${route} on ${base}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const named = new Set();
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.(?:m?js))"/g)) named.add(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g))
      named.add(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="modulepreload"/g))
      named.add(m[1]);
    let total = 0;
    const unknown = [];
    for (const href of named) {
      const path = href.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const bytes = sizeOf.get(path);
      if (bytes === undefined) unknown.push(path);
      else total += bytes;
    }
    notes.push(
      `${route} preloads ${named.size} chunk(s), ${total} B on disk (ceiling ${ceiling})${unknown.length ? `; ${unknown.length} not under ${relative(process.cwd(), chunkDir)}: ${unknown.slice(0, 3).join(', ')}` : ''}`,
    );
    if (named.size === 0)
      failures.push(
        `${route} names no script or modulepreload in its head; nothing to measure (SPEC-4 3.12)`,
      );
    if (total > ceiling)
      failures.push(
        `${route} preloads ${total} B of chunks, over the ${ceiling} B ceiling (SPEC-4 3.12, 4.1)`,
      );
  }
}

for (const n of notes) console.log(`check-client-bundle: ${n}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`check-client-bundle: FAIL ${f}`);
  process.exit(1);
}
console.log('check-client-bundle: ok');
