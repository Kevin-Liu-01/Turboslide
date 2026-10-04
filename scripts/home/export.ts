// The export band's loupe raster (docs/LANDING.md 2.12, 6.1; docs/gslides-parity/landing/build/v3.md
// R4). V3's build module: the entry's derivation (scripts/build-home-assets.ts, V1's line of V3#17)
// calls `deriveLoupe()`, serves its two rasters as the role `export-browser` and writes `loupe` into
// assets.json; the recording runs on its own, since it renders with the CLI:
//
//   node scripts/home/export.ts --record   the CLI's `render field --scale 2` of the page deck in
//                                          both appearances under a temporary folder; writes
//                                          apps/studio/home-deck/recorded-loupe/ (the two rasters as
//                                          lossless WebP and loupe.json)
//   node scripts/home/export.ts --check    re-derives loupe.json from the rasters and the served
//                                          Perfect pictures and compares it; exit 1 names the first
//                                          difference
//
// "Browser" is the CLI's render of slide 7 at scale 2, 3200 by 1800, the reference the exporter's
// `--verify` compares a flatten page with (docs/export-verification.md step 3), served as lossless
// WebP of its pixels, at most 60 KB each. "Perfect file" is the Perfect file's picture part, already
// served for the seam (`assets.json` role `export-perfect`). `loupe.json` holds the whole slide's
// count of differing pixels between the two, by pixelmatch's colour delta at threshold 0.1 (the
// page's copy in live/loupe.ts, pinned to pixelmatch by loupe.test.ts), so the page's windows sum
// to a figure the build read.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { MAX_DELTA, colorDelta } from '../../apps/studio/src/components/home/live/loupe-delta.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = 'apps/studio/home-deck';
const RECORDED = `${FIXTURE}/recorded`;
const OUT = `${FIXTURE}/recorded-loupe`;
const CLI = 'apps/cli/bin/turboslide.mjs';
const ASSETS_JSON = 'apps/studio/src/components/home/assets.json';
const PUBLIC_DIR = 'apps/studio/public/home';
/** Slide 7, the opener field's slide (LANDING.md 2.0). */
const SLIDE = 'field';
const SIZE = { width: 3200, height: 1800 };
const BUDGET = 60_000;
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

function fail(message: string): never {
  console.error(`home/export: ${message}`);
  process.exit(1);
}

const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

/** The page deck on disk: the fixture with the recorded slide 5 and sections (the entry's writePageDeck). */
function writePageDeck(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  cpSync(resolve(ROOT, FIXTURE), dir, {
    recursive: true,
    filter: (src) => !src.includes('/recorded') && !src.endsWith('/.turboslide'),
  });
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Record<string, unknown>;
  deck['sections'] = JSON.parse(
    readFileSync(resolve(ROOT, RECORDED, 'page-deck-sections.json'), 'utf8'),
  );
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(deck, null, 2)}\n`);
  writeFileSync(
    join(dir, 'slides', 'next-steps.json'),
    readFileSync(resolve(ROOT, RECORDED, 'next-steps-filled.json')),
  );
}

/** sha256 over the page deck as written (every file but the versions, in path order). */
function deckSha(dir: string): string {
  const hash = createHash('sha256');
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      if (name === 'versions' || name.startsWith('.')) continue;
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        hash.update(path.slice(dir.length));
        hash.update('\0');
        hash.update(readFileSync(path));
        hash.update('\0');
      }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

export type LoupeRecord = {
  generator: string;
  /** the page deck the raster was rendered from */
  pageDeckSha256: string;
  /** the CLI's render line: the browser it rendered with */
  renderer: string;
  rasters: Record<Theme, { file: string; bytes: number; sha256: string; pixelsSha256: string }>;
  /** the whole slide's differing pixels against the Perfect picture of the same appearance */
  loupe: Record<
    Theme,
    { differing: number; total: number; perfect: string; where: [number, number][] }
  >;
};

async function pixels(
  bytes: Uint8Array,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/** The Perfect picture of each appearance as `assets.json` serves it. */
function perfectFile(theme: Theme): string {
  const assets = (
    JSON.parse(readFileSync(resolve(ROOT, ASSETS_JSON), 'utf8')) as {
      assets: { role: string; appearance: string | null; path: string }[];
    }
  ).assets;
  const found = assets.find((a) => a.role === 'export-perfect' && a.appearance === theme);
  if (found === undefined) fail(`assets.json has no export-perfect for ${theme}`);
  return resolve(ROOT, PUBLIC_DIR, found.path.replace(/^\/home\//, ''));
}

/** The whole slide's count of differing pixels between a raster and the served Perfect picture. */
async function countAgainstPerfect(
  raster: Uint8Array,
  theme: Theme,
): Promise<{ differing: number; total: number; perfect: string; where: [number, number][] }> {
  const file = perfectFile(theme);
  if (!existsSync(file)) fail(`${file} is missing; run the entry's --export`);
  const [a, b] = await Promise.all([pixels(raster), pixels(new Uint8Array(readFileSync(file)))]);
  if (a.width !== b.width || a.height !== b.height)
    fail(
      `the browser raster is ${a.width} by ${a.height}, the Perfect picture ${b.width} by ${b.height}`,
    );
  /* the count, and the first 32 differing pixels by place, so a driver can hold the loupe on one */
  let differing = 0;
  const where: [number, number][] = [];
  for (let k = 0; k < a.data.length; k += 4)
    if (colorDelta(a.data, k, b.data, k) > MAX_DELTA) {
      differing += 1;
      if (where.length < 32) where.push([(k / 4) % a.width, Math.floor(k / 4 / a.width)]);
    }
  return { differing, total: a.width * a.height, perfect: sha256(readFileSync(file)), where };
}

