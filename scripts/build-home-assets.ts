// The /home page's pictures (docs/archive/rounds/POLISH.md 3.3 item 1; the round four notes of gslides-parity
// SPEC-4 2.4 stand under it): the product's own render, never a stock picture and never the
// README's captures. `--capture` opens the editor on the example deck through
// @turboslide/headless at 1440 by 900 and device scale factor 2 in both appearances and writes
// three pictures per appearance under apps/studio/public/home as content hashed files, each with a
// 2x and a 1x candidate: the hero (the whole window on the Blue Marble slide, JPEG at quality 82),
// the canvas crop (the stage with one picture selected, its ring, its eight handles and the
// rotation readout held mid drag, 612 by 400 CSS px, PNG) and the menus crop (the title row and
// the menu bar with the Insert menu open, 612 px wide and under 480 tall, PNG, so its text stays
// crisp). apps/studio/src/components/home/shots.json records every candidate's path, size, bytes
// and sha256 plus what the chrome carried when the picture was taken (the Turboslide mark in the
// title row, the menu bar's labels), which `shots.test.ts` asserts; shots.ts is the JSON's typed
// twin the studio imports (its tsconfig reaches no JSON file). The hashed names let
// vite.deploy.config.ts serve /home/** as immutable for a year. The build also copies the counts
// of packages/theme/brand/facts.json into facts-data.ts with the file's sha256 (SPEC-4 0.25).
//
// Run from the repository root with Node 24 (type stripping, no build step):
//   node scripts/build-home-assets.ts --capture --base http://localhost:4447   the caller's server;
//                                                                              the caller holds
//                                                                              .turboslide/e2e.lock
//   node scripts/build-home-assets.ts --capture [--port 4447]                  starts its own tmp
//                                                                              store server, takes
//                                                                              the lock itself
//   node scripts/build-home-assets.ts --check      asserts the folder equals the manifest
//   node scripts/build-home-assets.ts --facts      rewrites facts-data.ts and shots.ts alone
//
// `--check` reads shots.json and asserts every candidate exists at its byte count and sha256,
// decodes to its recorded size and format, that the folder holds no file the manifest does not
// name, that the module twin and the facts module agree with their sources, and that every
// picture's chrome record carries the mark and no Extensions menu. It compares by the recorded
// bytes and by decoded size rather than by re-encoding, because an encoder's bytes differ across
// libvips builds while the committed files are the contract. Exit 1 names the first path that
// differs. The capture runs on the tree the round ships, after the chrome lanes merge, so the
// pictures show the round's chrome (POLISH.md 4.3).
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Page } from 'playwright-core';
import sharp from 'sharp';

import { launchBrowser } from '../packages/headless/src/launch.ts';
import type { LaunchedBrowser } from '../packages/headless/src/launch.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = 'apps/studio/public/home';
const URL_PREFIX = '/home';
const MANIFEST_PATH = 'apps/studio/src/components/home/shots.json';
const MODULE_PATH = 'apps/studio/src/components/home/shots.ts';
const FACTS_PATH = 'packages/theme/brand/facts.json';
const FACTS_MODULE_PATH = 'apps/studio/src/components/home/facts-data.ts';
const LOCK_DIR = '.turboslide/e2e.lock';
const COUNT_KEYS = [
  'actions',
  'mcpTools',
  'httpPaths',
  'layouts',
  'materials',
  'checkSteps',
  'parityRows',
] as const;

/** The example deck the tmp store seeds and its Blue Marble slide (decks/gt-brand/slides/mood-earth.json). */
const DECK = 'gt-brand';
const SLIDE = 'mood-earth';
const VIEWPORT = { width: 1440, height: 900 } as const;
const SCALE = 2;
const JPEG_QUALITY = 82;
/** The canvas crop in CSS px: the seven column slot of the two column band (POLISH.md 3.4). */
const CANVAS_CROP = { width: 612, height: 400 } as const;
/**
 * The menus crop: the slot's width, the title row, the menu bar and the whole Insert menu. 3.2
 * item 3 wrote "under 480 px tall" for a shorter menu; the Insert menu of this build stands
 * about 500 px tall under the title row (measured 2026-09-28), so the ceiling is 520 and the
 * menu is never cut.
 */
