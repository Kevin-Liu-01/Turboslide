#!/usr/bin/env node
// The conversion fidelity gate (gslides-parity SPEC-2 1.4, 11.1 step 24, decision 0.95): every
// slide of the named decks that is not a canvas yet is rendered, measured with the one measurer
// (`measureCanvas` of @turboslide/headless over `measureCanvasBoxes` of @turboslide/render, on a
// 1x sheet page with prompts drawn, the path the CLI's `slide to-canvas` takes), converted through
// `toCanvas` of @turboslide/schema/canvas, rendered again as a canvas, and the two renders are
// compared pixel for pixel with the comparator of compare-to-shoot.mjs (pixelmatch at threshold
// 0.1), both rendered with the prompts drawn as the editor draws them. The measurement, the
// conversion and the comparison run once per theme: the script measures in the theme it compares
// (AGENTS.md), because the five GT code panel slides measure one pixel differently between the
// themes (build-2/b2.md decision R3), and a light measurement compared in dark carries that pixel
// into every dark pair of those slides. A slide whose canvas differs from its grammar render by
// more than --max-mismatch of the sheet's pixels fails the run; the diff PNGs of every failure
// land under --out. This is the proof that the conversion is lossless in pixels as well as in
// positions, and what makes the CSS repetition of a plate's rules under `.free` a tested change.
//
//   node scripts/canvas-fidelity.mjs --deck decks/gt-brand --deck decks/templates/gt-brand \
//     --deck decks/templates/blank --max-mismatch 0.005
//
// Options: --themes light,dark   --slides a,b (slide ids; default every non canvas slide)
//          --threshold 0.1       --out .turboslide/canvas-fidelity   --report <file.json>
//          --keep-renders (leave every render PNG in place, not only the failures' diffs)
//          --exact (the objects at the measured boxes, not the pixel the conversion rounds to)
//
// Runs the TypeScript sources through Node 24's type stripping the way apps/cli/bin/turboslide.mjs
// does; one browser, one sheet page per theme for the measure document and both renders (AGENTS.md).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

import { renderDeck } from '../packages/render/src/deck.ts';
import { loadThemeBundle } from '../packages/render/src/theme-node.ts';
import { toCanvas } from '../packages/schema/src/canvas.ts';
import { isCanvasSlide, slideOrder } from '../packages/schema/src/deck.ts';
import { openSheetPage } from '../packages/headless/src/context.ts';
import { fileUrl, writeTempDocument } from '../packages/headless/src/document.ts';
import { launchBrowser } from '../packages/headless/src/launch.ts';
import { measureCanvas } from '../packages/headless/src/measure.ts';
import { waitForReady } from '../packages/headless/src/ready.ts';
import { screenshotSheet } from '../packages/headless/src/screenshot.ts';

const SHEET = { width: 1600, height: 900 };
const READY = 'html[data-ts-ready="1"]';

function parseArgs(argv) {
  const out = { deck: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? true : next;
    if (value !== true) i += 1;
    if (key === 'deck') out.deck.push(String(value));
    else out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const decks = args.deck.length > 0 ? args.deck : ['decks/gt-brand'];
const maxMismatch = Number(args['max-mismatch'] ?? 0.005);
const threshold = Number(args.threshold ?? 0.1);
const themes = String(args.themes ?? 'light,dark')
  .split(',')
  .filter(Boolean);
const only = args.slides ? new Set(String(args.slides).split(',')) : null;
const outDir = resolve(String(args.out ?? '.turboslide/canvas-fidelity'));
const reportPath = args.report ? resolve(String(args.report)) : null;
const keepRenders = args['keep-renders'] === true;
// --exact writes the objects at the boxes the measurer returned (1/64 px) instead of the pixel
// the conversion rounds them to: what the conversion produces once schema/canvas.ts `boxPos`
// keeps the measured value (docs/gslides-parity/build-2/b2.md); --precision N rounds the
// measurement to N steps per pixel first (the experiment the request rests on)
const exact = args.exact === true || args.precision !== undefined;
const precision = args.precision !== undefined ? Number(args.precision) : 64;

function fail(message) {
  console.error(`canvas-fidelity: ${message}`);
  process.exit(2);
}

function loadDeck(dir) {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8'));
  const slides = {};
  for (const file of readdirSync(join(dir, 'slides'))) {
    if (!file.endsWith('.json')) continue;
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(dir, 'slides', file), 'utf8'),
    );
  }
  return { deck, slides };
}

