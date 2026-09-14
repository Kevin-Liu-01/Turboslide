// The /home page's pictures (gslides-parity SPEC-4 0.24, 0.28, 2.4; MILESTONES-4 B2 item 2): the
// fifteen README screenshots of docs/readme and the one continuous liquid metal frame of the
// dither proposal (design-4/dither/assets/hero-frame-continuous.jpg, the pipeline band's first
// cell) copied to apps/studio/public/home/<name>-<hash>.jpg under content hashed names, each with
// a 720 px and a 1440 px wide variant (sharp, JPEG quality 82; a source narrower than a variant
// width gets no such variant), and apps/studio/src/components/home/shots.json written with the
// path, the width, the height and the byte count of every variant so every <img> on the page
// carries width, height, srcset and sizes and the image bytes rows of SPEC-4 4.7 are met by the
// browser picking the small variant for a card. A route cannot read docs/ (R05 section 10), which
// is why the copies exist; the hashed names let vite.deploy.config.ts serve /home/** as immutable
// for a year (SPEC-4 1.6). The build also copies the counts of packages/theme/brand/facts.json
// (B1's, SPEC-4 0.25) into apps/studio/src/components/home/facts-data.ts, see FACTS_MODULE_PATH.
//
// Run from the repository root with Node 24 (type stripping, no build step):
//   node scripts/build-home-assets.ts            writes the folder and the manifest
//   node scripts/build-home-assets.ts --check    asserts the folder equals the manifest
//
// `--check` reads shots.json and asserts every variant exists at its byte count and sha256, decodes
// to its recorded width and height, that the folder holds no file the manifest does not name, and
// that every source file still hashes as the manifest recorded, so a re-shot README picture fails
// the check until the folder is rebuilt. It compares by the recorded bytes and by decoded size
// rather than by re-encoding, because a JPEG encoder's bytes differ across libvips builds while
// the committed files are the contract. Exit 1 names the first path that differs.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const README_DIR = 'docs/readme';
const FRAME_SOURCE = 'docs/gslides-parity/design-4/dither/assets/hero-frame-continuous.jpg';
const FRAME_NAME = 'hero-frame';
const PUBLIC_DIR = 'apps/studio/public/home';
const URL_PREFIX = '/home';
const MANIFEST_PATH = 'apps/studio/src/components/home/shots.json';
/**
 * The manifest's typed twin the page imports (`Shot.tsx`): the studio's tsconfig lists its
 * sources by folder, which under `composite` does not reach a JSON file (TS6307), so the build
 * writes the same records as a TypeScript module beside the JSON and `--check` asserts the two
 * agree. Nobody edits either by hand.
 */
const MODULE_PATH = 'apps/studio/src/components/home/shots.ts';
/**
 * The counts the page states (SPEC-4 0.25) come from B1's `packages/theme/brand/facts.json`,
 * which also carries 141 measured rows the page does not read; a client import of the whole file
 * would put about 120 KB into the page's JavaScript (measured on the dev server). The build
 * copies the eight counts, the mismatch figure and the licence into a small typed module beside
 * the page, records the facts file's sha256 in it, and `--check` fails when the facts file has
 * moved on, so the copy is never stale and facts.json stays the one source.
 */
const FACTS_PATH = 'packages/theme/brand/facts.json';
const FACTS_MODULE_PATH = 'apps/studio/src/components/home/facts-data.ts';
const COUNT_KEYS = [
  'actions',
  'mcpTools',
  'httpPaths',
  'layouts',
  'shapePresets',
  'materials',
  'checkSteps',
  'parityRows',
] as const;
/** The variant widths beside the source's own width (SPEC-4 2.4 names the 720). */
const VARIANT_WIDTHS = [720, 1440] as const;
const JPEG_QUALITY = 82;
/** The README shots the page shows, all fifteen (SPEC-4 0.24). */
const README_COUNT = 15;

