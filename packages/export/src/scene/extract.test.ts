// Three browser tests over extractScenes.
//
// The measurement order of gslides-parity SPEC-2 1.5 on a rotated picture: with the `.ts-measure`
// class on, the transforms are off, so the boxes and the element screenshots are the unrotated
// ones (pptxgenjs `rotate` turns the raster once); with the class off, the flatten sheet
// screenshot shows the rotation. The fixture deck's `rotated` slide carries a framed picture at
// 1000, 480, 400 by 225 rotated 15 degrees.
//
// The export's pages on the single-process serverless shell (docs/hosting-chromium.md section 3b):
// every hosted native export answered 502 because the 3x shot page for icons and marks was opened
// raw and closed its context, which kills chrome-headless-shell under --single-process. The guard
// lives in openSheetPage's close, so this test flags a real Chrome for Testing browser the way
// launchBrowser flags the serverless shell and runs one slide in native mode through
// extractScenes: the 1x, 2x and 3x contexts must all stay open on the flagged browser, and the
// same run on an unflagged browser must close them. Runs where the binary and the deck exist;
// TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time (AGENTS.md).
//
// The catalog faces reach the capture (gslides-parity SPEC-5-amendments A5 items 5 and 7;
// VERIFICATION-5 finding 5): the scene's `family` is the computed font-family of the export
// capture, so the capture's theme bundle has to carry the @font-face rules and the
// `--ts-font-<id>` rule of every family the deck uses, else the variable resolves to `inherit`
// and every heading measures, shoots and exports in Inter. The third test builds a five family
// deck (the verifier's shape: five h2 headings on a freeform slide, one per `typography.family`),
// extracts its slide and reads the family of every run, then exports it as Editable text and
// reads the `a:latin typeface` values of the slide part.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { decodeImage } from '@turboslide/effects/io';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { fontFamilyName } from '@turboslide/fonts/names';
import {
  isSingleProcessBrowser,
  launchBrowser,
  markSingleProcessBrowser,
  resolveExecutable,
} from '@turboslide/headless/launch';
import type { LaunchedBrowser } from '@turboslide/headless/launch';

import { exportPptx } from '../export-pptx.ts';
import { readAllAttributes } from '../ooxml/geometry.ts';
import { openPackage, slideParts } from '../ooxml/zip.ts';
import { extractScenes } from './extract.ts';
import type { ExtractResult } from './extract.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const DECK_DIR = join(REPO, 'decks/gt-brand');
const FIXTURE_DIR = join(REPO, 'decks/fixture/gslides');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !existsSync(join(DECK_DIR, 'deck.json')) ||
  !existsSync(join(FIXTURE_DIR, 'deck.json'));

function loadFixture(): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(FIXTURE_DIR, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(FIXTURE_DIR, 'slides')))
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'slides', file), 'utf8'),
    ) as Slide;
  return { deck, slides };
}

/**
 * The bounding box of the pixels inside `region` (device px) that differ from the paper, read at
 * the region's top left corner, by more than 25 levels in any channel.
 */
function inkBox(
  image: Awaited<ReturnType<typeof decodeImage>>,
  region: [number, number, number, number],
): { x0: number; y0: number; x1: number; y1: number } | null {
  const [rx0, ry0, rx1, ry1] = region;
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * image.width + x) * 4;
    return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
  };
  const paper = at(rx0, ry0);
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (let y = ry0; y < ry1; y += 1)
    for (let x = rx0; x < rx1; x += 1) {
      const p = at(x, y);
      if (
        Math.abs(p[0] - paper[0]) <= 25 &&
        Math.abs(p[1] - paper[1]) <= 25 &&
        Math.abs(p[2] - paper[2]) <= 25
      )
        continue;
      if (box === null) box = { x0: x, y0: y, x1: x, y1: y };
      else {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
    }
  return box;
}

