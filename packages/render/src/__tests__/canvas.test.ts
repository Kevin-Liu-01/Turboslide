// The canvas render cases of the Google Slides parity round two (gslides-parity SPEC-2 section 1,
// section 2, 11.5 "render snapshots"), in both themes: a converted slide of every kind of the GT
// deck beside its original (the conversion over the boxes the headless walk recorded), the
// picture object with a material recipe carrying `side` and the chips inside its wrapper, a
// material object at a box off 16:9 with its caption inside the box, the plate group, a rotated
// and flipped object, every mark, the bullet and numbered presets at four levels beside the round
// one `numbered: true` form, columns and spacing, a shape per category with text, every line kind
// and decoration, dashes, shadows, a background colour, trim, mask and adjust, a merged table and
// the three charts, through the export fixture deck of SPEC-2 11.2.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { toCanvas } from '@turboslide/schema/canvas';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import type { BlockContext } from '../blocks/context.ts';
import {
  DECORATION_MIN_LINE_PX,
  decorationCentered,
  decorationInset,
  decorationSize,
} from '../blocks/primitives.ts';
import { renderBlock } from '../blocks/render-block.ts';
import { renderRuns } from '../text.ts';
import { parseText } from '@turboslide/schema/text';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { contentSlide, deck as testDeck } from './fixtures.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const GT_DIR = join(REPO, 'decks/gt-brand');
const FIXTURE_DIR = join(REPO, 'decks/fixture/gslides');
const WALK_DIR = join(REPO, 'apps/cli/src/commands/__fixtures__/canvas-walk');
const themes: Theme[] = ['light', 'dark'];

function loadDeck(dir: string): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(dir, 'slides')))
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(dir, 'slides', file), 'utf8'),
    ) as Slide;
  return { deck, slides };
}

function options(theme: Theme, extra: Partial<RenderOptions> = {}): RenderOptions {
  return {
    theme,
    chrome: true,
    assetBase: 'decks/test/',
    blockAttrs: true,
    gtWord: true,
    ...extra,
  };
}

