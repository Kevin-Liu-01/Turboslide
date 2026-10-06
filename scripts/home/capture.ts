// The Present band's figure (docs/DESIGN.md 8.0 "Figures", 8.10): the product's presenter view of
// the page deck, captured from the product's own route on a node-server build of the same commit
// in both appearances. D4's build module. The recording runs against a server and writes the two
// captures; scripts/build-home-assets.ts derives the served files from them (no browser), so
// `build-home-assets.ts --check` compares them in every gate:
//
//   node scripts/home/capture.ts --record --base <origin> --overlay <dir>
//        writes the page deck (the fixture with the recorded run's slide 5 and sections, as
//        build-home-assets.ts writePageDeck writes it) twice into <dir>/decks/, the folder the
//        server's tmp store reads (its TURBOSLIDE_OVERLAY_DIR), once in each appearance (the
//        kit's appearance, as the Theme panel's Appearance writes it, so the slides match the
//        page's); opens /present/<that deck> at 1024 by 640 at 2x in that appearance; moves to
//        slide 2; resets and pauses the timer; and writes
//        apps/studio/home-deck/recorded-presenter/presenter-{light,dark}.webp (2048 by 1280,
//        lossless) and presenter.json
//
//   node scripts/home/capture.ts --record --only download --base <origin> --overlay <dir>
//        the export band's figure (DESIGN.md 8.11): the editor's Download dialog as File >
//        Download > More formats > Download options opens it on the same page deck, in each
//        appearance at 2x, the dialog alone with 12 px of its own ring around it on a transparent
//        ground; writes apps/studio/home-deck/recorded-download/download-{light,dark}.webp and
//        download.json
//
// `--only presenter` or `--only download` records one figure and leaves the other's recording.
// The clock in the console's head reads the time of the recording; nothing else in either
// picture depends on when it was taken.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import sharp from 'sharp';

import { DOWNLOAD_DIR, PRESENTER_DIR } from './figures.ts';
import type { DownloadRecording, PresenterRecording } from './figures.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = 'apps/studio/home-deck';
const RECORDED = `${FIXTURE}/recorded`;
/** The page deck's id in the server's store while the capture runs, one per appearance. */
const deckId = (theme: 'light' | 'dark'): string => `turboslide-home-${theme}`;
/** The console's box: CSS pixels, captured at 2x. */
export const PRESENTER_VIEWPORT = { width: 1024, height: 640 } as const;
/** The slide the console shows: slide 2, "The four weeks", with its next slide and notes. */
const SLIDE = 2;
const THEMES = ['light', 'dark'] as const;