describe.skipIf(skip)(
  'the measurement order of gslides-parity SPEC-2 1.5 on a rotated picture',
  () => {
    let out = '';

    beforeAll(async () => {
      out = await mkdtemp(join(tmpdir(), 'turboslide-extract-rotated-'));
    });

    afterAll(async () => {
      await rm(out, { recursive: true, force: true });
    });

    test('the element screenshot is the unrotated box and the sheet screenshot shows the rotation', async () => {
      const document = loadFixture();
      const launched = await launchBrowser();
      try {
        const native = await extractScenes({
          deckDir: FIXTURE_DIR,
          document,
          themes: ['light'],
          mode: 'native',
          slideIds: ['rotated'],
          workDir: join(out, 'native'),
          browser: launched,
        });
        const scene = native.scenes[0];
        const photo = scene?.rasters.find((r) => r.blockId === 'photo');
        expect(photo).toBeDefined();
        if (!photo || !photo.file) throw new Error('the picture raster was not shot');
        // measured with the transforms off: the block's own box (whole pixels; the 1 px frame sits
        // inside the box the element reports), the rotation as a fact on the raster
        expect(photo.rotate).toBe(15);
        expect(photo.box[0]).toBeGreaterThanOrEqual(998);
        expect(photo.box[0]).toBeLessThanOrEqual(1001);
        expect(photo.box[1]).toBeGreaterThanOrEqual(478);
        expect(photo.box[1]).toBeLessThanOrEqual(481);
        expect(photo.box[2]).toBeGreaterThanOrEqual(400);
        expect(photo.box[2]).toBeLessThanOrEqual(404);
        expect(photo.box[3]).toBeGreaterThanOrEqual(225);
        expect(photo.box[3]).toBeLessThanOrEqual(229);
        // the element screenshot is that unrotated box at the raster's scale
        const shot = await decodeImage(photo.file);
        expect(shot.width).toBe(photo.box[2] * photo.scale);
        expect(shot.height).toBe(photo.box[3] * photo.scale);
        // the text box at 37 degrees is measured the same way
        expect(scene?.texts.find((t) => t.blockId === 'tilted')?.rotate).toBe(37);

        const flatten = await extractScenes({
          deckDir: FIXTURE_DIR,
          document,
          themes: ['light'],
          mode: 'flatten',
          slideIds: ['rotated'],
          workDir: join(out, 'flatten'),
          browser: launched,
        });
        const sheetImage = flatten.scenes[0]?.sheetImage;
        if (!sheetImage) throw new Error('the sheet was not shot');
        const sheet = await decodeImage(sheetImage);
        expect(sheet.width).toBe(3200);
        expect(sheet.height).toBe(1800);
        // with the class off the sheet shows the picture turned about its centre: the ink around the
        // block's box spans the rotated frame's extents, 400 cos 15 + 225 sin 15 by
        // 400 sin 15 + 225 cos 15 sheet px (445 by 321), and starts above the unrotated top edge
        const ink = inkBox(sheet, [940 * 2, 425 * 2, 1460 * 2, 765 * 2]);
        expect(ink).not.toBeNull();
        if (!ink) return;
        const w = (ink.x1 - ink.x0 + 1) / 2;
        const h = (ink.y1 - ink.y0 + 1) / 2;
        expect(w).toBeGreaterThan(430);
        expect(w).toBeLessThan(460);
        expect(h).toBeGreaterThan(306);
        expect(h).toBeLessThan(336);
        expect(ink.y0 / 2).toBeLessThan(480 - 30);
        expect(ink.x0 / 2).toBeLessThan(1000 - 10);
      } finally {
        await launched.close();
      }
    }, 240_000);
  },
);

/** Slide 08 (`audience`): text, a diagram and a ruled table with icons, so `auto` needs the 3x page. */
function loadSlide(): { deck: Deck; slides: Record<string, Slide>; id: string } {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const id = slideOrder(deck)[7] ?? '';
  const slide = JSON.parse(readFileSync(join(DECK_DIR, 'slides', `${id}.json`), 'utf8')) as Slide;
  return { deck, slides: { [id]: slide }, id };
}

describe.skipIf(skip)('extractScenes on a single-process browser', () => {
  let out = '';
  const { deck, slides, id } = loadSlide();

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-extract-test-'));
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  async function nativeSlide(launched: LaunchedBrowser, workDir: string): Promise<ExtractResult> {
    return extractScenes({
      deckDir: DECK_DIR,
      document: { deck, slides },
      themes: ['light'],
      mode: 'native',
      slideIds: [id],
      workDir,
      browser: launched,
    });
  }

  test('the slide is audience and native auto mode uses the 3x page', () => {
    expect(id).toBe('audience');
  });

  test('an unflagged browser closes the 1x, 2x and 3x contexts when the theme is done', async () => {
    const launched = await launchBrowser();
    try {
      expect(isSingleProcessBrowser(launched.browser)).toBe(false);
      const result = await nativeSlide(launched, join(out, 'regular'));
      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0]?.rasters.some((r) => r.scale === 3)).toBe(true);
      expect(launched.browser.contexts()).toHaveLength(0);
    } finally {
      await launched.close();
    }
  }, 120_000);

  test('a browser flagged single-process keeps every context open, the 3x one included', async () => {
    const launched = await launchBrowser();
    try {
      markSingleProcessBrowser(launched.browser);
      expect(isSingleProcessBrowser(launched.browser)).toBe(true);
      const result = await nativeSlide(launched, join(out, 'single'));
      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0]?.rasters.some((r) => r.scale === 3)).toBe(true);
      // one theme: the 1x measure page, the 2x and the 3x shot pages, none closed
      const scales = launched.browser
        .contexts()
        .map((context) => context.pages()[0]?.viewportSize()?.width ?? 0);
      expect(launched.browser.contexts()).toHaveLength(3);
      expect(scales).toEqual([1600, 1600, 1600]);
    } finally {
      // Chrome for Testing closes cleanly; only the serverless shell is killed by pid
      await launched.close();
    }
  }, 120_000);
});