function context(theme: Theme, extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'canvas',
    theme,
    blockAttrs: true,
    gtWord: true,
    image: () => ({ src: 'assets/x.jpg', alt: 'x' }),
    assetUrl: (path) => path,
    slotWidth: 731.5,
    slide: { kind: 'content' },
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

/** The recorded boxes of the walk as the measurer's CanvasBoxes, per slide kind. */
function walkBoxes(slideId: string, slide: Slide): CanvasBoxes {
  const file = join(WALK_DIR, `${slideId}.json`);
  const record = JSON.parse(readFileSync(file, 'utf8')) as {
    objects: Record<string, { x: number; y: number; w: number; h: number }>;
  };
  const out: CanvasBoxes = { blocks: {}, prompted: [] };
  for (const [id, pos] of Object.entries(record.objects)) {
    const box: [number, number, number, number] = [pos.x, pos.y, pos.w, pos.h];
    if (id === 'picture' && slide.kind !== 'content') out.picture = box;
    else if (id === 'plate' && slide.kind !== 'content') out.plate = box;
    else if (id === 'mark' && (slide.kind === 'title' || slide.kind === 'closing')) out.mark = box;
    else out.blocks[id] = box;
  }
  return out;
}

const gtReady = existsSync(join(GT_DIR, 'deck.json')) && existsSync(WALK_DIR);
const fixtureReady = existsSync(join(FIXTURE_DIR, 'deck.json'));

describe.skipIf(!gtReady)(
  'a converted slide of every kind beside its original (SPEC-2 1.4)',
  () => {
    const { deck, slides } = loadDeck(GT_DIR);
    const walk = ['title', 'thesis', 'opener-brand', 'mood-earth', 'closing', 'content-rule'];
    for (const id of walk) {
      for (const theme of themes) {
        it(`renders ${id} and its canvas in ${theme}`, () => {
          const slide = slides[id];
          expect(slide).toBeDefined();
          if (!slide) return;
          const converted = toCanvas(slide, walkBoxes(id, slide));
          expect(converted).not.toBeNull();
          if (!converted) return;
          const original = renderSlide(deck, slide, options(theme));
          const canvas = renderSlide(deck, converted.slide, options(theme));
          expect(original.warnings).toEqual([]);
          expect(canvas.warnings).toEqual([]);
          expect({ original: original.html, canvas: canvas.html }).toMatchSnapshot();
          // every object sits in a .free wrapper at its recorded box, in paint order
          for (const block of converted.slide.slots.main ?? [])
            expect(canvas.html).toContain(`data-free="${block.id}"`);
        });
      }
    }

    it('draws the picture object of a converted picture kind at the bottom with the chips inside its wrapper', () => {
      const opener = slides['opener-brand'];
      if (!opener) throw new Error('no opener');
      const converted = toCanvas(opener, walkBoxes('opener-brand', opener));
      if (!converted) throw new Error('no conversion');
      const html = renderSlide(deck, converted.slide, options('light')).html;
      // the picture object first in paint order on the sheet layer, the chips after the image
      expect(html).toMatch(
        /<div class="free" data-free="picture" style="left:0px;top:0px;width:1600px;height:900px;z-index:1"><div class="picture" data-block="picture" data-type="picture"><img class="picture-img"[^>]*><\/div><div class="ts-chips" aria-hidden="true"><\/div><\/div>/,
      );
      // no chips at the slide level: the object holds them
      expect(html.match(/ts-chips/g)?.length).toBe(1);
      // the plate box and its children share the plate group
      expect(html.match(/data-group="plate"/g)?.length).toBe(4);
      // the picture object covers the sheet so it sits on the sheet layer, the plate inside the content box
      expect(html).toContain('<div class="freeform-sheet" style="left:-137px;top:-129px">');
      // a chips-free render draws none
      const still = renderSlide(deck, converted.slide, options('light', { chrome: false })).html;
      expect(still).not.toContain('ts-chips');
    });

    it('carries the material recipe with the plate side on a converted picture kind over a material asset (0.105)', () => {
      // the Prototemplate opener's photograph is a two-tone material capture
      const source = slides['opener-prototemplate'];
      if (!source || source.kind !== 'opener') throw new Error('no material opener');
      const boxes = walkBoxes('opener-brand', slides['opener-brand'] as Slide);
      const rename: CanvasBoxes = {
        blocks: {},
        prompted: [],
        picture: boxes.picture,
        plate: boxes.plate,
      };
      source.plate.blocks.forEach((block, i) => {
        const from = ['h', 'p1', 'credit'][i] ?? block.id;
        const box = boxes.blocks[from];
        if (box) rename.blocks[block.id] = box;
      });
      const converted = toCanvas(source, rename);
      if (!converted) throw new Error('no conversion');
      const html = renderSlide(deck, converted.slide, options('light', { live: true })).html;
      expect(html).toMatch(
        /<img class="picture-img"[^>]* data-recipe="[^"]*&quot;plate&quot;:&quot;lower-left&quot;[^"]*" data-live="1"/,
      );
      // the slot form of the same slide carries the same recipe on its img
      const grammar = renderSlide(deck, source, options('light', { live: true })).html;
      expect(grammar).toMatch(
        /<img class="opener-img"[^>]* data-recipe="[^"]*&quot;plate&quot;:&quot;lower-left&quot;[^"]*" data-live="1"/,
      );
    });

    it('keeps an unconverted slide byte identical to the round one markup (no background layer, no wrapper attributes)', () => {
      for (const id of walk) {
        const slide = slides[id];
        if (!slide) continue;
        const html = renderSlide(deck, slide, options('light')).html;
        expect(html).not.toContain('slide-bg');
        expect(html).not.toContain('data-rotate');
      }
    });
  },
);

describe.skipIf(!fixtureReady)('the export fixture deck of SPEC-2 11.2 in both themes', () => {
  const { deck, slides } = loadDeck(FIXTURE_DIR);
  const roundTwo = [
    'styles',
    'canvas-title',
    'canvas-opener',
    'rotated',
    'grouped',
    'shapes',
    'lines',
    'word-art',
    'shadow',
    'background-color',
    'background-picture',
    'image-tools',
    'table-merge',
    'chart-bar',
    'chart-line',
    'chart-pie',
    'diagram',
    'bullets',
    'spacing',
    'autofit',
  ];
  for (const id of roundTwo) {
    for (const theme of themes) {
      it(`renders ${id} in ${theme}`, () => {
        const slide = slides[id];
        expect(slide).toBeDefined();
        if (!slide) return;
        const rendered = renderSlide(deck, slide, options(theme));
        expect(rendered.warnings).toEqual([]);
        expect(rendered.html).toMatchSnapshot();
      });
    }
  }

  it('writes the rotation, the flip and the group on the wrapper and the transform inline (2.1.1 to 2.1.3)', () => {
    const html = renderSlide(deck, slides['rotated'] as Slide, options('light')).html;
    expect(html).toContain('z-index:2;transform:rotate(37deg)" data-rotate="37"');
    expect(html).toContain('transform:scale(-1, 1)" data-flip="h"');
    expect(html).toContain('transform:rotate(15deg)" data-rotate="15"');
    const grouped = renderSlide(deck, slides['grouped'] as Slide, options('light')).html;
    expect(grouped.match(/data-group="four"/g)?.length).toBe(4);
    const opener = renderSlide(deck, slides['canvas-opener'] as Slide, options('light')).html;
    expect(opener).toContain('data-rotate="3" data-group="plate"');
    // the trimmed picture object moved 40 px right keeps its frame and trim attributes
    expect(opener).toContain('data-trim="0.05,0.05,0,0"');
    expect(opener).toContain('left:-5.56%');
    // an object covering the sheet draws the chips only when it also starts the stack at 0,0
    expect(opener.match(/ts-chips/g)?.length ?? 0).toBe(0);
    const background = renderSlide(
      deck,
      slides['background-picture'] as Slide,
      options('light'),
    ).html;
    expect(background.match(/ts-chips/g)?.length).toBe(1);
  });

  it('draws every mark in the fixed order (7.2)', () => {
    const html = renderSlide(deck, slides['styles'] as Slide, options('light')).html;
    expect(html).toContain('<i>italic</i>');
    expect(html).toContain('<u>underlined</u>');
    expect(html).toContain('<s>struck through</s>');
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<span style="color:#12a37a">coloured</span>');
    expect(html).toContain('<mark style="background:#f0a020">highlighted</mark>');
    expect(html).toContain('text-align:justify');
    // adjacent runs sharing outer marks share the element; the order is b, i, u, s, sup, color, mark
    expect(renderRuns(parseText('*[a]{i}[b]{i}*'), { gtWord: true })).toBe('<b><i>ab</i></b>');
    expect(renderRuns(parseText('[x]{i u s sup c:red h:amber}'), { gtWord: true })).toBe(
      '<b></b>'.slice(0, 0) +
        '<i><u><s><sup><span style="color:#e5484d"><mark style="background:#f0a020">x</mark></span></sup></s></u></i>',
    );
    expect(renderRuns(parseText('plain'), { gtWord: true })).toBe('plain');
  });

  it('draws the bullet and numbered presets per level beside the round one form (2.2.12, 0.59)', () => {
    const html = renderSlide(deck, slides['bullets'] as Slide, options('light')).html;
    expect(html).toContain('class="plain marked bulleted"');
    expect(html).toContain('<span class="num glyph" data-num="bullets/items/0">●</span>');
    expect(html).toContain('<span class="num glyph" data-num="bullets/items/1">○</span>');
    expect(html).toContain('<span class="num glyph" data-num="bullets/items/2">■</span>');
    // level 4 draws level 1's glyph again, indented three steps
    expect(html).toContain(
      '<span class="item" data-level="4" style="padding-left:108px"><span class="num glyph" data-num="bullets/items/3">●</span>',
    );
    expect(html).toContain('class="plain marked numbered"');
    expect(html).toContain('<span class="num" data-num="numbers/items/0">1.</span>');
    expect(html).toContain('<span class="num" data-num="numbers/items/1">a.</span>');
    expect(html).toContain('<span class="num" data-num="numbers/items/2">i.</span>');
    expect(html).toContain('<span class="num" data-num="numbers/items/3">2.</span>');
    // the round one numbered form is untouched
    expect(html).toContain('<div class="plain numbered" data-block="ruled" data-type="plain">');
    expect(html).toContain('<span class="num" data-num="ruled/items/0">1</span>');
  });

  it('draws spacing, columns and indent as inline declarations (2.2.8 to 2.2.11)', () => {
    const html = renderSlide(deck, slides['spacing'] as Slide, options('light')).html;
    expect(html).toContain(
      'line-height:1.5;column-count:2;column-gap:40px;--para-before:12px;--para-after:12px',
    );
    expect(html).toContain('padding-left:64px');
  });

  it('draws the shape presets from shapePath with the text layer inside the text rectangle (2.3.1, 2.2.17)', () => {
    const html = renderSlide(deck, slides['shapes'] as Slide, options('light')).html;
    expect(html).toContain('data-shape="hexagon"');
    expect(html).toContain('data-shape="rightArrow"');
    expect(html).toContain('data-shape="wedgeRectCallout"');
    expect(html).toContain('data-adjust="-30000,70000"');
    expect(html).toContain('data-shape="mathPlus"');
    expect(html).toContain('data-shape="snip1Rect"');
    // the shape with text: one .shape-block root holding the svg and the layer
    expect(html).toMatch(
      /<div class="shape-block" data-block="hex" data-type="shape"><svg [^>]*data-shape="hexagon"[^>]*>.*?<\/svg><div class="shape-text" style="[^"]*display:flex;flex-direction:column;justify-content:center" data-run="hex\/text">Hexagon<\/div><\/div>/,
    );
    // the dashed ellipse
    expect(html).toContain('stroke-dasharray="8 6"');
  });

  it('draws every line kind with its decorations and the data the exporter reads (2.4)', () => {
    const html = renderSlide(deck, slides['lines'] as Slide, options('light')).html;
    expect(html).toContain('data-start="fillCircle" data-end="stealth"');
    expect(html).toContain('class="line-end"');
    // the decorations are medium DrawingML line ends for the 2 px stroke, three times the 0.7 mm
    // floor (9.92 px): the circle centred on the line's start, the stealth tip on its end, the
    // stroke stopping under each (b2.md, fix round)
    expect(decorationSize('fillCircle', 2)).toBeCloseTo(3 * DECORATION_MIN_LINE_PX, 6);
    expect(decorationSize('fillArrow', 4)).toBe(12);
    expect(decorationSize('none', 4)).toBe(0);
    expect(decorationCentered('fillCircle')).toBe(true);
    expect(decorationCentered('openDiamond')).toBe(true);
    expect(decorationCentered('stealth')).toBe(false);
    expect(decorationInset('fillCircle', 10)).toBe(5);
    expect(decorationInset('fillArrow', 10)).toBe(10);
    expect(html).toMatch(
      /<path class="line-end" d="M-5,-5 a5,5 0 1 0 0,10 a5,5 0 1 0 0,-10 Z" transform="translate\(0 4\) rotate\(-180\) translate\(4\.961 0\)"/,
    );
    expect(html).toMatch(
      /<path class="line-end" d="M0,0 L-10,-5 L-7,0 L-10,5 Z" transform="translate\(600 4\) rotate\(0\)"/,
    );
    expect(html).toContain('<line x1="4.961" y1="4" x2="590.079" y2="4"');
    expect(html).toContain('data-shape="elbow"');
    expect(html).toContain('data-bend="0.5"');
    expect(html).toMatch(/data-shape="elbow"[^>]*data-points="[^"]+"/);
    expect(html).toContain('data-shape="curved"');
    expect(html).toContain('data-shape="polyline"');
    expect(html).toMatch(/data-shape="curve"[^>]*data-closed="1"/);
    expect(html).toContain('data-shape="scribble"');
    expect(html).toContain('stroke-linejoin="round" stroke-linecap="round"');
    // the closed curve takes the fill, the open kinds none
    expect(html).toMatch(/<path d="M[^"]*Z" fill="var\(--plate\)"/);
  });

  it('draws word art, shadows and the background colour (2.2.16, 2.3.4, 2.6.1)', () => {
    const art = renderSlide(deck, slides['word-art'] as Slide, options('light')).html;
    expect(art).toContain('-webkit-text-stroke:2px var(--ink);paint-order:stroke fill');
    expect(art).toContain('class="text word-art"');
    const shadow = renderSlide(deck, slides['shadow'] as Slide, options('light')).html;
    expect(shadow).toContain(
      'box-shadow:5.66px 5.66px 12px color-mix(in srgb, var(--ink) 30%, transparent)',
    );
    expect(shadow).toContain(
      'filter:drop-shadow(0px 12px 10px color-mix(in srgb, var(--ink) 30%, transparent))',
    );
    expect(shadow).toContain('color-mix(in srgb, var(--ink) 50%, transparent)');
    const bg = renderSlide(deck, slides['background-color'] as Slide, options('light')).html;
    expect(bg).toContain('<div class="slide-bg" style="background:var(--plate)"></div>');
    const withDefault = renderSlide(
      { ...deck, defaults: { ...deck.defaults, background: { color: 'plate' } } },
      slides['styles'] as Slide,
      options('light'),
    ).html;
    expect(withDefault).toContain('slide-bg');
    // the deck default is not drawn on an unconverted picture kind (0.108)
    const openerSource: Slide = {
      schemaVersion: 1,
      id: 'o',
      kind: 'opener',
      sectionId: 'canvas',
      picture: { asset: 'fixture-photo', fit: 'cover' },
      plate: { side: 'lower-left', maxWidth: 740, blocks: [] },
    };
    expect(
      renderSlide(
        { ...deck, defaults: { ...deck.defaults, background: { color: 'plate' } } },
        openerSource,
        options('light'),
      ).html,
    ).not.toContain('slide-bg');
  });

  it('draws trim, mask and adjust on the picture object (2.5)', () => {
    const html = renderSlide(deck, slides['image-tools'] as Slide, options('light')).html;
    expect(html).toContain('data-trim="0.1,0.1,0.05,0.05"');
    expect(html).toContain('width:125%;height:111.11%;left:-12.5%;top:-5.56%');
    expect(html).toContain('data-mask="ellipse"');
    expect(html).toContain("clip-path:path('");
    expect(html).toContain('opacity:0.8;filter:brightness(1.2) contrast(1.1)');
    expect(html).toContain('border:1px solid var(--hair)');
  });

  it('draws the merged table in the grid form with per cell rules, fills and row heights (2.7)', () => {
    const html = renderSlide(deck, slides['table-merge'] as Slide, options('light')).html;
    expect(html).toContain('class="table grid"');
    expect(html).toContain('grid-template-rows:56px 56px 56px 56px');
    expect(html).toContain('--table-rule-style:dashed');
    expect(html).toContain('grid-row:span 2;grid-column:span 2');
    expect(html).toContain('data-span="2x2"');
    // the covered cells are not drawn: 16 cells less the 3 covered
    expect(html.match(/<span class="td/g)?.length).toBe(13);
    expect(html).toContain('background:var(--plate)');
    // the transparent border of one cell
    expect(html).toContain('border-bottom:0');
    expect(html).toContain('border-bottom:1px dashed var(--hair)');
  });

  it('draws the three charts as inline svg with the title as a run and the legend (2.8.1)', () => {
    const bar = renderSlide(deck, slides['chart-bar'] as Slide, options('light')).html;
    expect(bar).toContain('data-chart="bar"');
    expect(bar).toContain('<text class="title" data-run="chart/title"');
    expect(bar).toContain('<g class="legend">');
    expect(bar).toContain('1,000');
    expect(bar.match(/<rect /g)?.length).toBeGreaterThanOrEqual(24);
    const line = renderSlide(deck, slides['chart-line'] as Slide, options('light')).html;
    expect(line).toContain('data-chart="line"');
    expect(line.match(/<path class="series"/g)?.length).toBe(3);
    expect(line).toContain('class="value"');
    const pie = renderSlide(deck, slides['chart-pie'] as Slide, options('light')).html;
    expect(pie).toContain('data-chart="pie"');
    expect(pie.match(/<path d="M/g)?.length).toBe(4);
    expect(pie).toContain('>42%<');
  });

  it('draws a shape with text, valign and padding inside its inset (2.2.17 to 2.2.19) and aria-label from alt', () => {
    const html = renderSlide(deck, slides['canvas-title'] as Slide, options('light')).html;
    expect(html).toContain('aria-label="A rounded rectangle holding a short label"');
    expect(html).toContain('padding:8px 24px 8px 24px');
    expect(html).toContain('justify-content:center');
  });
});

describe('a material object off 16:9 keeps its caption inside the box (0.105)', () => {
  for (const theme of themes) {
    it(`renders the material object in ${theme}`, () => {
      const slide = contentSlide(
        'mat-canvas',
        { type: 'freeform' },
        {
          main: [
            {
              id: 'mat',
              type: 'material',
              materialId: 'paper:liquid-metal',
              asset: 'opener-brand',
              caption: 'A caption inside the box.',
              alt: 'A liquid metal frame',
              pos: { x: 200, y: 200, w: 600, h: 500, z: 0 },
            },
          ],
        },
      );
      const rendered = renderSlide(testDeck, slide, options(theme));
      expect(rendered.warnings).toEqual([]);
      expect(rendered.html).toMatchSnapshot();
      expect(rendered.html).toContain(
        'data-free="mat" style="left:63px;top:71px;width:600px;height:500px;z-index:1"',
      );
      expect(rendered.html).toContain(
        '<figcaption data-run="mat/caption">A caption inside the box.</figcaption>',
      );
    });
  }
});

describe('the round two blocks in a flow layout', () => {
  for (const theme of themes) {
    it(`renders a chart and a picture in a flow layout in ${theme}`, () => {
      const ctx = context(theme, {
        image: () => ({
          src: 'assets/p-light.jpg',
          light: 'assets/p-light.jpg',
          dark: 'assets/p-dark.jpg',
          alt: 'A photo',
          size: [1600, 900],
        }),
      });
      const picture: Block = { id: 'pic', type: 'picture', asset: 'p' };
      const html = renderBlock(picture, ctx);
      expect(html).toContain(
        '<div class="picture" style="width:731.5px;height:411px" data-block="pic" data-type="picture">',
      );
      expect(html).toContain('data-dark="assets/p-dark.jpg"');
      expect(ctx.rasters[0]?.kind).toBe('shot');
      const chart: Block = {
        id: 'c',
        type: 'chart',
        kind: 'bar',
        categories: ['A', 'B'],
        series: [{ name: 'S', values: [1, 2] }],
      };
      expect(renderBlock(chart, ctx)).toContain('viewBox="0 0 731.5 480"');
    });
  }
});
