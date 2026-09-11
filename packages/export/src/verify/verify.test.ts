import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { ExportReport } from '@turboslide/schema/export';
import type { Box, RenderRecord } from '@turboslide/schema/render';

import type { ShapeBounds } from '../ooxml/geometry.ts';
import { openPackage, listParts, readPart } from '../ooxml/zip.ts';
import {
  DEFAULT_BUDGETS,
  MIN_INK_CONTRAST,
  blockKind,
  mergeBudgets,
  withinBudget,
} from './budgets.ts';
import {
  BLOCK_MARGIN_PX,
  boxesIntersect,
  clampBox,
  compareBlock,
  cssColorOn,
  diffImages,
  farthestColor,
  inkBox,
  inkPast,
  modeColor,
  readPng,
  writePng,
} from './diff.ts';
import type { Png, Rgb } from './diff.ts';
import { buildFixturePptx } from './fixture.ts';
import { checkGeometry, geometryResidual } from './geometry.ts';
import { readReference, referenceImage, referenceRecord, turboslideCommand } from './reference.ts';
import { blocksOfRecord, shapeBoxFor, verifyPptx } from './report.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-verify-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A paper sheet with one ink rectangle, at 1x or 2x (the rect is given in 1x px). */
function sheet(
  rect: [number, number, number, number],
  paper = [255, 255, 255],
  ink = [7, 7, 7],
  scale: 1 | 2 = 1,
): Png {
  const width = 1600 * scale;
  const height = 900 * scale;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = paper[0] ?? 255;
    data[i * 4 + 1] = paper[1] ?? 255;
    data[i * 4 + 2] = paper[2] ?? 255;
    data[i * 4 + 3] = 255;
  }
  const [x, y, w, h] = rect.map((v) => v * scale) as [number, number, number, number];
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const p = (yy * width + xx) * 4;
      data[p] = ink[0] ?? 7;
      data[p + 1] = ink[1] ?? 7;
      data[p + 2] = ink[2] ?? 7;
    }
  }
  return { width, height, data };
}

/** Paints a rectangle (1x px) in `color` over an image. */
function paint(image: Png, rect: Box, color: readonly number[]): void {
  const [x, y, w, h] = rect;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const p = (yy * image.width + xx) * 4;
      image.data[p] = color[0] ?? 0;
      image.data[p + 1] = color[1] ?? 0;
      image.data[p + 2] = color[2] ?? 0;
    }
  }
}

/** A blank record for one slide with the given blocks, the shape verifyPptx reads from render.json. */
function record(
  slideId: string,
  theme: 'light' | 'dark',
  blocks: RenderRecord['blocks'],
  scale: 1 | 2 = 1,
): RenderRecord {
  return {
    deckId: 'fixture',
    slideId,
    revision: 3,
    theme,
    scale,
    image: `${slideId}-${theme}${scale === 2 ? '@2x' : ''}.png`,
    renderer: 'test',
    pageErrors: [],
    consoleErrors: [],
    overflow: [],
    blocks,
    fonts: { status: 'loaded', faces: [] },
    anchors: [],
    rasters: [],
    timing: { readyMs: 1, screenshotMs: 1 },
  };
}

describe('budgets', () => {
  it('classify block types and apply the SPEC 8.5 numbers', () => {
    expect(blockKind('heading')).toBe('text');
    expect(blockKind('rows')).toBe('text');
    expect(blockKind('dia')).toBe('line');
    expect(blockKind('shot')).toBe('raster');
    expect(blockKind('html')).toBe('raster');
    expect(DEFAULT_BUDGETS.text).toEqual({ dx: 3, dy: 1, dw: 3 });
    expect(DEFAULT_BUDGETS.line).toEqual({ dx: 1, dy: 1, dw: 1 });
    expect(DEFAULT_BUDGETS.flattenFraction).toBe(0.001);
    expect(DEFAULT_BUDGETS.threshold).toBe(0.1);
    expect(withinBudget({ dx: 3, dy: 1, dw: -3 }, DEFAULT_BUDGETS.text)).toBe(true);
    expect(withinBudget({ dx: 0, dy: 2, dw: 0 }, DEFAULT_BUDGETS.text)).toBe(false);
    expect(mergeBudgets({ text: { dx: 5, dy: 1, dw: 5 } }).text.dx).toBe(5);
    expect(mergeBudgets({ flattenFraction: 0.01 }).line).toEqual(DEFAULT_BUDGETS.line);
  });
});

