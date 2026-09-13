// The canvas measurer in a real Chromium (gslides-parity SPEC-2 1.3, 11.5 `canvas-measure.test.ts`):
// `measureCanvas(page)` over the grammar sources of the fixture deck's `canvas-title` and
// `canvas-opener` equals the `pos` the fixture carries (the conversion the CLI wrote on the same
// function, docs/gslides-parity/build-2/b1.md), every selector of `CANVAS_SELECTORS` resolves on
// every slide kind, the fresh Title slide of `layouts.ts` `make` measures at the prompts' boxes
// with no zero height and `prompted` names `heading` and `lead` (0.97), and a figure slide
// measures after its twins decode, `awaitSheetReady` having been awaited. Runs where the Chrome
// for Testing binary exists; TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser, one page.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { renderDeck } from '@turboslide/render/deck';
import { CANVAS_SELECTORS } from '@turboslide/render/measure-dom';
import { loadThemeBundle } from '@turboslide/render/theme-node';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { ContentSlide, Deck, Slide } from '@turboslide/schema/deck';
import { LAYOUTS } from '@turboslide/schema/layouts';

import { openSheetPage } from './context.ts';
import type { SheetPage } from './context.ts';
import { fileUrl, writeTempDocument } from './document.ts';
import { launchBrowser, resolveExecutable } from './launch.ts';
import type { LaunchedBrowser } from './launch.ts';
import { measureCanvas, measureFit } from './measure.ts';
import { waitForReady } from './ready.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const DECK_DIR = join(REPO, 'decks/fixture/gslides');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !existsSync(join(DECK_DIR, 'deck.json'));

const READY = 'html[data-ts-ready="1"]';

function readSlide(id: string): Slide {
  return JSON.parse(readFileSync(join(DECK_DIR, 'slides', `${id}.json`), 'utf8')) as Slide;
}

function textOf(slide: ContentSlide, id: string): string {
  const block = (slide.slots.main ?? []).find((b) => b.id === id);
  if (!block) return '';
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'credit')
    return block.text;
  return '';
}

/** The grammar sources the fixture's canvas slides were converted from (build-2/b1.md). */
function sources(): { deck: Deck; slides: Slide[] } {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const canvasTitle = readSlide('canvas-title') as ContentSlide;
  const canvasOpener = readSlide('canvas-opener') as ContentSlide;
  const title: Slide = {
    schemaVersion: 1,
    id: 'title-source',
    kind: 'title',
    mark: { w: 132, h: 84 },
    heading: textOf(canvasTitle, 'heading'),
    lead: textOf(canvasTitle, 'lead'),
  };
  const opener: Slide = {
    schemaVersion: 1,
    id: 'opener-source',
    kind: 'opener',
    sectionId: 'canvas',
    picture: { asset: 'fixture-photo', fit: 'cover' },
    plate: {
      side: 'lower-left',
      maxWidth: 740,
      blocks: [
        { id: 'big', type: 'heading', level: 'big', text: textOf(canvasOpener, 'big') },
        {
          id: 'p',
          type: 'paragraph',
          text: textOf(canvasOpener, 'p'),
          measure: 56,
          marginTop: 14,
        },
        { id: 'credit', type: 'credit', text: textOf(canvasOpener, 'credit') },
      ],
    },
  };
  const fresh = LAYOUTS.find((entry) => entry.id === 'title')?.make('fresh-title', deck, 'canvas');
  if (!fresh) throw new Error('the Title slide layout did not make a slide');
  const figure: Slide = {
    schemaVersion: 1,
    id: 'figure-source',
    kind: 'content',
    layout: { type: 'cols', ratio: '5/7' },
    slots: {
      left: [{ id: 'h', type: 'heading', level: 'h2', text: 'A figure' }],
      right: [{ id: 'fig', type: 'shot', asset: 'fixture-photo', caption: 'The fixture photo.' }],
    },
  };
  const statement: Slide = {
    schemaVersion: 1,
    id: 'statement-source',
    kind: 'statement',
    big: 'One line, centred',
    measure: 32,
  };
  const mood: Slide = {
    schemaVersion: 1,
    id: 'mood-source',
    kind: 'mood',
    picture: { asset: 'fixture-photo', fit: 'cover' },
    plate: {
      side: 'lower-right',
      maxWidth: 560,
      blocks: [
        { id: 'h', type: 'heading', level: 'title', text: 'Mood' },
        { id: 'p1', type: 'paragraph', text: 'A caption.', marginTop: 12 },
        { id: 'credit', type: 'credit', text: 'Credit' },
      ],
    },
  };
  const closing: Slide = {
    schemaVersion: 1,
    id: 'closing-source',
    kind: 'closing',
    picture: { asset: 'fixture-photo', fit: 'cover' },
    plate: {
      side: 'upper-left',
      maxWidth: 720,
      blocks: [
        { id: 'h', type: 'heading', level: 'big', text: 'Thank you' },
        { id: 'p1', type: 'paragraph', text: 'The closing.', marginTop: 14 },
        { id: 'credit', type: 'credit', text: 'Credit' },
      ],
    },
    mark: { w: 138, h: 88 },
  };
  const slides: Slide[] = [title, opener, fresh, figure, statement, mood, closing];
  const withSection: Deck = {
    ...deck,
    sections: [{ id: 'canvas', name: 'Canvas', slideIds: slides.map((s) => s.id) }],
  };
  return { deck: withSection, slides };
}