/** The CLI's render of slide 7 in both appearances; writes the rasters and loupe.json. */
export async function recordLoupe(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'turboslide-home-loupe-'));
  try {
    const deck = join(work, 'deck');
    writePageDeck(deck);
    const sha = deckSha(deck);
    const out = join(work, 'render');
    const result = spawnSync(
      process.execPath,
      [resolve(ROOT, CLI), 'render', SLIDE, '--theme', 'light,dark', '--scale', '2', '--out', out],
      { cwd: deck, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300_000 },
    );
    if (result.status !== 0)
      fail(`turboslide render ${SLIDE} failed: ${result.stdout}\n${result.stderr}`);
    const renderer =
      /with (.+)$/m.exec(result.stdout ?? '')?.[1]?.replace(/,.*$/, '') ?? 'the CLI render';
    const dir = resolve(ROOT, OUT);
    mkdirSync(dir, { recursive: true });
    const record: LoupeRecord = {
      generator: 'scripts/home/export.ts --record',
      pageDeckSha256: sha,
      renderer,
      rasters: {} as LoupeRecord['rasters'],
      loupe: {} as LoupeRecord['loupe'],
    };
    for (const theme of THEMES) {
      const png = readFileSync(join(out, `07-${SLIDE}-${theme}@2x.png`));
      const meta = await sharp(png).metadata();
      if (meta.width !== SIZE.width || meta.height !== SIZE.height)
        fail(
          `the ${theme} render is ${meta.width} by ${meta.height}, not ${SIZE.width} by ${SIZE.height}`,
        );
      const webp = new Uint8Array(await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer());
      /* lossless: the WebP decodes to the render's pixels */
      const [p1, p2] = await Promise.all([pixels(new Uint8Array(png)), pixels(webp)]);
      if (sha256(p1.data) !== sha256(p2.data)) fail(`the ${theme} WebP is not the render's pixels`);
      if (webp.length > BUDGET) fail(`the ${theme} raster is ${webp.length} B, over ${BUDGET}`);
      const file = `browser-${theme}.webp`;
      writeFileSync(join(dir, file), webp);
      record.rasters[theme] = {
        file,
        bytes: webp.length,
        sha256: sha256(webp),
        pixelsSha256: sha256(p2.data),
      };
      record.loupe[theme] = await countAgainstPerfect(webp, theme);
    }
    writeFileSync(join(dir, 'loupe.json'), `${JSON.stringify(record, null, 2)}\n`);
    console.log(
      `home/export --record: slide 7 at 3200 by 1800 in both appearances (${THEMES.map((t) => `${t} ${record.rasters[t].bytes} B, ${record.loupe[t].differing} of ${record.loupe[t].total} differ`).join('; ')})`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The role `export-browser` for the entry's `assets.json`, and the loupe's whole slide counts. */
export async function deriveLoupe(): Promise<{
  files: { role: 'export-browser'; appearance: Theme; bytes: Uint8Array }[];
  loupe: Record<Theme, { differing: number; total: number }>;
}> {
  const path = resolve(ROOT, OUT, 'loupe.json');
  if (!existsSync(path)) fail(`${OUT}/loupe.json is missing; run --record`);
  const record = JSON.parse(readFileSync(path, 'utf8')) as LoupeRecord;
  const files = [];
  const loupe = {} as Record<Theme, { differing: number; total: number }>;
  for (const theme of THEMES) {
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, OUT, record.rasters[theme].file)));
    if (sha256(bytes) !== record.rasters[theme].sha256)
      fail(`${OUT}/${record.rasters[theme].file} differs from loupe.json`);
    const counted = await countAgainstPerfect(bytes, theme);
    if (counted.perfect !== record.loupe[theme].perfect)
      fail(`the ${theme} Perfect picture changed since --record; run --record`);
    if (counted.differing !== record.loupe[theme].differing)
      fail(
        `the ${theme} count reads ${counted.differing}, loupe.json ${record.loupe[theme].differing}`,
      );
    files.push({ role: 'export-browser' as const, appearance: theme, bytes });
    loupe[theme] = { differing: counted.differing, total: counted.total };
  }
  return { files, loupe };
}

async function main(argv: string[]): Promise<void> {
  const mode = argv[0];
  if (mode === '--record') await recordLoupe();
  else if (mode !== '--check') fail('name a mode: --record or --check');
  const { loupe } = await deriveLoupe();
  console.log(
    `home/export --check: ${THEMES.map((t) => `${t} ${loupe[t].differing} of ${loupe[t].total} pixels differ`).join('; ')}`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