export type ShotVariant = {
  /** the served path under the studio's public folder */
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

export type ShotRecord = {
  /** the file stem of docs/readme, or `hero-frame` */
  name: string;
  /** the repository path the copies were made from */
  source: string;
  sourceSha256: string;
  /** the source's own size */
  width: number;
  height: number;
  /** the source copy first, then the narrower variants, widest first */
  variants: ShotVariant[];
};

export type ShotsManifest = {
  generatedBy: string;
  quality: number;
  shots: ShotRecord[];
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message: string): never {
  console.error(`build-home-assets: ${message}`);
  process.exit(1);
}

type Source = { name: string; path: string };

function sources(): Source[] {
  const readme = readdirSync(resolve(ROOT, README_DIR))
    .filter((file) => file.endsWith('.jpg'))
    .sort()
    .map((file) => ({ name: file.replace(/\.jpg$/, ''), path: `${README_DIR}/${file}` }));
  if (readme.length !== README_COUNT)
    fail(`${README_DIR} holds ${readme.length} JPEGs, the page shows ${README_COUNT}`);
  if (!existsSync(resolve(ROOT, FRAME_SOURCE))) fail(`${FRAME_SOURCE} is missing`);
  return [...readme, { name: FRAME_NAME, path: FRAME_SOURCE }];
}

type Output = { path: string; bytes: Uint8Array };

async function build(): Promise<{ manifest: ShotsManifest; outputs: Output[] }> {
  const outputs: Output[] = [];
  const shots: ShotRecord[] = [];
  for (const source of sources()) {
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, source.path)));
    const meta = await sharp(bytes).metadata();
    const width = meta.width;
    const height = meta.height;
    if (width === undefined || height === undefined) fail(`${source.path}: no size`);
    const variants: ShotVariant[] = [];
    const record = (label: string, variantBytes: Uint8Array, w: number, h: number): void => {
      const digest = sha256(variantBytes);
      const file = `${source.name}${label}-${digest.slice(0, 10)}.jpg`;
      outputs.push({ path: `${PUBLIC_DIR}/${file}`, bytes: variantBytes });
      variants.push({
        path: `${URL_PREFIX}/${file}`,
        width: w,
        height: h,
        bytes: variantBytes.length,
        sha256: digest,
      });
    };
    /* the source copy, bytes unchanged, so the 2x shot stays available to a dense display */
    record('', bytes, width, height);
    for (const target of [...VARIANT_WIDTHS].sort((a, b) => b - a)) {
      if (target >= width) continue;
      const resized = await sharp(bytes)
        .resize({ width: target, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      record(`-${target}`, new Uint8Array(resized.data), resized.info.width, resized.info.height);
    }
    shots.push({
      name: source.name,
      source: source.path,
      sourceSha256: sha256(bytes),
      width,
      height,
      variants,
    });
  }
  return {
    manifest: { generatedBy: 'scripts/build-home-assets.ts', quality: JPEG_QUALITY, shots },
    outputs,
  };
}

function readManifest(): ShotsManifest {
  const file = resolve(ROOT, MANIFEST_PATH);
  if (!existsSync(file)) fail(`${MANIFEST_PATH} is missing; run node scripts/build-home-assets.ts`);
  return JSON.parse(readFileSync(file, 'utf8')) as ShotsManifest;
}

/** The TypeScript twin of the manifest, generated beside it. */
function moduleSource(manifest: ShotsManifest): string {
  return [
    '// Generated by scripts/build-home-assets.ts from shots.json; do not edit by hand. The',
    '// pictures of the /home page with their variants (gslides-parity SPEC-4 2.4): the same records',
    '// as shots.json, as a module the studio project can import (its tsconfig reaches no JSON file).',
    'export type ShotVariant = { path: string; width: number; height: number; bytes: number; sha256: string };',
    'export type ShotRecord = {',
    '  name: string;',
    '  source: string;',
    '  sourceSha256: string;',
    '  width: number;',
    '  height: number;',
    '  variants: ShotVariant[];',
    '};',
    'export type ShotsManifest = { generatedBy: string; quality: number; shots: ShotRecord[] };',
    '',
    `export const SHOTS_MANIFEST: ShotsManifest = ${JSON.stringify(manifest, null, 2)};`,
    '',
  ].join('\n');
}