const MENUS_CROP = { width: 612, maxHeight: 520 } as const;
/**
 * The canvas crop's picture: the Blue Marble slide's own picture, selected at this zoom so the
 * whole ring with its eight handles, the rotation handle and the readout fit the 612 by 400 crop
 * (the sheet is 1600 by 900; at the factor 0.3 it is 480 by 270 CSS px on screen, and turned
 * by 12 degrees its ring, the rotation handle and the readout stay inside 612 by 400).
 */
const CANVAS_ZOOM = 0.3;
const KINDS = ['hero', 'canvas', 'menus'] as const;
const THEMES = ['dark', 'light'] as const;

export type ShotKind = (typeof KINDS)[number];
export type Theme = (typeof THEMES)[number];

export type ShotVariant = {
  /** the served path under the studio's public folder */
  path: string;
  scale: 1 | 2;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

/** What the chrome carried when the picture was taken, read from the DOM at that moment. */
export type ChromeRecord = {
  /** the Turboslide mark in the title row */
  mark: boolean;
  /** the menu bar's labels in order */
  menubar: string[];
  /** an Extensions menu, which production's chrome no longer has */
  extensions: boolean;
};

export type ShotRecord = {
  /** `<kind>-<theme>` */
  name: string;
  kind: ShotKind;
  theme: Theme;
  format: 'jpeg' | 'png';
  /** the CSS size the picture is drawn at 1:1 (the 1x candidate's size) */
  width: number;
  height: number;
  /** the 2x candidate first */
  variants: ShotVariant[];
  chrome: ChromeRecord;
};

export type ShotsManifest = {
  generatedBy: string;
  capturedAt: string;
  commit: string;
  deck: string;
  slide: string;
  viewport: { width: number; height: number };
  scale: number;
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// The capture: the product driven at human speed (after docs/readme/shoot-readme.mjs)

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

const rand = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1));

async function moveHuman(page: Page, from: Point, to: Point, steps = 12): Promise<void> {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
}

async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y);
  await sleep(rand(120, 220));
}

async function press(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(50, 90));
  }
}

async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

async function state(page: Page): Promise<{ slideId?: string; sync?: { pending?: number } }> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          turboslide: {
            studio: { describe(): { state: { slideId?: string; sync?: { pending?: number } } } };
          };
        }
      ).turboslide.studio.describe().state,
  );
}

async function settled(page: Page, timeout = 20_000): Promise<void> {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? 0) === 0) return;
    if (Date.now() > until) return;
    await sleep(150);
  }
}

async function clickControl(page: Page, control: string): Promise<void> {
  const loc = page.locator(`[data-control="${control}"]`).filter({ visible: true }).first();
  await loc.scrollIntoViewIfNeeded();
  const r = await loc.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
}

async function clearAll(page: Page): Promise<void> {
  await press(page, 'Escape', 3);
  await sleep(200);
}

/**
 * The tmp store's notice ("Edits are kept on this server instance only ...") is a fact of the
 * scratch store, not of the product; the status bar that carries it is hidden for the pictures.
 */
async function hideStoreNotice(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"]')) {
      if (/Edits are kept on this server instance/.test(el.textContent ?? '')) {
        el.style.display = 'none';
      }
    }
  });
}

async function handleControls(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map(
      (el) => el.getAttribute('data-control') ?? '',
    ),
  );
}

async function handleRect(page: Page, dir: string): Promise<Rect> {
  const control = (await handleControls(page)).find((c) => c.endsWith(`.${dir}`));
  if (!control) throw new Error(`no ${dir} handle`);
  const r = await rectOf(page, `.ts-overlay [data-control="${control}"]`);
  if (!r) throw new Error(`no box for ${control}`);
  return r;
}

