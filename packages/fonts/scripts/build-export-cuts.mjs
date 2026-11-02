#!/usr/bin/env node
// Cuts the catalog's export faces (packages/fonts/src/export-cuts.ts; docs/pptx.md "The catalog
// faces in Editable text"): for every catalog family but Inter, the static TrueType cuts
// exportPlan names, made from the committed woff2 files under assets/<id>/ by
// build-export-cuts.py with fontTools in the fonts venv (`.turboslide/venv`), written to
// export/catalog/<id>/ with the family's LICENSE beside them, and export/catalog/catalog.json
// recording per cut its family, slot, weight, optical size, bytes, sha256 and spacing table, per
// skipped cut the reason, and per refused family the licence reason (no file is written for it).
// Nothing is fetched: the sources are the catalog's committed files. The PowerPoint export reads
// the manifest (packages/export/src/pptx/fonts-map.ts) and embeds the files under --embed-fonts;
// export-cuts.test.ts compares the committed files with the manifest and the manifest with the
// plan, so a stale build fails the package's tests.
//
//   node packages/fonts/scripts/build-export-cuts.mjs [--only fraunces,oswald] [--python <bin>]
//                                                     [--jobs 4] [--check]
//
// --check builds into a temporary folder and compares every file with the manifest by sha256
// (exit 1 on a difference) without writing. --only rebuilds the named families and keeps the
// others' rows. --jobs runs that many python processes over whole families at once.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, '..');
const ROOT = resolve(PACKAGE, '..', '..');
const OUT = join(PACKAGE, 'export', 'catalog');
const MANIFEST = join(OUT, 'catalog.json');

const { CATALOG_FILES } = await import('../src/catalog-files.ts');
const { GOOGLE_FONTS_COMMIT } = await import('../src/catalog.ts');
const {
  DISPLAY_FROM_PX,
  DISPLAY_OPSZ,
  EXPORT_CUT_WEIGHTS,
  TEXT_OPSZ,
  exportPlan,
  exportSlotStyle,
} = await import('../src/export-cuts.ts');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PYTHON = arg('python', join(ROOT, '.turboslide', 'venv', 'bin', 'python'));
const CHECK = argv.includes('--check');
const JOBS = Math.max(1, Number(arg('jobs', '1')) || 1);

/** Bump when the naming, the weights or the optical sizes change; the export report records it. */
const BUILD_VERSION = 1;

/** The whole pixel sizes a cut's spacing table covers: its band's sizes up to the axis maximum. */
function spacingSizes(facts, cut) {
  const opsz = facts.axes?.opsz;
  if (!opsz || cut.decoded) return [];
  const from = cut.band === 'display' ? DISPLAY_FROM_PX : 8;
  const to = cut.band === 'display' ? Math.ceil(opsz[1]) : DISPLAY_FROM_PX - 1;
  const sizes = [];
  for (let size = from; size <= Math.max(from, to); size += 1) sizes.push(size);
  return sizes;
}

const version = spawnSync(PYTHON, ['-c', 'import fontTools, brotli; print(fontTools.version)'], {
  encoding: 'utf8',
});
if (version.status !== 0) {
  console.error(
    `build-export-cuts: ${PYTHON} lacks fontTools with brotli (${version.error?.message ?? version.stderr.trim()}); create the venv with \`turboslide fonts build\` or pass --python`,
  );
  process.exit(2);
}

const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
const families = CATALOG_FILES.filter((facts) => facts.id !== 'inter').filter(
  (facts) => ONLY.length === 0 || ONLY.includes(facts.id),
);
const out = CHECK ? mkdtempSync(join(tmpdir(), 'turboslide-export-cuts-')) : OUT;
const jobs = [];
const faces = {};
for (const facts of families) {
  const plan = exportPlan(facts);
  faces[facts.id] = { name: facts.name, refused: plan.refused, cuts: [], skipped: [] };
  if (plan.refused !== null) continue;
  // grouped by source file, so the python side keeps one source open at a time
  const cuts = [...plan.cuts].sort((a, b) => a.source.localeCompare(b.source));
  for (const cut of cuts)
    jobs.push({
      ...cut,
      style: exportSlotStyle(cut.slot),
      sourcePath: join(PACKAGE, 'assets', facts.id, cut.source),
      reservedFontName: facts.reservedFontName,
      spacingSizes: spacingSizes(facts, cut),
    });
}