type FactsData = {
  factsSha256: string;
  actions: number;
  mcpTools: number;
  httpPaths: number;
  layouts: number;
  shapePresets: number;
  materials: number;
  checkSteps: number;
  parityRows: number;
  mismatchPercent: number;
  licence: string;
};

/** A count as B1 writes it (`{ count }`, `{ total }` for the audit) or as a bare number. */
function countOf(value: unknown, key: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const record = (value ?? {}) as { count?: unknown; total?: unknown };
  const n = typeof record.count === 'number' ? record.count : record.total;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0)
    fail(`${FACTS_PATH}: ${key} is not a positive integer count`);
  return n;
}

/** The facts the page needs, read from B1's file; absent means the build cannot run. */
function factsData(): FactsData {
  const file = resolve(ROOT, FACTS_PATH);
  if (!existsSync(file)) fail(`${FACTS_PATH} is missing (B1, scripts/build-brand.ts --facts)`);
  const bytes = new Uint8Array(readFileSync(file));
  const facts = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  const counts = Object.fromEntries(
    COUNT_KEYS.map((key) => [key, countOf(facts[key], key)]),
  ) as Record<(typeof COUNT_KEYS)[number], number>;
  const mismatch = (facts.export as { worstPageMismatchPercent?: unknown } | undefined)
    ?.worstPageMismatchPercent;
  const licence = (facts.licence as { name?: unknown } | undefined)?.name;
  if (typeof mismatch !== 'number' || mismatch <= 0)
    fail(`${FACTS_PATH}: export.worstPageMismatchPercent is not a positive number`);
  if (typeof licence !== 'string' || licence === '') fail(`${FACTS_PATH}: licence.name is missing`);
  return { factsSha256: sha256(bytes), ...counts, mismatchPercent: mismatch, licence };
}

function factsModuleSource(data: FactsData): string {
  return [
    '// Generated by scripts/build-home-assets.ts from packages/theme/brand/facts.json; do not edit',
    '// by hand. The counts the /home page states (gslides-parity SPEC-4 0.25), copied from the facts',
    "// file B1's build writes so the page's JavaScript carries ten values and not the file's 141",
    '// measured rows; `--check` fails when facts.json has changed since this copy (its sha256 is',
    '// recorded here).',
    `export const FACTS_DATA = ${JSON.stringify(data, null, 2)} as const;`,
    '',
  ].join('\n');
}