describe.skipIf(skip)('measureCanvas in Chromium (SPEC-2 1.3)', () => {
  let launched: LaunchedBrowser | undefined;
  let sheetPage: SheetPage | undefined;
  let dir = '';
  let url = '';
  const measured = new Map<string, CanvasBoxes>();
  const fits = new Map<string, Awaited<ReturnType<typeof measureFit>>>();

  beforeAll(async () => {
    const { deck, slides } = sources();
    const rendered = renderDeck(deck, slides, {
      theme: 'light',
      bundle: loadThemeBundle(),
      chrome: true,
      assetBase: fileUrl(DECK_DIR, true),
      blockAttrs: true,
      gtWord: true,
      prompts: true,
      present: true,
      title: 'canvas measure',
    });
    expect(rendered.warnings).toEqual([]);
    dir = await mkdtemp(join(tmpdir(), 'turboslide-canvas-measure-'));
    const file = await writeTempDocument(rendered.html, 'canvas.html', dir);
    url = file.url;
    launched = await launchBrowser();
    sheetPage = await openSheetPage(launched.browser, { theme: 'light', scale: 1 });
    let first = true;
    for (const slide of slides) {
      const hash = `s/${encodeURIComponent(slide.id)}`;
      if (first) await sheetPage.page.goto(`${url}#${hash}`, { waitUntil: 'load' });
      else
        await sheetPage.page.evaluate((h) => {
          document.documentElement.removeAttribute('data-ts-ready');
          location.hash = h;
        }, hash);
      first = false;
      await sheetPage.page.waitForSelector(READY, { state: 'attached', timeout: 15_000 });
      const ready = await waitForReady(sheetPage.page);
      expect(ready.frames, slide.id).toBe('raf');
      expect(ready.brokenImages, slide.id).toEqual([]);
      measured.set(slide.id, await measureCanvas(sheetPage.page));
      fits.set(slide.id, await measureFit(sheetPage.page));
    }
  }, 120_000);

  afterAll(async () => {
    await sheetPage?.close();
    await launched?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  // The fixture's pos were written by the CLI's interim measurer at the pixel (build-2/b1.md);
  // the measurer answers at 1/64 px (measure-dom.ts MEASURE_PRECISION), so the comparison rounds
  // its answer the way that conversion did. Once schema/canvas.ts `boxPos` keeps the measured
  // value and the fixture is rewritten from it, the rounding here goes and the boxes are equal.
  const rounded = (box: [number, number, number, number] | undefined) =>
    (box ?? [0, 0, 0, 0]).map((v) => Math.round(v));

  test('the Title slide source measures to the pos the fixture carries', () => {
    const boxes = measured.get('title-source');
    const record = (readSlide('canvas-title') as ContentSlide).grammar?.boxes ?? {};
    expect(boxes).toBeDefined();
    for (const id of ['mark', 'heading', 'lead']) {
      const was = record[id];
      const box = id === 'mark' ? boxes?.mark : boxes?.blocks[id];
      expect(rounded(box), id).toEqual([was?.x, was?.y, was?.w, was?.h]);
    }
    expect(boxes?.prompted).toEqual([]);
    // the measured boxes are the layout's, at 1/64 px: the centred heading sits at a fraction
    expect((boxes?.blocks['heading']?.[1] ?? 0) % 1).not.toBe(0);
  });

  test('the Section header source measures to the pos the fixture carries', () => {
    const boxes = measured.get('opener-source');
    const record = (readSlide('canvas-opener') as ContentSlide).grammar?.boxes ?? {};
    expect(boxes?.picture).toEqual([0, 0, 1600, 900]);
    const plate = record['plate'];
    expect(rounded(boxes?.plate)).toEqual([plate?.x, plate?.y, plate?.w, plate?.h]);
    for (const id of ['big', 'p', 'credit']) {
      const was = record[id];
      expect(rounded(boxes?.blocks[id]), id).toEqual([was?.x, was?.y, was?.w, was?.h]);
    }
  });

  test('every selector resolves on every kind it names', () => {
    for (const id of ['opener-source', 'mood-source', 'closing-source']) {
      const boxes = measured.get(id);
      expect(boxes?.picture, `${id} picture`).toEqual([0, 0, 1600, 900]);
      expect(boxes?.plate, `${id} plate`).toBeDefined();
      expect((boxes?.plate ?? [0, 0, 0, 0])[2], `${id} plate width`).toBeGreaterThan(100);
    }
    expect(rounded(measured.get('closing-source')?.mark).slice(2)).toEqual([138, 88]);
    expect(rounded(measured.get('title-source')?.mark).slice(2)).toEqual([132, 84]);
    expect(measured.get('statement-source')?.blocks['big']).toBeDefined();
    expect(measured.get('statement-source')?.mark).toBeUndefined();
    expect(measured.get('statement-source')?.picture).toBeUndefined();
    // the names the renderer and the measurer share
    expect(Object.keys(CANVAS_SELECTORS).sort()).toEqual(
      [
        'block',
        'closingMark',
        'picture',
        'plate',
        'prompt',
        'slide',
        'stage',
        'titleMark',
        'wrapper',
      ].sort(),
    );
  });

  test('the fresh Title slide measures at the prompt boxes with no zero height (0.97)', () => {
    const boxes = measured.get('fresh-title');
    expect(boxes?.prompted.sort()).toEqual(['heading', 'lead']);
    for (const id of ['mark', 'heading', 'lead']) {
      const box = id === 'mark' ? boxes?.mark : boxes?.blocks[id];
      expect(box, id).toBeDefined();
      expect((box ?? [0, 0, 0, 0])[3], `${id} height`).toBeGreaterThan(0);
      expect((box ?? [0, 0, 0, 0])[2], `${id} width`).toBeGreaterThan(0);
    }
    // the prompt's box is where the stage draws the h1 and the lead of the fixture's title
    expect(boxes?.blocks['heading']?.[0]).toBe(137);
    expect(boxes?.blocks['lead']?.[0]).toBe(137);
    expect(rounded(boxes?.mark).slice(2)).toEqual([132, 84]);
    // the prompt is not content: the fit sees no text in the empty placeholders
    expect(fits.get('fresh-title')?.['heading']?.contentHeight).toBeUndefined();
  });

  test('a figure slide measures after its twins decode', () => {
    const boxes = measured.get('figure-source');
    const fig = boxes?.blocks['fig'];
    expect(fig).toBeDefined();
    // the shot fills the right column at 16:9: a decoded image has a height
    expect((fig ?? [0, 0, 0, 0])[3]).toBeGreaterThan(200);
    expect((fig ?? [0, 0, 0, 0])[2]).toBeGreaterThan(600);
  });

  test('measureFit reports the height a block needs and its font size', () => {
    const fit = fits.get('title-source');
    expect(fit?.['heading']?.fontSize).toBe(88);
    expect(fit?.['heading']?.contentHeight).toBeGreaterThan(80);
    expect(fit?.['lead']?.fontSize).toBe(26);
    expect(fit?.['heading']?.box).toEqual(rounded(measured.get('title-source')?.blocks['heading']));
  });
});
