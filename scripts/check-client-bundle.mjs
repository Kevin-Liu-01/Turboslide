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
// The default server output is <dist>/server. A Nitro deploy build (apps/studio/.output/server)
// is checked too when it exists, or pass it with --server. Source maps are skipped: a client map
// may carry the original source text without the code having shipped.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MARKER = 'TURBOSLIDE_SERVER_ONLY_MARKER';
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
const positional = argv.filter((a) => !a.startsWith('--'));
const extraServers = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--server' && argv[i + 1]) extraServers.push(argv[i + 1]);
}
if (positional.length !== 1) {
  console.error('usage: node scripts/check-client-bundle.mjs <dist dir> [--server <dir>]');
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

for (const n of notes) console.log(`check-client-bundle: ${n}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`check-client-bundle: FAIL ${f}`);
  process.exit(1);
}
console.log('check-client-bundle: ok');