/** The selected object's box on screen, from its nw and se handles. */
async function selectionRect(page: Page): Promise<Rect> {
  const a = center(await handleRect(page, 'nw'));
  const b = center(await handleRect(page, 'se'));
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

async function selectAt(page: Page, at: Point): Promise<Rect> {
  await clearAll(page);
  await clickAt(page, at.x, at.y);
  await page.locator('.ts-overlay [data-control$=".rotate"]').first().waitFor({ timeout: 8000 });
  return selectionRect(page);
}

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { turboslide?: { studio?: unknown } }).turboslide?.studio),
    null,
    { timeout: 90_000 },
  );
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
}

type Captured = {
  theme: Theme;
  hero: Uint8Array;
  canvas: Uint8Array;
  menus: Uint8Array;
  menusHeight: number;
  chrome: ChromeRecord;
};

/** A crop of the given size around a point, kept inside the viewport. */
function cropAround(at: Point, size: { width: number; height: number }): Rect {
  const x = Math.max(0, Math.min(VIEWPORT.width - size.width, Math.round(at.x - size.width / 2)));
  const y = Math.max(
    0,
    Math.min(VIEWPORT.height - size.height, Math.round(at.y - size.height / 2)),
  );
  return { x, y, w: size.width, h: size.height };
}