/** The five families of SPEC-5-amendments A7's deck: four proportional faces and one mono. */
const FIVE_FAMILIES: readonly FontId[] = [
  'roboto',
  'merriweather',
  'playfair-display',
  'jetbrains-mono',
  'oswald',
];

/**
 * The verifier's five family deck (VERIFICATION-5 section 6.2): a 16:10 page, one freeform slide,
 * five h2 headings each set in one catalog face through `typography.family`. Built here rather
 * than stored under decks/ because it needs no tool and the shape is five rows.
 */
function fiveFamilyDocument(): { deck: Deck; slides: Record<string, Slide> } {
  const deck = {
    schemaVersion: 1,
    id: 'five-families',
    title: 'Five families',
    theme: 'gt-ink-paper',
    page: { width: 1440, height: 900, preset: 'widescreen-16-10' },
    sections: [{ id: 'kinds', name: 'Kinds', slideIds: ['canvas'] }],
    assets: {},
    defaults: { appearance: 'light', counter: 'on' },
    revision: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
  } as unknown as Deck;
  const canvas = {
    schemaVersion: 1,
    id: 'canvas',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: FIVE_FAMILIES.map((family, i) => ({
        id: `t-${family}`,
        type: 'heading',
        level: 'h2',
        text: `The face ${family} on the sheet`,
        typography: { family },
        pos: { x: 120, y: 100 + 140 * i, w: 1200, h: 80, z: i },
      })),
    },
  } as unknown as Slide;
  return { deck, slides: { canvas } };
}

describe.skipIf(skip)('the capture draws the catalog faces a deck uses (A5 item 5)', () => {
  let out = '';
  let deckDir = '';
  const { deck, slides } = fiveFamilyDocument();

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-extract-fonts-'));
    // the deck has no assets, so an empty folder is its asset base
    deckDir = join(out, 'deck');
    await mkdir(deckDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  test("every heading measures in its own face and none in the sheet's Inter", async () => {
    const result = await extractScenes({
      deckDir,
      document: { deck, slides },
      themes: ['light'],
      mode: 'native',
      slideIds: ['canvas'],
      workDir: join(out, 'scenes'),
    });
    expect(result.scenes).toHaveLength(1);
    const scene = result.scenes[0];
    expect(scene).toBeDefined();
    if (!scene) return;
    for (const family of FIVE_FAMILIES) {
      const texts = scene.texts.filter((t) => t.blockId === `t-${family}`);
      expect(texts.length, `text objects of t-${family}`).toBeGreaterThan(0);
      const families = new Set(
        texts.flatMap((t) => t.lines.flatMap((line) => line.runs.map((run) => run.style.family))),
      );
      expect([...families], `the computed family of t-${family}`).toEqual([fontFamilyName(family)]);
    }
  }, 120_000);

  test('the Editable text file names the proportional faces in a:latin typeface', async () => {
    const result = await exportPptx({
      deckDir,
      document: { deck, slides },
      outDir: join(out, 'native'),
      mode: 'native',
      themes: ['light'],
      slideIds: ['canvas'],
    });
    expect(result.merged.passed).toBe(true);
    const path = result.files.find((f) => f.endsWith('-light.pptx')) ?? '';
    const zip = await openPackage(readFileSync(path));
    const parts = slideParts(zip);
    expect(parts).toHaveLength(1);
    const attrs = await readAllAttributes(zip);
    const typefaces = new Set(attrs[parts[0] ?? '']?.typefaces ?? []);
    // the four proportional faces travel by name; the mono face measures as 'JetBrains Mono'
    // (the row above) but pptx/text.ts familyFor writes the code panel's stack for a run whose
    // computed stack ends in monospace (B5's file; b1.md Fix round request 2 names the line), so
    // its typeface is not pinned here
    for (const family of ['roboto', 'merriweather', 'playfair-display', 'oswald'] as const)
      expect(typefaces.has(fontFamilyName(family)), `typeface ${fontFamilyName(family)}`).toBe(
        true,
      );
    // the residual names every face PowerPoint may substitute (A5 item 5)
    for (const family of ['roboto', 'merriweather', 'playfair-display', 'oswald'] as const)
      expect(
        result.merged.residual.some((line) =>
          line.startsWith(`font: ${fontFamilyName(family)} travels by name`),
        ),
        `residual line for ${fontFamilyName(family)}`,
      ).toBe(true);
  }, 120_000);
});
