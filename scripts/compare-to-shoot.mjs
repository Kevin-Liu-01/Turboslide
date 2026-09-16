#!/usr/bin/env node
// Pixel acceptance of the import (SPEC 9, last paragraph; MILESTONES M1 acceptance):
// every non-escape slide rendered through Turboslide must be within --max-mismatch of a fresh
// Prototemplate shoot-slide.mjs render of the same slide, at 1x, in both themes, on the same
// Chromium build, with pixelmatch at threshold 0.1.
//
//   node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render \
//     --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005 --skip-html-escapes
//
// Options: --themes light,dark   --slides 1,2,3 (1-based deck order; default all)
//          --threshold 0.1       --report <file.json>   --diff-dir <dir> (diff PNGs of failures)
//          --keep (leave the temp shoot directory in place)
//
// How the reference is produced: shoot-slide.mjs writes to <its own directory>/preview and
// hard-codes the Chrome for Testing binary and its playwright-core location, so the script is
// copied into a temp directory that symlinks parts/, slides/, fonts/ and shots/ from the deck,
// and run there with `all` (or the requested slide numbers). Its output is preview/sNN-<theme>.jpg
// at JPEG quality 82, which is one of the expected sources of residual mismatch.
//
// How the Turboslide render is located: <render>/render.json is the RenderRecord[] written by
// `turboslide render --json` (SPEC 4.2); the record for (slideId, theme) names its image. When no
// record matches, <render>/<nn>-<slideId>-<theme>.png is tried (the SPEC 7.2 naming).
// Slide numbers come from deck.json: sections[].slideIds flattened, n = index + 1 (SPEC 4.2:
// sections are the only place order lives).
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

import { escapeSlideIds } from './lib/import-report.mjs';

/** The default page; the deck's own `page` field replaces it once deck.json is read (gslides-parity SPEC-5 6.1; R08 3i). */
const DEFAULT_SHEET = { width: 1600, height: 900 };

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const deckDir = resolve(String(args.deck ?? 'decks/gt-brand'));
const renderDir = resolve(String(args.render ?? '.turboslide/render'));
const shootDir = resolve(
  String(
    args.shoot ??
      process.env.TURBOSLIDE_PROTOTEMPLATE_DECK ??
      '/Users/kevinliu/repos/Prototemplate/deck',
  ),
);
const maxMismatch = Number(args['max-mismatch'] ?? 0.005);
const threshold = Number(args.threshold ?? 0.1);
const skipEscapes = args['skip-html-escapes'] === true;
const themes = String(args.themes ?? 'light,dark')
  .split(',')
  .filter(Boolean);
const only = args.slides ? new Set(String(args.slides).split(',').map(Number)) : null;
const keep = args.keep === true;
const reportPath = args.report ? resolve(String(args.report)) : null;
const diffDir = args['diff-dir'] ? resolve(String(args['diff-dir'])) : null;

function fail(message) {
  console.error(`compare-to-shoot: ${message}`);
  process.exit(2);
}

for (const [label, dir] of [
  ['deck', deckDir],
  ['render', renderDir],
  ['shoot', shootDir],
]) {
  if (!existsSync(dir)) fail(`${label} directory missing: ${dir}`);
}
if (!existsSync(join(shootDir, 'shoot-slide.mjs'))) fail(`no shoot-slide.mjs in ${shootDir}`);

// 1. Deck order.
const deck = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8'));
if (!Array.isArray(deck.sections)) fail('deck.json has no sections array');
const order = deck.sections.flatMap((section) => section.slideIds ?? []);
if (order.length === 0) fail('deck.json lists no slides');
// the deck's page (schema render.ts deckPage): the GT deck carries none, so the numbers do not change
const SHEET =
  deck.page && Number.isFinite(deck.page.width) && Number.isFinite(deck.page.height)
    ? { width: deck.page.width, height: deck.page.height }
    : DEFAULT_SHEET;