function fail(message: string): never {
  console.error(`home/capture: ${message}`);
  process.exit(1);
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** The page deck on disk, as build-home-assets.ts writePageDeck writes it for the exports. */
function writePageDeck(dir: string, theme: 'light' | 'dark'): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const part of ['deck.json', 'slides', 'assets'])
    cpSync(resolve(ROOT, FIXTURE, part), join(dir, part), { recursive: true });
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Record<string, unknown>;
  deck['id'] = deckId(theme);
  deck['brand'] = { ...(deck['brand'] as Record<string, unknown>), appearance: theme };
  deck['sections'] = JSON.parse(
    readFileSync(resolve(ROOT, RECORDED, 'page-deck-sections.json'), 'utf8'),
  ) as unknown;
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(deck, null, 2)}\n`);
  writeFileSync(
    join(dir, 'slides', 'next-steps.json'),
    readFileSync(resolve(ROOT, RECORDED, 'next-steps-filled.json')),
  );
}

type Browser = Awaited<ReturnType<typeof chromium.launch>>;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** A capture kept as lossless WebP: the screenshot's pixels at a third of the PNG's bytes. */
const lossless = async (png: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer());

async function recordPresenter(browser: Browser, base: string, overlay: string): Promise<void> {
  const out = resolve(ROOT, PRESENTER_DIR);
  mkdirSync(out, { recursive: true });
  const files: PresenterRecording['files'] = [];
  {
    for (const theme of THEMES) {
      writePageDeck(resolve(overlay, 'decks', deckId(theme)), theme);
      const context = await browser.newContext({
        viewport: PRESENTER_VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      /* the appearance the console draws: the stored choice, as a visitor's own pick sets it */
      await context.addInitScript((t) => {
        try {
          localStorage.setItem('gt-theme', t);
        } catch {
          /* a store that throws leaves the system appearance, which colorScheme sets */
        }
      }, theme);
      const page = await context.newPage();
      const response = await page.goto(`${base}/present/${deckId(theme)}`, { waitUntil: 'load' });
      if (response === null || !response.ok())
        fail(`/present/${deckId(theme)} answered ${response?.status() ?? 'nothing'}`);
      const consoleRoot = page.locator('[data-control="presenter"]');
      await consoleRoot.waitFor({ timeout: 60_000 });
      for (let i = 1; i < SLIDE; i += 1) await page.locator('[data-control="presenter.next"]').click();
      await page.waitForFunction(
        (n) => document.querySelector('[data-control="presenter"]')?.getAttribute('data-index') === String(n - 1),
        SLIDE,
        { timeout: 15_000 },
      );
      await page.locator('[data-control="presenter.reset"]').click();
      const pause = page.locator('[data-control="presenter.pause"]');
      if ((await pause.getAttribute('aria-pressed')) !== 'true') await pause.click();
      await page.evaluate(async () => {
        /* no control keeps the focus ring the clicks gave it */
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        await document.fonts.ready;
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      await page.mouse.move(0, PRESENTER_VIEWPORT.height - 1);
      await page.waitForTimeout(800);
      const webp = await lossless(await page.screenshot({ type: 'png' }));
      const file = `presenter-${theme}.webp`;
      writeFileSync(join(out, file), webp);
      files.push({ appearance: theme, file, sha256: sha256(webp) });
      await context.close();
    }
  }
  const recording: PresenterRecording = {
    generator: 'scripts/home/capture.ts --record',
    route: '/present/<the page deck>',
    viewport: { ...PRESENTER_VIEWPORT, deviceScaleFactor: 2 },
    slide: SLIDE,
    files,
  };
  writeFileSync(join(out, 'presenter.json'), `${JSON.stringify(recording, null, 2)}\n`);
  console.log(
    `home/capture --record: ${files.map((f) => `${f.file} ${f.sha256.slice(0, 10)}`).join(', ')} under ${PRESENTER_DIR}`,
  );
}

/** The ring and the frame drawn outside the dialog's box, kept in the picture. */
const DOWNLOAD_MARGIN = 12;

async function recordDownload(browser: Browser, base: string, overlay: string): Promise<void> {
  const out = resolve(ROOT, DOWNLOAD_DIR);
  mkdirSync(out, { recursive: true });
  const files: DownloadRecording['files'] = [];
  let size = { width: 0, height: 0 };
  for (const theme of THEMES) {
    writePageDeck(resolve(overlay, 'decks', deckId(theme)), theme);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('gt-theme', t);
      } catch {
        /* the system appearance, which colorScheme sets */
      }
    }, theme);
    const page = await context.newPage();
    const response = await page.goto(`${base}/edit/${deckId(theme)}`, { waitUntil: 'load' });
    if (response === null || !response.ok())
      fail(`/edit/${deckId(theme)} answered ${response?.status() ?? 'nothing'}`);
    const control = (id: string) => page.locator(`[data-control="${id}"]`).first();
    await control('menubar.file').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1_000);
    await control('menubar.file').click();
    const path = ['file.download', 'file.download.more'];
    for (const row of path) {
      await control(`menu.${row}`).hover();
      await page.waitForTimeout(400);
    }
    await control('menu.file.download.options').click();
    await control('dialog.download.pptx').waitFor({ timeout: 15_000 });
    /* the dialog's own box carries its control (Dialog.tsx), the type choice is inside it */
    const dialog = page
      .locator('.ts-dialog[data-control="dialog.download.pptx"], .ts-dialog:has([data-control="dialog.download.type"])')
      .first();
    /* the dialog alone: the editor and the scrim are not drawn, the ground is transparent */
    await page.addStyleTag({
      content: `html, body { background: transparent !important; }
        body * { visibility: hidden !important; }
        .ts-dialog, .ts-dialog * { visibility: visible !important; }
        .ts-dialog-scrim { background: transparent !important; backdrop-filter: none !important; }
        ::backdrop { background: transparent !important; }`,
    });
    await page.evaluate(async () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    const box = await dialog.boundingBox();
    if (box === null) fail('the Download dialog has no box');
    const clip = {
      x: Math.floor(box.x) - DOWNLOAD_MARGIN,
      y: Math.floor(box.y) - DOWNLOAD_MARGIN,
      width: Math.ceil(box.width) + DOWNLOAD_MARGIN * 2,
      height: Math.ceil(box.height) + DOWNLOAD_MARGIN * 2,
    };
    size = { width: clip.width, height: clip.height };
    const webp = await lossless(await page.screenshot({ type: 'png', clip, omitBackground: true }));
    const file = `download-${theme}.webp`;
    writeFileSync(join(out, file), webp);
    files.push({ appearance: theme, file, sha256: sha256(webp) });
    await context.close();
  }
  const recording: DownloadRecording = {
    generator: 'scripts/home/capture.ts --record --only download',
    route: '/edit/<the page deck>, File > Download > More formats > Download options',
    size,
    deviceScaleFactor: 2,
    files,
  };
  writeFileSync(join(out, 'download.json'), `${JSON.stringify(recording, null, 2)}\n`);
  console.log(
    `home/capture --record: ${files.map((f) => `${f.file} ${f.sha256.slice(0, 10)}`).join(', ')} at ${size.width} by ${size.height} under ${DOWNLOAD_DIR}`,
  );
}

async function record(base: string, overlay: string, only: string | null): Promise<void> {
  const browser = await chromium.launch();
  try {
    if (only === null || only === 'presenter') await recordPresenter(browser, base, overlay);
    if (only === null || only === 'download') await recordDownload(browser, base, overlay);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--record')) fail('usage: --record --base <origin> --overlay <dir>');
  const base = arg('base');
  const overlay = arg('overlay');
  if (base === null || overlay === null) fail('--record takes --base <origin> and --overlay <dir>');
  const only = arg('only');
  if (only !== null && only !== 'presenter' && only !== 'download')
    fail('--only takes presenter or download');
  await record(base.replace(/\/$/, ''), overlay, only);
}