describe('diff', () => {
  it('finds the ink box against the region background and measures a shift', () => {
    const ref = sheet([200, 300, 120, 40]);
    const got = sheet([202, 301, 121, 40]);
    const region = clampBox([190, 290, 140, 60], 1600, 900);
    expect(region).toEqual([190, 290, 140, 60]);
    // the whole region is mostly ink; the ring around the block is paper
    expect(modeColor(ref, region as [number, number, number, number])).toEqual([7, 7, 7]);
    expect(modeColor(ref, region as [number, number, number, number], [200, 300, 120, 40])).toEqual(
      [255, 255, 255],
    );
    expect(inkBox(ref, region as [number, number, number, number], [255, 255, 255])).toEqual([
      200, 300, 120, 40,
    ]);
    const text = compareBlock(ref, got, {
      blockId: 'h',
      type: 'heading',
      box: [200, 300, 120, 40],
    });
    expect(text).toMatchObject({
      dx: 2,
      dy: 1,
      dw: 1,
      ok: true,
      kind: 'text',
      background: [255, 255, 255],
    });
    const line = compareBlock(ref, got, { blockId: 'd', type: 'dia', box: [200, 300, 120, 40] });
    expect(line.ok).toBe(false);
    const blank = compareBlock(ref, got, {
      blockId: 'p',
      type: 'paragraph',
      box: [900, 100, 200, 50],
    });
    expect(blank).toMatchObject({ dx: 0, dy: 0, dw: 0, ok: true, refInk: null, gotInk: null });
    const missing = compareBlock(ref, sheet([1000, 100, 10, 10]), {
      blockId: 'h',
      type: 'heading',
      box: [200, 300, 120, 40],
    });
    expect(missing.ok).toBe(false);
    expect(missing.dw).toBe(-120);
  });

  it('measures glyph ink past the midpoint, so a hairline drawn at half intensity across two rows does not move a text block', () => {
    const box: Box = [200, 300, 120, 40];
    const white: Rgb = [255, 255, 255];
    // The diagram's lightest hairline (the --hair token, about 210 on paper) 4 px above the text,
    // inside the 6 px search ring; the page resamples the 2x raster and paints it on two rows at
    // half intensity, the case measured on positioning#dia1 and line-law#rows.
    const ref = sheet(box);
    paint(ref, [200, 296, 120, 1], [210, 210, 210]);
    const got = sheet(box);
    paint(got, [200, 295, 120, 2], [232, 232, 232]);
    const region = clampBox(box, 1600, 900, BLOCK_MARGIN_PX) as Box;
    // a fixed tolerance counts the hairline in the reference only and reports a 4 px shift
    expect(inkBox(ref, region, white, 40)?.[1]).toBe(296);
    expect(inkBox(got, region, white, 40)?.[1]).toBe(300);
    // the cut a third of the way from paper to the recorded ink leaves it out of both boxes and
    // keeps muted text (138, 143, 152) in
    const test = inkPast(white, [7, 7, 7]);
    expect(test(7, 7, 7)).toBe(true);
    expect(test(138, 143, 152)).toBe(true);
    expect(test(172, 172, 172)).toBe(true);
    expect(test(173, 173, 173)).toBe(false);
    expect(test(210, 210, 210)).toBe(false);
    expect(test(232, 232, 232)).toBe(false);
    const text = compareBlock(ref, got, {
      blockId: 'p',
      type: 'paragraph',
      box,
      color: 'rgb(7, 7, 7)',
    });
    expect(text).toMatchObject({
      dx: 0,
      dy: 0,
      dw: 0,
      ok: true,
      kind: 'text',
      ink: [7, 7, 7],
      clamped: false,
      shape: null,
      refInk: box,
      gotInk: box,
    });
    // without a recorded color the ink is the reference's farthest color inside the block's box
    expect(farthestColor(ref, box, white)).toEqual([7, 7, 7]);
    expect(compareBlock(ref, got, { blockId: 'p', type: 'paragraph', box })).toMatchObject({
      dy: 0,
      ink: [7, 7, 7],
    });
    // a recorded color that does not contrast with the background is not usable as the ink end,
    // and a muted recorded color (the first text node's) yields to the block's own darker ink
    expect(MIN_INK_CONTRAST).toBe(48);
    expect(
      compareBlock(ref, got, { blockId: 'p', type: 'paragraph', box, color: 'rgb(246, 246, 246)' }),
    ).toMatchObject({ dy: 0, ink: [7, 7, 7] });
    expect(
      compareBlock(ref, got, { blockId: 'p', type: 'paragraph', box, color: 'rgb(138, 143, 152)' }),
    ).toMatchObject({ dy: 0, ink: [7, 7, 7] });
    // translucent colors are composited on the background first
    expect(cssColorOn('rgba(7, 7, 7, 0.5)', white)).toEqual([131, 131, 131]);
    expect(cssColorOn('#070707', white)).toEqual([7, 7, 7]);

    // The same page in the dark theme: paper on ink, the hairline brighter than the paper.
    const dark: Rgb = [7, 7, 7];
    const refDark = sheet(box, dark, [246, 246, 246]);
    paint(refDark, [200, 296, 120, 1], [52, 52, 52]);
    const gotDark = sheet(box, dark, [246, 246, 246]);
    paint(gotDark, [200, 295, 120, 2], [30, 30, 30]);
    expect(inkBox(refDark, region, dark, 40)?.[1]).toBe(296);
    expect(
      compareBlock(refDark, gotDark, {
        blockId: 'p',
        type: 'paragraph',
        box,
        color: 'rgb(246, 246, 246)',
      }),
    ).toMatchObject({ dx: 0, dy: 0, dw: 0, ok: true, ink: [246, 246, 246], background: dark });
  });

  it('clamps the search to the block box when a neighbour overlaps the ring and carries the shape read back', () => {
    const textBox: Box = [200, 300, 120, 40];
    const diaBox: Box = [200, 290, 120, 8];
    const ref = sheet(textBox);
    paint(ref, [200, 290, 120, 1], [7, 7, 7]);
    paint(ref, [200, 296, 120, 1], [210, 210, 210]);
    const got = sheet(textBox);
    paint(got, [200, 290, 120, 1], [7, 7, 7]);
    paint(got, [200, 295, 120, 2], [232, 232, 232]);
    expect(boxesIntersect(diaBox, clampBox(textBox, 1600, 900, BLOCK_MARGIN_PX) as Box)).toBe(true);
    expect(boxesIntersect(diaBox, textBox)).toBe(false);
    const text = compareBlock(ref, got, {
      blockId: 'p',
      type: 'paragraph',
      box: textBox,
      color: 'rgb(7, 7, 7)',
      neighbours: [diaBox],
    });
    expect(text).toMatchObject({ dy: 0, ok: true, clamped: true, refInk: textBox });
    // the diagram is measured on its own darkest stroke; the faint hairline stays out of both boxes
    const dia = compareBlock(ref, got, {
      blockId: 'd',
      type: 'dia',
      box: diaBox,
      neighbours: [textBox],
      shape: [200.5, 289.69, 120, 8.3],
    });
    expect(dia).toMatchObject({
      dx: 0,
      dy: 0,
      dw: 0,
      ok: true,
      kind: 'line',
      clamped: true,
      ink: [7, 7, 7],
      refInk: [200, 290, 120, 1],
      gotInk: [200, 290, 120, 1],
      shape: [200.5, 289.69, 120, 8.3],
    });
    // the background comes from the ring with the neighbours left out
    expect(
      modeColor(ref, clampBox(textBox, 1600, 900, BLOCK_MARGIN_PX) as Box, [textBox, diaBox]),
    ).toEqual([255, 255, 255]);
  });

  it('measures an opaque picture on its edge, where the cut would follow its content', () => {
    // a grey photograph (its edge 55 units from the paper) with darker content inside; the page's
    // resampling moved the content, not the picture
    const box: Box = [200, 300, 120, 40];
    const ref = sheet(box, undefined, [200, 200, 200]);
    paint(ref, [210, 320, 100, 10], [7, 7, 7]);
    const got = sheet(box, undefined, [200, 200, 200]);
    paint(got, [210, 315, 100, 10], [7, 7, 7]);
    const edge = compareBlock(ref, got, { blockId: 'fig', type: 'shot', box, opaque: true });
    expect(edge).toMatchObject({
      dx: 0,
      dy: 0,
      dw: 0,
      ok: true,
      measure: 'edge',
      ink: null,
      refInk: box,
      gotInk: box,
    });
    const cut = compareBlock(ref, got, { blockId: 'fig', type: 'shot', box });
    expect(cut).toMatchObject({ dy: -5, ok: false, measure: 'cut', ink: [7, 7, 7] });
  });

  it('names the exported shapes of a block and unions their boxes in sheet px', () => {
    const shape = (name: string, off: [number, number], ext: [number, number]): ShapeBounds => ({
      part: 'ppt/slides/slide7.xml',
      id: 1,
      name,
      off,
      ext,
      inBounds: true,
    });
    const shapes = [
      shape('ts:positioning#h/text', [1043940, 2346040], [3999720, 368808]),
      shape('ts:positioning#dia1:1', [5574030, 2283638], [5574030, 2290648]),
      shape('ts:positioning#dia1:2', [5574030, 4574286], [76200, 76200]),
      shape('ts:positioning#dia10:1', [0, 0], [7620, 7620]),
      shape('ts:master#wordmark', [0, 0], [7620, 7620]),
    ];
    expect(shapeBoxFor(shapes, 'positioning', 'dia1')).toEqual([731.5, 299.69, 731.5, 310.61]);
    expect(shapeBoxFor(shapes, 'positioning', 'dia1', 2)).toEqual([1463, 599.38, 1463, 621.22]);
    expect(shapeBoxFor(shapes, 'positioning', 'h')).toBeNull();
    expect(shapeBoxFor(shapes, 'positioning', 'dia')).toBeNull();
  });

  it('runs pixelmatch at the threshold and reports the fraction', () => {
    const ref = sheet([200, 300, 120, 40]);
    const result = diffImages(ref, sheet([200, 300, 120, 40]));
    expect(result.mismatch).toBe(0);
    const shifted = diffImages(ref, sheet([210, 300, 120, 40]));
    // two 10 by 40 strips differ
    expect(shifted.mismatch).toBe(800);
    expect(shifted.fraction).toBeCloseTo(800 / 1_440_000, 8);
    expect(() => diffImages(ref, { width: 10, height: 10, data: new Uint8Array(400) })).toThrow(
      RangeError,
    );
  });

  it('writes and reads PNGs through the effects boundary', async () => {
    const path = join(tmp, 'roundtrip.png');
    await writePng(path, sheet([1, 1, 2, 2]));
    const back = await readPng(path);
    expect([back.width, back.height]).toEqual([1600, 900]);
    expect(back.data[(1 * 1600 + 1) * 4]).toBe(7);
    expect(back.data[0]).toBe(255);
  });
});