async function captureTheme(
  launched: LaunchedBrowser,
  base: string,
  theme: Theme,
): Promise<Captured> {
  const context = await launched.browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: SCALE,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  try {
    await context.addInitScript((t: string) => {
      try {
        localStorage.setItem('gt-theme', t);
      } catch {
        /* private mode */
      }
    }, theme);
    const page = await context.newPage();
    await page.goto(`${base}/edit/${DECK}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await sleep(800);

    /* the tmp store's notice ("Edits are kept on this server instance only") is a fact of the
       scratch store, not of the product, so its toast is hidden for the pictures */
    await page.addStyleTag({
      content: '.pt-toast, [class*="ts-snackbar"], .pt-tip { display: none !important; }',
    });
    await hideStoreNotice(page);

    /* the Blue Marble slide */
    await clickControl(page, `filmstrip.slide.${SLIDE}`);
    const until = Date.now() + 10_000;
    while ((await state(page)).slideId !== SLIDE && Date.now() < until) await sleep(150);
    if ((await state(page)).slideId !== SLIDE) throw new Error(`the stage did not show ${SLIDE}`);
    await sleep(600);
    await clearAll(page);
    /* the pointer parked over the title row's empty middle, where nothing draws a hover or a tip */
    await page.mouse.move(700, 22);
    await sleep(500);
    const hero = new Uint8Array(await page.screenshot({ type: 'png', animations: 'disabled' }));

    /* the menus crop, taken before any gesture so the title row reads the seeded deck's saved
       state: the title row and the menu bar with the Insert menu open */
    await clickControl(page, 'menubar.insert');
    await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    await sleep(350);
    const menu = await rectOf(page, '#ts-menu-insert');
    if (!menu) throw new Error('no Insert menu');
    const menusHeight = Math.min(MENUS_CROP.maxHeight, Math.ceil(menu.y + menu.h + 12));
    const chrome = await page.evaluate(() => {
      const menubar = [...document.querySelectorAll('[data-control^="menubar."]')].map(
        (el) => el.textContent?.trim() ?? '',
      );
      return {
        mark: document.querySelector('.ts-title-row svg.ts-mark') !== null,
        menubar,
        extensions: menubar.some((label) => /extensions/i.test(label)),
      };
    });
    const menus = new Uint8Array(
      await page.screenshot({
        type: 'png',
        animations: 'disabled',
        clip: { x: 0, y: 0, width: MENUS_CROP.width, height: menusHeight },
      }),
    );
    await clearAll(page);

    /* the canvas crop: the Blue Marble slide's own picture selected at 0.3 of its size, so its
       whole ring, its eight handles, the rotation handle and the readout fit the crop, then held
       mid rotation so the readout shows; the gesture is cancelled with Escape before the button
       is released, so nothing is written. (Insert > Image > Upload from computer would place a
       free picture, but on the tree of 2026-09-28 the upload lands nothing on the seed deck or on
       a fresh one while B4's picture placement is in progress; the row images.insert.upload is
       one of the two named for owners, so this capture reads the stage without it.) */
    await page.evaluate(
      (zoom) =>
        (
          window as unknown as {
            turboslide: { studio: { invoke(id: string, input: unknown): Promise<unknown> } };
          }
        ).turboslide.studio.invoke('view.zoom', { zoom }),
      CANVAS_ZOOM,
    );
    await sleep(600);
    await clearAll(page);
    const sheet = await rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!sheet) throw new Error('no sheet on the stage');
    /* the picture covers the sheet under the plate at the lower right; a click above the plate
       selects the picture like any picture */
    const rect = await selectAt(page, { x: sheet.x + sheet.w * 0.35, y: sheet.y + sheet.h * 0.3 });
    const ring = center(await handleRect(page, 'rotate'));
    const pivot = center(rect);
    const radius = Math.hypot(ring.x - pivot.x, ring.y - pivot.y);
    const a0 = Math.atan2(ring.y - pivot.y, ring.x - pivot.x);
    const a1 = a0 + (12 * Math.PI) / 180;
    const to = { x: pivot.x + radius * Math.cos(a1), y: pivot.y + radius * Math.sin(a1) };
    await moveHuman(page, { x: ring.x - 30, y: ring.y - 20 }, ring, 6);
    await sleep(80);
    await page.mouse.down();
    await sleep(80);
    await moveHuman(page, ring, to, 14);
    await sleep(350);
    await page
      .locator('.ts-overlay .ts-readout')
      .first()
      .waitFor({ timeout: 4000 })
      .catch(() => undefined);
    const clip = cropAround({ x: pivot.x, y: pivot.y + 8 }, CANVAS_CROP);
    const canvas = new Uint8Array(
      await page.screenshot({
        type: 'png',
        animations: 'disabled',
        clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h },
      }),
    );
    /* Escape cancels the gesture while the button is down, so the seed deck is not written */
    await page.keyboard.press('Escape');
    await sleep(120);
    await page.mouse.up();
    await sleep(300);
    await clearAll(page);
    return { theme, hero, canvas, menus, menusHeight, chrome };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------
// The encoding: JPEG at 82 for the hero, PNG for the two chrome crops, a 2x and a 1x candidate each

type Output = { path: string; bytes: Uint8Array };

type Encoded = { format: 'jpeg' | 'png'; ext: 'jpg' | 'png'; two: Uint8Array; one: Uint8Array };

async function encode(kind: ShotKind, png: Uint8Array): Promise<Encoded> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 0;
  if (width === 0) fail(`${kind}: the capture has no size`);
  if (kind === 'hero') {
    const two = await sharp(png).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    const one = await sharp(png)
      .resize({ width: Math.round(width / SCALE), kernel: 'lanczos3' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    /* the record beside the choice: what the other encodings of the same capture would weigh */
    const palette = await sharp(png)
      .png({ compressionLevel: 9, palette: true, quality: 95 })
      .toBuffer();
    const q70 = await sharp(png).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
    console.log(
      `hero 2x: jpeg q${JPEG_QUALITY} ${two.length} bytes; palette png ${palette.length}; jpeg q70 ${q70.length}`,
    );
    return { format: 'jpeg', ext: 'jpg', two: new Uint8Array(two), one: new Uint8Array(one) };
  }
  const two = await sharp(png).png({ compressionLevel: 9, palette: true, quality: 95 }).toBuffer();
  const one = await sharp(png)
    .resize({ width: Math.round(width / SCALE), kernel: 'lanczos3' })
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toBuffer();
  return { format: 'png', ext: 'png', two: new Uint8Array(two), one: new Uint8Array(one) };
}

function gitCommit(): string {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

async function build(base: string): Promise<{ manifest: ShotsManifest; outputs: Output[] }> {
  const launched = await launchBrowser({ backend: 'angle-metal' });
  const captured: Captured[] = [];
  try {
    for (const theme of THEMES) {
      console.log(
        `capture ${theme} on ${base}/edit/${DECK} at ${VIEWPORT.width} by ${VIEWPORT.height}, scale ${SCALE}`,
      );
      captured.push(await captureTheme(launched, base, theme));
    }
  } finally {
    await launched.close();
  }
  const outputs: Output[] = [];
  const shots: ShotRecord[] = [];
  for (const shot of captured) {
    for (const kind of KINDS) {
      const png = shot[kind];
      const encoded = await encode(kind, png);
      const variants: ShotVariant[] = [];
      for (const [scale, bytes] of [
        [2, encoded.two],
        [1, encoded.one],
      ] as const) {
        const meta = await sharp(bytes).metadata();
        const digest = sha256(bytes);
        const file = `${kind}-${shot.theme}${scale === 2 ? '-2x' : ''}-${digest.slice(0, 10)}.${encoded.ext}`;
        outputs.push({ path: `${PUBLIC_DIR}/${file}`, bytes });
        variants.push({
          path: `${URL_PREFIX}/${file}`,
          scale,
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          bytes: bytes.length,
          sha256: digest,
        });
      }
      const one = variants[1];
      if (one === undefined) fail(`${kind}-${shot.theme}: no 1x candidate`);
      shots.push({
        name: `${kind}-${shot.theme}`,
        kind,
        theme: shot.theme,
        format: encoded.format,
        width: one.width,
        height: one.height,
        variants,
        chrome: shot.chrome,
      });
    }
  }
  return {
    manifest: {
      generatedBy: 'scripts/build-home-assets.ts',
      capturedAt: new Date().toISOString(),
      commit: gitCommit(),
      deck: DECK,
      slide: SLIDE,
      viewport: { ...VIEWPORT },
      scale: SCALE,
      quality: JPEG_QUALITY,
      shots,
    },
    outputs,
  };
}

// ---------------------------------------------------------------------------------------------
// The manifest, its module twin and the facts module

function readManifest(): ShotsManifest {
  const file = resolve(ROOT, MANIFEST_PATH);
  if (!existsSync(file))
    fail(`${MANIFEST_PATH} is missing; run node scripts/build-home-assets.ts --capture`);
  return JSON.parse(readFileSync(file, 'utf8')) as ShotsManifest;
}

/** The TypeScript twin of the manifest, generated beside it. */
function moduleSource(manifest: ShotsManifest): string {
  return [
    '// Generated by scripts/build-home-assets.ts from shots.json; do not edit by hand. The',
    '// pictures of the /home page with their candidates (docs/archive/rounds/POLISH.md 3.3): the same records as',
    '// shots.json, as a module the studio project can import (its tsconfig reaches no JSON file).',
    'export type ShotVariant = {',
    '  path: string;',
    '  scale: 1 | 2;',
    '  width: number;',
    '  height: number;',
    '  bytes: number;',
    '  sha256: string;',
    '};',
    'export type ChromeRecord = { mark: boolean; menubar: string[]; extensions: boolean };',
    'export type ShotRecord = {',
    '  name: string;',
    "  kind: 'hero' | 'canvas' | 'menus';",
    "  theme: 'dark' | 'light';",
    "  format: 'jpeg' | 'png';",
    '  width: number;',
    '  height: number;',
    '  variants: ShotVariant[];',
    '  chrome: ChromeRecord;',
    '};',
    'export type ShotsManifest = {',
    '  generatedBy: string;',
    '  capturedAt: string;',
    '  commit: string;',
    '  deck: string;',
    '  slide: string;',
    '  viewport: { width: number; height: number };',
    '  scale: number;',
    '  quality: number;',
    '  shots: ShotRecord[];',
    '};',
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
  materials: number;
  checkSteps: number;
  parityRows: number;
  mismatchPercent: number;
  licence: string;
};

/** A count as the brand build writes it (`{ count }`, `{ total }` for the audit) or as a bare number. */
function countOf(value: unknown, key: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const record = (value ?? {}) as { count?: unknown; total?: unknown };
  const n = typeof record.count === 'number' ? record.count : record.total;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0)
    fail(`${FACTS_PATH}: ${key} is not a positive integer count`);
  return n;
}

/** The facts the page needs, read from the brand's file; absent means the build cannot run. */
function factsData(): FactsData {
  const file = resolve(ROOT, FACTS_PATH);
  if (!existsSync(file)) fail(`${FACTS_PATH} is missing (scripts/build-brand.ts --facts)`);
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
    "// file the brand build writes so the page's JavaScript carries ten values and not the file's",
    '// measured rows; `--check` fails when facts.json has changed since this copy (its sha256 is',
    '// recorded here).',
    `export const FACTS_DATA = ${JSON.stringify(data, null, 2)} as const;`,
    '',
  ].join('\n');
}

function writeModules(manifest: ShotsManifest): void {
  writeFileSync(resolve(ROOT, MODULE_PATH), moduleSource(manifest));
  writeFileSync(resolve(ROOT, FACTS_MODULE_PATH), factsModuleSource(factsData()));
  /* the generated modules in the repository's own style, so the format gate reads them as any other file */
  const prettier = spawnSync(
    resolve(ROOT, 'node_modules/.bin/prettier'),
    ['--write', '--log-level', 'warn', MODULE_PATH, FACTS_MODULE_PATH],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (prettier.status !== 0) fail(`prettier --write exited ${prettier.status}`);
}

async function check(): Promise<void> {
  const manifest = readManifest();
  if (manifest.shots.length !== KINDS.length * THEMES.length)
    fail(
      `${MANIFEST_PATH} records ${manifest.shots.length} pictures, not ${KINDS.length * THEMES.length}`,
    );
  const named = new Set<string>();
  let files = 0;
  for (const shot of manifest.shots) {
    if (shot.variants.length !== 2) fail(`${shot.name}: ${shot.variants.length} candidates, not 2`);
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
      if (meta.format !== shot.format) fail(`${variant.path}: ${meta.format}, not ${shot.format}`);
      named.add(variant.path.slice(URL_PREFIX.length + 1));
      files += 1;
    }
    const two = shot.variants[0];
    const one = shot.variants[1];
    if (two === undefined || one === undefined || two.scale !== 2 || one.scale !== 1)
      fail(`${shot.name}: the candidates are not the 2x then the 1x`);
    if (one.width !== shot.width || one.height !== shot.height)
      fail(`${shot.name}: the 1x candidate is not the picture's CSS size`);
    if (Math.abs(two.width - one.width * 2) > 1 || Math.abs(two.height - one.height * 2) > 1)
      fail(`${shot.name}: the 2x candidate is not twice the 1x`);
    if (!shot.chrome.mark) fail(`${shot.name}: the title row carried no Turboslide mark`);
    if (shot.chrome.extensions) fail(`${shot.name}: the menu bar carried an Extensions menu`);
  }
  const present = readdirSync(resolve(ROOT, PUBLIC_DIR)).filter((f) => !f.startsWith('.'));
  for (const file of present)
    if (!named.has(file)) fail(`${PUBLIC_DIR}/${file} is not in ${MANIFEST_PATH}; rebuild`);
  const moduleFile = resolve(ROOT, MODULE_PATH);
  if (!existsSync(moduleFile)) fail(`${MODULE_PATH} is missing; rebuild`);
  /* the module is compared as data (Prettier owns its formatting) */
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
    `build-home-assets --check: ${files} files of ${manifest.shots.length} pictures match ${MANIFEST_PATH} and ${MODULE_PATH}; ${FACTS_MODULE_PATH} matches ${FACTS_PATH}`,
  );
}