async function check(): Promise<void> {
  const manifest = readManifest();
  if (manifest.shots.length !== README_COUNT + 1)
    fail(`${MANIFEST_PATH} records ${manifest.shots.length} pictures, not ${README_COUNT + 1}`);
  const named = new Set<string>();
  let files = 0;
  for (const shot of manifest.shots) {
    const source = resolve(ROOT, shot.source);
    if (!existsSync(source)) fail(`${shot.source} is missing`);
    const sourceDigest = sha256(new Uint8Array(readFileSync(source)));
    if (sourceDigest !== shot.sourceSha256)
      fail(`${shot.source} changed since the folder was built (sha256 ${sourceDigest}); rebuild`);
    if (shot.variants.length === 0) fail(`${shot.name}: no variant recorded`);
    for (const variant of shot.variants) {
      if (!variant.path.startsWith(`${URL_PREFIX}/`))
        fail(`${variant.path}: not under ${URL_PREFIX}/`);
      const file = resolve(ROOT, PUBLIC_DIR, variant.path.slice(URL_PREFIX.length + 1));
      if (!existsSync(file)) fail(`${variant.path}: the file is missing under ${PUBLIC_DIR}`);
      const bytes = new Uint8Array(readFileSync(file));
      if (bytes.length !== variant.bytes)
        fail(`${variant.path}: ${bytes.length} bytes, the manifest says ${variant.bytes}`);
      const digest = sha256(bytes);
      if (digest !== variant.sha256)
        fail(`${variant.path}: sha256 ${digest}, the manifest says ${variant.sha256}`);
      const meta = await sharp(bytes).metadata();
      if (meta.width !== variant.width || meta.height !== variant.height)
        fail(
          `${variant.path}: decodes to ${meta.width} by ${meta.height}, the manifest says ${variant.width} by ${variant.height}`,
        );
      if (meta.format !== 'jpeg') fail(`${variant.path}: ${meta.format}, not a JPEG`);
      named.add(variant.path.slice(URL_PREFIX.length + 1));
      files += 1;
    }
    const widest = shot.variants[0];
    if (widest === undefined || widest.width !== shot.width || widest.height !== shot.height)
      fail(`${shot.name}: the first variant is not the source copy`);
  }
  const present = readdirSync(resolve(ROOT, PUBLIC_DIR)).filter((f) => !f.startsWith('.'));
  for (const file of present)
    if (!named.has(file)) fail(`${PUBLIC_DIR}/${file} is not in ${MANIFEST_PATH}; rebuild`);
  const moduleFile = resolve(ROOT, MODULE_PATH);
  if (!existsSync(moduleFile)) fail(`${MODULE_PATH} is missing; rebuild`);
  /* the module is compared as data (Prettier owns its formatting, check step 19) */
  const loaded = (await import(pathToFileURL(moduleFile).href)) as {
    SHOTS_MANIFEST?: ShotsManifest;
  };
  if (JSON.stringify(loaded.SHOTS_MANIFEST) !== JSON.stringify(manifest))
    fail(`${MODULE_PATH} does not match ${MANIFEST_PATH}; rebuild`);
  const factsFile = resolve(ROOT, FACTS_MODULE_PATH);
  if (!existsSync(factsFile)) fail(`${FACTS_MODULE_PATH} is missing; rebuild`);
  const loadedFacts = (await import(pathToFileURL(factsFile).href)) as { FACTS_DATA?: FactsData };
  const wanted = factsData();
  if (JSON.stringify(loadedFacts.FACTS_DATA) !== JSON.stringify(wanted))
    fail(
      `${FACTS_MODULE_PATH} does not match ${FACTS_PATH} (sha256 ${wanted.factsSha256}); rebuild`,
    );
  console.log(
    `build-home-assets --check: ${files} files of ${manifest.shots.length} pictures match ${MANIFEST_PATH}, ${MODULE_PATH} and their sources; ${FACTS_MODULE_PATH} matches ${FACTS_PATH}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    await check();
    return;
  }
  const { manifest, outputs } = await build();
  const dir = resolve(ROOT, PUBLIC_DIR);
  mkdirSync(dir, { recursive: true });
  const keep = new Set(outputs.map((o) => o.path.slice(`${PUBLIC_DIR}/`.length)));
  for (const file of readdirSync(dir)) if (!keep.has(file)) rmSync(join(dir, file));
  for (const output of outputs) writeFileSync(resolve(ROOT, output.path), output.bytes);
  writeFileSync(resolve(ROOT, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(ROOT, MODULE_PATH), moduleSource(manifest));
  writeFileSync(resolve(ROOT, FACTS_MODULE_PATH), factsModuleSource(factsData()));
  /* the generated modules in the repository's own style, so the format gate reads them as any other file */
  const prettier = spawnSync(
    resolve(ROOT, 'node_modules/.bin/prettier'),
    ['--write', '--log-level', 'warn', MODULE_PATH, FACTS_MODULE_PATH],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (prettier.status !== 0) fail(`prettier --write exited ${prettier.status}`);
  const total = outputs.reduce((sum, o) => sum + o.bytes.length, 0);
  for (const output of outputs) console.log(`${output.path} ${output.bytes.length} bytes`);
  console.log(
    `${outputs.length} files, ${total} bytes under ${PUBLIC_DIR}; ${MANIFEST_PATH}, ${MODULE_PATH} and ${FACTS_MODULE_PATH} written`,
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