describe('fixture and geometry', () => {
  it('writes a package LibreOffice can open and the geometry read-back rejects an out-of-page shape', async () => {
    const bgPath = join(tmp, 'bg.png');
    await writePng(bgPath, sheet([100, 100, 300, 50]));
    const out = join(tmp, 'fixture.pptx');
    await buildFixturePptx({
      out,
      pages: [
        {
          background: bgPath,
          texts: [
            {
              name: 'h',
              text: 'Calibration',
              box: [137, 129, 1326, 48],
              sizePx: 44,
              lineHeightPx: 48.4,
              family: 'GT Inter Display',
              color: '070707',
              alpha: 0,
              letterSpacingPx: -1.1,
            },
          ],
          lines: [{ name: 'rule', box: [137, 436, 1326, 1], color: 'D2D2D2' }],
        },
        {
          paper: '070707',
          rects: [{ name: 'oob', box: [1500, 800, 200, 200], fill: 'F6F6F6' }],
        },
      ],
    });
    const zip = await openPackage(new Uint8Array(readFileSync(out)));
    const parts = listParts(zip);
    expect(parts).toContain('[Content_Types].xml');
    expect(parts).toContain('ppt/presentation.xml');
    expect(parts).toContain('ppt/slides/slide1.xml');
    expect(parts).toContain('ppt/slides/slide2.xml');
    expect(parts).toContain('ppt/media/image1.png');
    const slide1 = await readPart(zip, 'ppt/slides/slide1.xml');
    expect(slide1).toContain('sz="2640"');
    expect(slide1).toContain('spc="-66"');
    expect(slide1).toContain('<a:spcPts val="2904"/>');
    expect(slide1).toContain('<a:alpha val="0"/>');
    expect(slide1).toContain('<a:ln w="7620">');
    expect(slide1).toContain('<a:off x="1043940" y="982980"/>');
    const geometry = await checkGeometry(out);
    expect(geometry.pageSize).toEqual({ cx: 12192000, cy: 6858000 });
    expect(geometry.pageSizeOk).toBe(true);
    expect(geometry.slideParts).toBe(2);
    expect(geometry.inBounds).toBe(false);
    expect(geometry.outOfBounds.map((s) => s.name)).toEqual(['oob']);
    expect(geometry.normAutofitCount).toBe(0);
    expect(geometry.kernZeroCount).toBe(0);
    expect(geometryResidual(geometry)[0]).toContain('"oob" leaves the page');
  });
});