// 2. Escape slides.
const escapes = new Set();
const reportFile = join(deckDir, 'import-report.json');
if (skipEscapes) {
  if (!existsSync(reportFile))
    console.error(
      `compare-to-shoot: --skip-html-escapes given but ${reportFile} is missing; nothing skipped`,
    );
  else
    for (const id of escapeSlideIds(JSON.parse(readFileSync(reportFile, 'utf8')))) escapes.add(id);
}

// 3. Turboslide renders.
const recordsFile = join(renderDir, 'render.json');
const records = existsSync(recordsFile) ? JSON.parse(readFileSync(recordsFile, 'utf8')) : [];
if (!existsSync(recordsFile))
  console.error(
    `compare-to-shoot: ${recordsFile} missing; falling back to <nn>-<slideId>-<theme>.png names`,
  );
const pad = (n) => String(n).padStart(2, '0');
function imageFor(n, slideId, theme) {
  const record = Array.isArray(records)
    ? records.find(
        (r) => r && r.slideId === slideId && r.theme === theme && typeof r.image === 'string',
      )
    : undefined;
  if (record) return isAbsolute(record.image) ? record.image : resolve(renderDir, record.image);
  const guess = join(renderDir, `${pad(n)}-${slideId}-${theme}.png`);
  return existsSync(guess) ? guess : null;
}