async function decode(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function showSlide(page, url, slideId) {
  const hash = `s/${encodeURIComponent(slideId)}`;
  if (page.url().split('#')[0] === url) {
    await page.evaluate((h) => {
      document.documentElement.removeAttribute('data-ts-ready');
      location.hash = h;
    }, hash);
  } else {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
  }
  await page.waitForSelector(READY, { state: 'attached', timeout: 20_000 });
  await waitForReady(page);
}

mkdirSync(outDir, { recursive: true });
const bundle = loadThemeBundle();
const rows = [];
const started = Date.now();
let converted = 0;
const launched = await launchBrowser();
const tmp = await mkdtemp(join(tmpdir(), 'turboslide-canvas-fidelity-'));
try {
  for (const deckArg of decks) {
    const dir = resolve(deckArg);
    if (!existsSync(join(dir, 'deck.json'))) fail(`no deck.json in ${dir}`);
    const { deck, slides } = loadDeck(dir);
    const order = slideOrder(deck);
    const candidates = order.filter((id) => {
      const slide = slides[id];
      if (!slide || isCanvasSlide(slide)) return false;
      return !only || only.has(id);
    });
    if (candidates.length === 0) {
      console.error(`canvas-fidelity: ${basename(dir)}: no slide to convert`);
      continue;
    }
    const assetBase = fileUrl(dir, true);
    const all = Object.values(slides);
    for (const theme of themes) {
      // 1. the measurement in the theme this pass compares (AGENTS.md's contract for this
      //    script), on a 1x sheet page with the prompts drawn, the way the CLI's `slide to-canvas`
      //    measures; the CLI itself measures in light, and decision R3 (build-2/b2.md) records the
      //    pixel a light conversion carries into the dark render of the five GT code panel slides,
      //    which is why the gate measures once per theme rather than once for both
      const measureDoc = renderDeck(deck, all, {
        theme,
        bundle,
        chrome: true,
        assetBase,
        blockAttrs: true,
        gtWord: true,
        prompts: true,
        present: true,
        slideIds: candidates,
        title: `${deck.title} (${theme}, measure)`,
      });
      for (const w of measureDoc.warnings) console.error(`  render warning [${theme}]: ${w}`);
      const measureFile = await writeTempDocument(
        measureDoc.html,
        `${basename(dir)}-${theme}-measure.html`,
        tmp,
      );
      const sheetPage = await openSheetPage(launched.browser, { theme, scale: 1 });
      const renderDir = join(outDir, basename(dir), theme);
      mkdirSync(renderDir, { recursive: true });
      try {
        const boxes = new Map();
        for (const id of candidates) {
          await showSlide(sheetPage.page, measureFile.url, id);
          boxes.set(id, await measureCanvas(sheetPage.page, precision));
        }
        // 2. the conversion over this theme's boxes
        const canvasSlides = { ...slides };
        const unplaced = [];
        for (const id of candidates) {
          const result = toCanvas(slides[id], boxes.get(id));
          if (!result) continue;
          if (exact) {
            // the conversion rounds to the pixel; put the measured boxes back on the objects
            const measured = boxes.get(id);
            for (const block of result.slide.slots.main ?? []) {
              const raw =
                block.type === 'picture'
                  ? undefined
                  : (measured.blocks[block.id] ??
                    (block.id === 'plate'
                      ? measured.plate
                      : block.id === 'mark'
                        ? measured.mark
                        : undefined));
              if (raw && block.pos)
                block.pos = { ...block.pos, x: raw[0], y: raw[1], w: raw[2], h: raw[3] };
            }
          }
          canvasSlides[id] = result.slide;
          if (result.unplaced.length > 0) unplaced.push(`${id}: ${result.unplaced.join(', ')}`);
          // one count per slide: the first theme's pass
          if (theme === themes[0]) converted += 1;
        }
        for (const line of unplaced)
          console.error(`  unplaced (no measured box) [${theme}]: ${line}`);
        // 3. both renders in this theme with the prompts drawn (the editor's view, where a person
        //    sees both forms; an empty placeholder is the one place the two forms differ outside
        //    the editor by design, since the conversion keeps the prompt's box, SPEC-2 0.97), the
        //    same counter
        const grammarDoc = renderDeck(deck, all, {
          theme,
          bundle,
          chrome: true,
          assetBase,
          blockAttrs: true,
          gtWord: true,
          prompts: true,
          present: true,
          slideIds: candidates,
          title: `${deck.title} (${theme}, grammar)`,
        });
        const canvasDoc = renderDeck(deck, Object.values(canvasSlides), {
          theme,
          bundle,
          chrome: true,
          assetBase,
          blockAttrs: true,
          gtWord: true,
          prompts: true,
          present: true,
          slideIds: candidates,
          title: `${deck.title} (${theme}, canvas)`,
        });
        for (const w of canvasDoc.warnings)
          console.error(`  canvas render warning [${theme}]: ${w}`);
        const grammarFile = await writeTempDocument(
          grammarDoc.html,
          `${basename(dir)}-${theme}-grammar.html`,
          tmp,
        );
        const canvasFile = await writeTempDocument(
          canvasDoc.html,
          `${basename(dir)}-${theme}-canvas.html`,
          tmp,
        );
        // every grammar render first, then every canvas render: one navigation per document
        for (const id of candidates) {
          await showSlide(sheetPage.page, grammarFile.url, id);
          await screenshotSheet(sheetPage.page, join(renderDir, `${id}.grammar.png`), [
            0,
            0,
            SHEET.width,
            SHEET.height,
          ]);
        }
        for (const id of candidates) {
          await showSlide(sheetPage.page, canvasFile.url, id);
          await screenshotSheet(sheetPage.page, join(renderDir, `${id}.canvas.png`), [
            0,
            0,
            SHEET.width,
            SHEET.height,
          ]);
        }
      } finally {
        await sheetPage.close();
      }
      for (const id of candidates) {
        const a = await decode(join(renderDir, `${id}.grammar.png`));
        const b = await decode(join(renderDir, `${id}.canvas.png`));
        const diff = Buffer.alloc(a.width * a.height * 4);
        const mismatch = pixelmatch(a.data, b.data, diff, a.width, a.height, { threshold });
        const fraction = mismatch / (a.width * a.height);
        const row = {
          deck: basename(dir),
          slideId: id,
          kind: slides[id].kind,
          theme,
          mismatch,
          fraction,
          status: fraction <= maxMismatch ? 'ok' : 'FAIL',
        };
        if (row.status === 'FAIL') {
          const diffPath = join(renderDir, `${id}.diff.png`);
          await sharp(diff, { raw: { width: a.width, height: a.height, channels: 4 } })
            .png()
            .toFile(diffPath);
          row.diff = diffPath;
        } else if (!keepRenders) {
          rmSync(join(renderDir, `${id}.grammar.png`), { force: true });
          rmSync(join(renderDir, `${id}.canvas.png`), { force: true });
        }
        rows.push(row);
      }
    }
  }
} finally {
  await launched.close();
  rmSync(tmp, { recursive: true, force: true });
}

const pct = (f) => `${(f * 100).toFixed(3).padStart(6)}%`;
const idWidth = Math.max(8, ...rows.map((r) => r.slideId.length));
console.log(`${'deck'.padEnd(12)}  ${'slide'.padEnd(idWidth)}  kind       theme  mismatch  status`);
for (const r of rows)
  console.log(
    `${r.deck.padEnd(12)}  ${r.slideId.padEnd(idWidth)}  ${r.kind.padEnd(9)}  ${r.theme.padEnd(5)}  ${pct(r.fraction)}  ${r.status}${r.diff ? `  ${r.diff}` : ''}`,
  );
const failures = rows.filter((r) => r.status === 'FAIL');
const worst = rows.reduce((m, r) => (r.fraction > m.fraction ? r : m), { fraction: 0 });
const mean = rows.length ? rows.reduce((s, r) => s + r.fraction, 0) / rows.length : 0;
console.log(
  `canvas-fidelity: ${converted} slide(s) converted, ${rows.length} pairs compared, ${failures.length} over budget; worst ${(worst.fraction * 100).toFixed(3)} percent${worst.slideId ? ` (${worst.deck}/${worst.slideId} ${worst.theme})` : ''}, mean ${(mean * 100).toFixed(3)} percent, threshold ${threshold}, budget ${(maxMismatch * 100).toFixed(2)} percent, ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
if (reportPath) {
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  writeFileSync(
    reportPath,
    `${JSON.stringify({ decks, threshold, maxMismatch, rows }, null, 2)}\n`,
  );
}
if (failures.length > 0) {
  const first = failures[0];
  console.error(
    `canvas-fidelity: ${first.deck}/${first.slideId} (${first.theme}) differs from its grammar render by ${(first.fraction * 100).toFixed(3)} percent, over the ${(maxMismatch * 100).toFixed(2)} percent budget; diff at ${first.diff}`,
  );
  process.exit(1);
}