describe('verifyPptx', () => {
  it('fills the verify section from injected pages, gates flatten on the fraction and reads geometry back', async () => {
    const dir = join(tmp, 'export');
    const refDir = join(dir, 'reference');
    const refA = join(refDir, '01-a-light.png');
    const refB = join(refDir, '02-b-light.png');
    await writePng(refA, sheet([200, 300, 400, 60]));
    await writePng(refB, sheet([200, 300, 400, 60]));
    // flatten is verified at 2x (FLATTEN_REFERENCE_SCALE): the same sheets at 3200 by 1800
    const refA2 = join(refDir, '01-a-light@2x.png');
    const refB2 = join(refDir, '02-b-light@2x.png');
    await writePng(refA2, sheet([200, 300, 400, 60], undefined, undefined, 2));
    await writePng(refB2, sheet([200, 300, 400, 60], undefined, undefined, 2));
    const records: RenderRecord[] = ([1, 2] as const).flatMap((scale) =>
      ['a', 'b'].map((slideId, i) => ({
        deckId: 'fixture',
        slideId,
        revision: 3,
        theme: 'light' as const,
        scale,
        image: `0${i + 1}-${slideId}-light${scale === 2 ? '@2x' : ''}.png`,
        renderer: 'test',
        pageErrors: [],
        consoleErrors: [],
        overflow: [],
        blocks: {
          h: { type: 'heading', box: [200, 300, 400, 60], lines: 1, fontSize: 44, fontWeight: 500 },
        },
        fonts: { status: 'loaded', faces: [] },
        anchors: [],
        rasters: [],
        timing: { readyMs: 1, screenshotMs: 1 },
      })),
    );
    writeFileSync(join(refDir, 'render.json'), JSON.stringify(records));
    const pptx = join(dir, 'fixture-light.pptx');
    await buildFixturePptx({ out: pptx, pages: [{ background: refA2 }, { background: refB2 }] });
    const report: ExportReport = {
      deckId: 'fixture',
      revision: 3,
      format: 'pptx',
      mode: 'flatten',
      theme: 'light',
      fontSet: 'exact',
      fontSetVersion: 'test',
      files: [{ path: pptx, bytes: 1, sha256: 'x' }],
      fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
      slides: [
        { slideId: 'a', native: [], raster: ['h'] },
        { slideId: 'b', native: ['h'], raster: [] },
      ],
      geometryInBounds: true,
      perfect: false,
      passed: true,
      residual: [],
    };
    const reportPath = join(dir, 'export-report.json');
    writeFileSync(reportPath, JSON.stringify(report));
    // page 1 is the reference; page 2 is shifted 20 px (40 at 2x): 9600 pixels of 5.76 million,
    // over the 0.1 percent budget (5760)
    const gotB2 = join(dir, 'got-b@2x.png');
    await writePng(gotB2, sheet([220, 300, 400, 60], undefined, undefined, 2));
    const verified = await verifyPptx(reportPath, {
      referenceDir: refDir,
      deckDir: dir,
      renderPages: async () => ({
        pdf: join(dir, 'fake.pdf'),
        pages: [refA2, gotB2],
        versions: { soffice: 'injected', pdftocairo: null, pdftoppm: null },
        convertMs: 0,
        rasterMs: 0,
      }),
    });
    expect(verified.slides[0]?.verify).toMatchObject({ mismatch: 0, fraction: 0, scale: 2 });
    expect(verified.slides[0]?.verify?.blocks).toEqual([
      { blockId: 'h', dx: 0, dy: 0, dw: 0, ok: true },
    ]);
    // a report that predates the theme field leaves with every entry named after its file
    expect(verified.slides.map((s) => s.theme)).toEqual(['light', 'light']);
    expect(verified.slides[1]?.verify?.mismatch).toBe(9600);
    // block deltas are reported in sheet px
    expect(verified.slides[1]?.verify?.blocks[0]).toMatchObject({ dx: 20, ok: false });
    expect(verified.passed).toBe(false);
    expect(verified.geometryInBounds).toBe(true);
    expect(verified.residual.some((r) => r.includes('b (light) mismatches'))).toBe(true);
    expect(existsSync(join(dir, 'verify', 'verify-summary.json'))).toBe(true);
    expect(existsSync(join(dir, verified.slides[1]?.verify?.diff ?? ''))).toBe(true);
    const written = JSON.parse(readFileSync(reportPath, 'utf8')) as ExportReport;
    expect(written.passed).toBe(false);

    // native mode compares at 1x: slide a has a raster block and is not gated; slide b is all
    // native and fails
    report.mode = 'native';
    writeFileSync(reportPath, JSON.stringify(report));
    const gotB = join(dir, 'got-b.png');
    await writePng(gotB, sheet([220, 300, 400, 60]));
    const native = await verifyPptx(reportPath, {
      referenceDir: refDir,
      deckDir: dir,
      renderPages: async () => ({
        pdf: '',
        pages: [gotB, refB],
        versions: { soffice: 'injected', pdftocairo: null, pdftoppm: null },
        convertMs: 0,
        rasterMs: 0,
      }),
    });
    expect(native.slides[0]?.verify?.blocks[0]?.ok).toBe(false);
    expect(native.slides[1]?.verify?.blocks[0]?.ok).toBe(true);
    expect(native.slides[1]?.verify?.scale).toBe(1);
    expect(native.passed).toBe(true);
    expect(native.residual.some((r) => r.includes('has raster blocks h'))).toBe(true);
  });

  it('keeps regenerated picture regions out of the render comparison and gates them on the sheet shot', async () => {
    const dir = join(tmp, 'export-picture');
    const refDir = join(dir, 'reference');
    // the browser reference shows a soft picture (grey) where the sheet shot carries the crisp dither (ink)
    const ref = join(refDir, '01-a-light@2x.png');
    await writePng(ref, sheet([100, 100, 200, 100], undefined, [128, 128, 128], 2));
    const shot = join(dir, 'work', 'sheets', 'light', '01-a@2x.png');
    await writePng(shot, sheet([100, 100, 200, 100], undefined, [7, 7, 7], 2));
    const records: RenderRecord[] = [
      {
        deckId: 'fixture',
        slideId: 'a',
        revision: 3,
        theme: 'light',
        scale: 2,
        image: '01-a-light@2x.png',
        renderer: 'test',
        pageErrors: [],
        consoleErrors: [],
        overflow: [],
        blocks: {},
        fonts: { status: 'loaded', faces: [] },
        anchors: [],
        rasters: [],
        timing: { readyMs: 1, screenshotMs: 1 },
      },
    ];
    writeFileSync(join(refDir, 'render.json'), JSON.stringify(records));
    const pptx = join(dir, 'fixture-light.pptx');
    await buildFixturePptx({ out: pptx, pages: [{ background: shot }] });
    const report: ExportReport = {
      deckId: 'fixture',
      revision: 3,
      format: 'pptx',
      mode: 'flatten',
      theme: 'light',
      fontSet: 'exact',
      fontSetVersion: 'test',
      files: [{ path: pptx, bytes: 1, sha256: 'x' }],
      fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
      slides: [
        {
          slideId: 'a',
          native: [],
          raster: [],
          sheet: 'work/sheets/light/01-a@2x.png',
          pictures: [{ box: [100, 100, 200, 100], regenerated: true }],
        },
      ],
      geometryInBounds: true,
      perfect: false,
      passed: true,
      residual: [],
    };
    const reportPath = join(dir, 'export-report.json');
    writeFileSync(reportPath, JSON.stringify(report));
    const pages = async () => ({
      pdf: '',
      pages: [shot],
      versions: { soffice: 'injected', pdftocairo: null, pdftoppm: null },
      convertMs: 0,
      rasterMs: 0,
    });
    const verified = await verifyPptx(reportPath, {
      referenceDir: refDir,
      deckDir: dir,
      renderPages: pages,
    });
    const v = verified.slides[0]?.verify;
    // outside the picture nothing differs; inside, the page equals the embedded sheet
    expect(v).toMatchObject({
      mismatch: 0,
      fraction: 0,
      pictureMismatch: 0,
      pictureFraction: 0,
      scale: 2,
    });
    expect(verified.passed).toBe(true);
    expect(verified.residual.some((r) => r.includes('regenerated two-tone picture'))).toBe(true);
    // without a regenerated flag the region counts against the render and the slide fails
    report.slides[0]!.pictures = [{ box: [100, 100, 200, 100], regenerated: false }];
    writeFileSync(reportPath, JSON.stringify(report));
    const plain = await verifyPptx(reportPath, {
      referenceDir: refDir,
      deckDir: dir,
      renderPages: pages,
    });
    expect(plain.slides[0]?.verify?.mismatch).toBe(400 * 200);
    expect(plain.passed).toBe(false);
  });

  it('pairs each file with the slide entries of its theme, not with their position', async () => {
    const dir = join(tmp, 'export-themed');
    const refDir = join(dir, 'reference');
    const box: Box = [200, 300, 400, 60];
    const light = join(refDir, 'b-light.png');
    const dark = join(refDir, 'a-dark.png');
    await writePng(light, sheet(box));
    await writePng(dark, sheet(box, [7, 7, 7], [246, 246, 246]));
    const blocks: RenderRecord['blocks'] = {
      h: { type: 'heading', box, lines: 1, fontSize: 44, fontWeight: 500 },
    };
    writeFileSync(
      join(refDir, 'render.json'),
      JSON.stringify([record('a', 'dark', blocks), record('b', 'light', blocks)]),
    );
    const lightPptx = join(dir, 'fixture-light.pptx');
    const darkPptx = join(dir, 'fixture-dark.pptx');
    await buildFixturePptx({ out: lightPptx, pages: [{ background: light }] });
    await buildFixturePptx({ out: darkPptx, pages: [{ background: dark }] });
    // the merged report lists the dark entry first while the light file comes first
    const report: ExportReport = {
      deckId: 'fixture',
      revision: 3,
      format: 'pptx',
      mode: 'native',
      theme: 'light',
      fontSet: 'exact',
      fontSetVersion: 'test',
      files: [
        { path: lightPptx, bytes: 1, sha256: 'x' },
        { path: darkPptx, bytes: 1, sha256: 'x' },
      ],
      fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
      slides: [
        { slideId: 'a', theme: 'dark', native: ['h'], raster: [] },
        { slideId: 'b', theme: 'light', native: ['h'], raster: [] },
      ],
      geometryInBounds: true,
      perfect: false,
      passed: true,
      residual: [],
    };
    const reportPath = join(dir, 'export-report.json');
    writeFileSync(reportPath, JSON.stringify(report));
    const verified = await verifyPptx(reportPath, {
      referenceDir: refDir,
      deckDir: dir,
      renderPages: async (pptx) => ({
        pdf: '',
        pages: [pptx === lightPptx ? light : dark],
        versions: { soffice: 'injected', pdftocairo: null, pdftoppm: null },
        convertMs: 0,
        rasterMs: 0,
      }),
    });
    expect(verified.passed).toBe(true);
    expect(verified.slides[0]?.verify?.ref).toMatch(/a-dark\.png$/);
    expect(verified.slides[1]?.verify?.ref).toMatch(/b-light\.png$/);
    expect(verified.slides.every((s) => s.verify?.blocks[0]?.ok)).toBe(true);
    expect(verified.residual.some((r) => r.includes('no reference render'))).toBe(false);
  });

  it('reads references and names the CLI', () => {
    const set = readReference(join(tmp, 'export', 'reference'));
    expect(set?.records).toHaveLength(4);
    const record = set ? referenceRecord(set, 'a', 'light') : undefined;
    expect(record?.slideId).toBe('a');
    expect(set && record ? referenceImage(set, record) : '').toMatch(/01-a-light\.png$/);
    expect(
      blocksOfRecord({
        ...(record as RenderRecord),
        blocks: {
          h: { type: 'heading', box: [0, 0, 1, 1] },
          'list/0': { type: 'row', box: [0, 0, 1, 1] },
        },
      }),
    ).toHaveLength(1);
    expect(turboslideCommand({ TURBOSLIDE_BIN: '/x/turboslide' })).toEqual(['/x/turboslide']);
    const cmd = turboslideCommand({});
    expect(cmd.length).toBeGreaterThan(0);
  });
});