// 4. Fresh reference renders in a temp copy of the deck directory.
const wanted = order.map((_, i) => i + 1).filter((n) => !only || only.has(n));
if (wanted.length === 0) fail('no slides selected');
const tmp = mkdtempSync(join(tmpdir(), 'turboslide-shoot-'));
for (const name of ['parts', 'slides', 'fonts', 'shots']) {
  const target = join(shootDir, name);
  if (!existsSync(target)) fail(`${target} missing`);
  symlinkSync(target, join(tmp, name), 'dir');
}
// shoot-slide.mjs writes its assembled page into <dir>/tmp/, and the slides reference images as
// shots/<name>.jpg relative to that page, so the deck keeps a tmp/shots -> ../shots symlink.
// Without it every image is ERR_FILE_NOT_FOUND and the reference is blank where pictures should be.
mkdirSync(join(tmp, 'tmp'));
symlinkSync(join(shootDir, 'shots'), join(tmp, 'tmp', 'shots'), 'dir');
cpSync(join(shootDir, 'shoot-slide.mjs'), join(tmp, 'shoot-slide.mjs'));
const shootArgs = wanted.length === order.length ? ['all'] : wanted.map(String);
console.error(
  `compare-to-shoot: shooting ${wanted.length} slide(s) with ${shootDir}/shoot-slide.mjs in ${tmp}`,
);
const started = Date.now();
let shootOutput = '';
try {
  shootOutput = execFileSync(process.execPath, [join(tmp, 'shoot-slide.mjs'), ...shootArgs], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  });
} catch (error) {
  console.error(
    `compare-to-shoot: shoot-slide.mjs failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  if (!keep) rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
}
const shootLines = shootOutput.trim().split('\n').filter(Boolean);
for (const line of shootLines) {
  console.error(
    `  shoot: ${line.length > 300 ? `${line.slice(0, 300)}... (${line.length} chars)` : line}`,
  );
}
// shoot-slide.mjs ends its summary line with "no page errors" or "ERRORS [...]" (page errors and
// console errors in either theme). A reference with errors, missing images above all, is not a
// reference; the deck's own standard is zero, so the comparison stops here.
const shootSummary = shootLines.at(-1) ?? '';
if (!shootSummary.includes('no page errors')) {
  console.error(
    'compare-to-shoot: the reference render reported errors; the comparison is not meaningful',
  );
  if (!keep) rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
}
console.error(
  `compare-to-shoot: reference ready in ${((Date.now() - started) / 1000).toFixed(1)} s`,
);

// 5. Compare.
async function decode(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const rows = [];
if (diffDir) mkdirSync(diffDir, { recursive: true });
for (const n of wanted) {
  const slideId = order[n - 1];
  for (const theme of themes) {
    const row = { n, slideId, theme, mismatch: null, fraction: null, status: 'FAIL', note: '' };
    rows.push(row);
    const ref = join(tmp, 'preview', `s${pad(n)}-${theme}.jpg`);
    const got = imageFor(n, slideId, theme);
    if (!existsSync(ref)) {
      row.note = `reference missing: ${relative(tmp, ref)}`;
      continue;
    }
    if (!got || !existsSync(got)) {
      row.note = `turboslide render missing for ${slideId} ${theme}`;
      continue;
    }
    const a = await decode(ref);
    const b = await decode(got);
    if (a.width !== SHEET.width || a.height !== SHEET.height) {
      row.note = `reference is ${a.width}x${a.height}, expected ${SHEET.width}x${SHEET.height}`;
      continue;
    }
    if (b.width !== a.width || b.height !== a.height) {
      row.note = `render is ${b.width}x${b.height}, reference ${a.width}x${a.height} (compare at --scale 1)`;
      continue;
    }
    const diff = diffDir ? Buffer.alloc(a.width * a.height * 4) : null;
    const mismatch = pixelmatch(a.data, b.data, diff, a.width, a.height, { threshold });
    row.mismatch = mismatch;
    row.fraction = mismatch / (a.width * a.height);
    if (escapes.has(slideId)) {
      row.status = 'skip';
      row.note = 'html escape block (import-report.json)';
    } else if (row.fraction <= maxMismatch) {
      row.status = 'ok';
    } else {
      row.status = 'FAIL';
      row.note = `over ${(maxMismatch * 100).toFixed(2)} percent`;
      if (diff && diffDir) {
        const out = join(diffDir, `${pad(n)}-${slideId}-${theme}.diff.png`);
        await sharp(diff, { raw: { width: a.width, height: a.height, channels: 4 } })
          .png()
          .toFile(out);
        row.diff = out;
      }
    }
  }
}

// 6. Table and summary.
const pct = (f) => (f === null ? '   n/a' : `${(f * 100).toFixed(3).padStart(6)}%`);
const idWidth = Math.max(8, ...rows.map((r) => r.slideId.length));
console.log(`${'n'.padStart(3)}  ${'slide'.padEnd(idWidth)}  theme  mismatch  status  note`);
for (const r of rows) {
  console.log(
    `${String(r.n).padStart(3)}  ${r.slideId.padEnd(idWidth)}  ${r.theme.padEnd(5)}  ${pct(r.fraction)}  ${r.status.padEnd(6)}  ${r.note}`,
  );
}
const compared = rows.filter((r) => r.fraction !== null);
const failures = rows.filter((r) => r.status === 'FAIL');
const skipped = rows.filter((r) => r.status === 'skip');
const worst = compared.reduce(
  (m, r) => (r.status !== 'skip' && r.fraction > m ? r.fraction : m),
  0,
);
const mean = compared.length ? compared.reduce((s, r) => s + r.fraction, 0) / compared.length : 0;
console.log(
  `compare-to-shoot: ${rows.length} pairs, ${compared.length} compared, ${skipped.length} skipped as escapes, ${failures.length} over budget; worst non-escape ${(worst * 100).toFixed(3)} percent, mean ${(mean * 100).toFixed(3)} percent, threshold ${threshold}, budget ${(maxMismatch * 100).toFixed(2)} percent`,
);
if (reportPath) {
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  writeFileSync(
    reportPath,
    `${JSON.stringify({ deck: deckDir, render: renderDir, shoot: shootDir, threshold, maxMismatch, rows }, null, 2)}\n`,
  );
  console.error(`compare-to-shoot: wrote ${reportPath}`);
}
if (keep) console.error(`compare-to-shoot: kept ${tmp}`);
else rmSync(tmp, { recursive: true, force: true });
process.exit(failures.length > 0 ? 1 : 0);