const started = Date.now();
// one python per bucket of whole faces, the heaviest face first into the lightest bucket
const buckets = Array.from({ length: JOBS }, () => []);
const byFace = Object.groupBy(jobs, (job) => job.id);
for (const list of Object.values(byFace).sort((a, b) => b.length - a.length))
  buckets
    .reduce((lightest, bucket) => (bucket.length < lightest.length ? bucket : lightest))
    .push(...list);
const pythonRun = (bucket) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(PYTHON, [join(HERE, 'build-export-cuts.py')], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', (code) =>
      code === 0
        ? resolvePromise(JSON.parse(stdout).rows)
        : rejectPromise(new Error(`the python run exited ${code}`)),
    );
    child.stdin.end(JSON.stringify({ out, jobs: bucket }));
  });
let results;
try {
  results = await Promise.all(buckets.filter((b) => b.length > 0).map(pythonRun));
} catch (error) {
  console.error(`build-export-cuts: ${error.message}`);
  process.exit(1);
}
const rows = new Map(results.flat().map((row) => [`${row.family}/${row.slot}`, row]));

for (const job of jobs) {
  const row = rows.get(`${job.family}/${job.slot}`);
  const face = faces[job.id];
  if (!row || row.reason !== undefined) {
    face.skipped.push({
      family: job.family,
      slot: job.slot,
      file: job.file,
      reason: row?.reason ?? 'no row',
    });
    continue;
  }
  face.cuts.push({
    family: job.family,
    slot: job.slot,
    weight: job.weight,
    italic: job.italic,
    band: job.band,
    opsz: job.opsz,
    source: job.source,
    decoded: job.decoded,
    file: job.file,
    bytes: row.bytes,
    sha256: row.sha256,
    glyphs: row.glyphs,
    ...(row.spacing ? { spacing: row.spacing } : {}),
  });
}

for (const [id, face] of Object.entries(faces)) {
  face.cuts.sort((a, b) => a.file.localeCompare(b.file));
  face.skipped.sort((a, b) => a.file.localeCompare(b.file));
  if (!CHECK && face.cuts.length > 0)
    copyFileSync(join(PACKAGE, 'assets', id, 'LICENSE'), join(OUT, id, 'LICENSE'));
}

if (CHECK) {
  const differences = [];
  for (const [id, face] of Object.entries(faces)) {
    const committed = previous?.faces?.[id];
    for (const cut of face.cuts) {
      const recorded = committed?.cuts?.find((c) => c.file === cut.file);
      const path = join(OUT, id, cut.file);
      const onDisk = existsSync(path)
        ? createHash('sha256').update(readFileSync(path)).digest('hex')
        : null;
      if (recorded?.sha256 !== cut.sha256 || onDisk !== cut.sha256)
        differences.push(
          `${id}/${cut.file}: rebuilt ${cut.sha256}, recorded ${recorded?.sha256}, on disk ${onDisk}`,
        );
    }
  }
  rmSync(out, { recursive: true, force: true });
  for (const line of differences) console.error(`build-export-cuts: ${line}`);
  console.log(
    `build-export-cuts: --check ${differences.length === 0 ? 'clean' : `${differences.length} difference(s)`} over ${jobs.length} cut(s) in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  process.exit(differences.length === 0 ? 0 : 1);
}

const manifest = {
  version: `catalog-export-${BUILD_VERSION}`,
  generatedBy: 'packages/fonts/scripts/build-export-cuts.mjs',
  fontTools: version.stdout.trim(),
  googleFontsCommit: GOOGLE_FONTS_COMMIT,
  weights: [...EXPORT_CUT_WEIGHTS],
  textOpsz: TEXT_OPSZ,
  displayOpsz: DISPLAY_OPSZ,
  displayFromPx: DISPLAY_FROM_PX,
  faces: { ...(ONLY.length > 0 ? (previous?.faces ?? {}) : {}), ...faces },
};
manifest.faces = Object.fromEntries(
  Object.entries(manifest.faces).sort(([a], [b]) => a.localeCompare(b)),
);
mkdirSync(OUT, { recursive: true });
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
const built = Object.values(faces).reduce((n, f) => n + f.cuts.length, 0);
const skipped = Object.values(faces).reduce((n, f) => n + f.skipped.length, 0);
const bytes = Object.values(faces).reduce((n, f) => n + f.cuts.reduce((m, c) => m + c.bytes, 0), 0);
const refused = Object.entries(faces).filter(([, f]) => f.refused !== null);
console.log(
  `build-export-cuts: ${built} cut(s), ${(bytes / (1024 * 1024)).toFixed(2)} MiB, ${skipped} skipped, ${refused.length} famil${refused.length === 1 ? 'y' : 'ies'} refused (${refused.map(([id]) => id).join(', ') || 'none'}) in ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