// ---------------------------------------------------------------------------------------------
// A server of the script's own, with the tmp store (AGENTS.md dev server rules)

async function waitForServer(origin: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const res = await fetch(`${origin}/home`, { redirect: 'manual' });
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) fail(`${origin} did not answer within ${ms} ms`);
    await sleep(500);
  }
}

function startServer(port: number): ChildProcess {
  /* a fresh temp root, so the tmp store starts from the pristine seed (its root is os.tmpdir()
     and its decks folder survives a server restart otherwise) */
  const tmp = mkdtempSync(join(tmpdir(), 'turboslide-home-capture-'));
  const child = spawn(
    resolve(ROOT, 'apps/studio/node_modules/.bin/vite'),
    ['dev', '--port', String(port), '--strictPort', '-c', 'vite.no-watch.config.ts'],
    {
      cwd: resolve(ROOT, 'apps/studio'),
      env: {
        ...process.env,
        TURBOSLIDE_STORE: 'tmp',
        TURBOSLIDE_REALTIME: 'memory',
        TURBOSLIDE_LOCAL_OPEN: '1',
        TURBOSLIDE_SESSION_SECRET: randomBytes(32).toString('hex'),
        TURBOSLIDE_DOWNLOAD_SECRET: randomBytes(32).toString('hex'),
        TMPDIR: tmp,
      },
      /* never an unbounded log (AGENTS.md); the server's output is discarded */
      stdio: 'ignore',
      detached: false,
    },
  );
  return child;
}

async function takeLock(): Promise<void> {
  const dir = resolve(ROOT, LOCK_DIR);
  for (;;) {
    try {
      mkdirSync(dir);
      return;
    } catch {
      await sleep(5000);
    }
  }
}

function releaseLock(): void {
  try {
    rmdirSync(resolve(ROOT, LOCK_DIR));
  } catch {
    /* already released */
  }
}

async function capture(argv: string[]): Promise<void> {
  const baseIndex = argv.indexOf('--base');
  const portIndex = argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(argv[portIndex + 1]) : 4447;
  let base = baseIndex >= 0 ? (argv[baseIndex + 1] ?? '').replace(/\/$/, '') : '';
  let server: ChildProcess | null = null;
  let locked = false;
  try {
    if (base === '') {
      base = `http://localhost:${port}`;
      console.log(`starting a tmp store server on ${base}`);
      server = startServer(port);
      await waitForServer(base, 120_000);
      await takeLock();
      locked = true;
    }
    const { manifest, outputs } = await build(base);
    const dir = resolve(ROOT, PUBLIC_DIR);
    mkdirSync(dir, { recursive: true });
    const keep = new Set(outputs.map((o) => o.path.slice(`${PUBLIC_DIR}/`.length)));
    for (const file of readdirSync(dir)) if (!keep.has(file)) rmSync(resolve(dir, file));
    for (const output of outputs) writeFileSync(resolve(ROOT, output.path), output.bytes);
    writeFileSync(resolve(ROOT, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
    writeModules(manifest);
    const total = outputs.reduce((sum, o) => sum + o.bytes.length, 0);
    for (const output of outputs) console.log(`${output.path} ${output.bytes.length} bytes`);
    for (const shot of manifest.shots)
      console.log(
        `${shot.name}: ${shot.format} ${shot.width} by ${shot.height}; mark ${shot.chrome.mark}, menu bar ${shot.chrome.menubar.join(', ')}`,
      );
    console.log(
      `${outputs.length} files, ${total} bytes under ${PUBLIC_DIR}; ${MANIFEST_PATH}, ${MODULE_PATH} and ${FACTS_MODULE_PATH} written`,
    );
  } finally {
    if (locked) releaseLock();
    if (server !== null) server.kill('SIGTERM');
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const known = new Set(['--capture', '--check', '--facts', '--base', '--port']);
  for (const [i, flag] of argv.entries())
    if (
      flag.startsWith('--') &&
      !known.has(flag) &&
      !['--base', '--port'].includes(argv[i - 1] ?? '')
    )
      fail(`unknown flag ${flag}`);
  if (argv.includes('--check')) {
    await check();
    return;
  }
  if (argv.includes('--capture')) {
    await capture(argv);
    return;
  }
  /* `--facts` and the bare run: the two generated modules from what is on disk, no browser */
  writeModules(readManifest());
  console.log(
    `${MODULE_PATH} and ${FACTS_MODULE_PATH} written from ${MANIFEST_PATH} and ${FACTS_PATH}`,
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
