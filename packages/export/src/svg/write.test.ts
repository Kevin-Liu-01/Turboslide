// writeSvg over a synthetic scene (gslides-parity SPEC-5 6.4; no browser): the root in the SVG
// namespace with the page's viewBox, one title and one desc, the text as one `<text>` per line
// with `<tspan>` per run carrying x, the baseline, textLength and lengthAdjust, the three text
// modes (embed's one `@font-face` style, outline's glyph paths with the string on aria-label,
// link's family names), the shape interpreter's path for a rounded rectangle, the sprite symbol
// for an icon and the mark, the raster as a data URI, and `checkSvg` reading every file as valid.
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { encodePngRgba } from '@turboslide/effects/io';
import type { Slide } from '@turboslide/schema/deck';

import { checkSvg, checkSvgFile, svgViewBox } from '../check/svg.ts';
import type { Scene, SceneStyle, SceneText } from '../scene/types.ts';
import { baselineOf, paintOf, writeSvg } from './write.ts';

const style: SceneStyle = {
  family: 'GT Inter Display',
  mono: false,
  weight: 500,
  size: 40,
  letterSpacing: -0.5,
  lineHeight: 48,
  color: 'rgb(7, 7, 7)',
  strike: false,
  features: '"cv11", "ss01"',
  align: 'left',
};

function text(id: string, blockId: string, x: number, y: number, words: string): SceneText {
  return {
    id,
    blockId,
    box: [x, y, 600, 48],
    textBox: [x, y, 600, 48],
    style,
    native: true,
    lines: [
      {
        box: [x, y, 600, 48],
        paragraph: 0,
        runs: [{ text: words, box: [x, y + 4, 580, 40], style }],
      },
      {
        box: [x, y + 48, 600, 48],
        paragraph: 1,
        runs: [{ text: 'Second line', box: [x, y + 52, 300, 40], style }],
      },
    ],
  };
}

const SPRITE =
  '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="gt-mark" viewBox="-8 214 1213 771"><path d="M0 0h10v10z"/></symbol><symbol id="i-check-circle" viewBox="0 0 20 20"><path d="M1 1h18v18z"/></symbol></svg>';

const slide = {
  schemaVersion: 1,
  id: 'a',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'heading',
        type: 'heading',
        level: 'h2',
        text: 'A heading',
        pos: { x: 137, y: 129, w: 600, h: 96, z: 1 },
      },
      {
        id: 'icon',
        type: 'icon',
        icon: 'check-circle',
        pos: { x: 1263, y: 160, w: 48, h: 48, z: 2 },
      },
    ],
  },
} as unknown as Slide;

function scene(rasterFile: string): Scene {
  return {
    slideId: 'a',
    n: 1,
    total: 3,
    theme: 'light',
    kind: 'content',
    title: 'A heading',
    sheet: [0, 0, 1600, 900],
    paper: 'rgb(255, 255, 255)',
    ink: 'rgb(7, 7, 7)',
    frame: {
      rules: [{ box: [56, 0, 1, 900], color: 'rgb(191, 191, 191)', width: 1, role: 'frame' }],
      crosses: [[50, 50, 12, 12]],
      crossColor: 'rgb(191, 191, 191)',
    },
    plates: [],
    chips: [[66, 858, 8, 8]],
    wordmark: [1474, 856, 28, 18],
    texts: [text('heading/text', 'heading', 137, 129, 'A heading')],
    rules: [],
    rects: [
      {
        box: [137, 300, 300, 120],
        fill: 'rgba(0, 0, 0, 0)',
        blockId: 'padded',
        role: 'shape',
        shape: 'roundRect',
        radius: 20,
        line: { color: 'rgb(7, 7, 7)', width: 1 },
      },
    ],
    lines: [
      {
        blockId: 'arrow',
        from: [800, 360],
        to: [1000, 360],
        color: 'rgb(7, 7, 7)',
        width: 1.5,
        heads: 'end',
      },
    ],
    rasters: [
      {
        id: 'icon:1',
        blockId: 'icon',
        kind: 'icon',
        selector: '[data-rid="icon:1"]',
        box: [1263, 160, 48, 48],
        alpha: true,
        scale: 3,
        file: rasterFile,
      },
      {
        id: 'photo:1',
        blockId: 'photo',
        kind: 'shot',
        selector: '[data-rid="photo:1"]',
        box: [800, 500, 400, 225],
        alpha: false,
        scale: 2,
        file: rasterFile,
      },
      {
        id: 'wordmark:1',
        blockId: 'wordmark',
        kind: 'mark',
        selector: '.wordmark',
        box: [1474, 856, 28, 18],
        alpha: true,
        scale: 3,
        file: rasterFile,
      },
    ],
    blocks: [
      { blockId: 'heading', type: 'heading', box: [137, 129, 600, 96], native: true },
      { blockId: 'padded', type: 'shape', box: [137, 300, 300, 120], native: true },
      { blockId: 'arrow', type: 'shape', box: [800, 350, 200, 20], native: true },
      { blockId: 'icon', type: 'icon', box: [1263, 160, 48, 48], native: false },
      { blockId: 'photo', type: 'picture', box: [800, 500, 400, 225], native: false },
    ],
    fonts: ['Inter'],
    warnings: [],
    page: { width: 1600, height: 900 },
    language: 'en-US',
  };
}

describe('the SVG writer', () => {
  let dir: string;
  let raster: string;
  const readFile = (path: string): Uint8Array | undefined => {
    try {
      return new Uint8Array(readFileSync(path));
    } catch {
      return undefined;
    }
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'turboslide-svg-'));
    const data = new Uint8Array(4 * 4 * 4).fill(128);
    raster = join(dir, 'raster.png');
    await writeFile(raster, await encodePngRgba({ width: 4, height: 4, data }));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the root, the title, the desc, the text lines and the shapes in embed mode', async () => {
    const out = writeSvg(scene(raster), {
      text: 'embed',
      sprite: SPRITE,
      slide,
      readFile,
      deckTitle: 'Deck',
      revision: 7,
    });
    const { svg } = out;
    expect(svg).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"',
    );
    expect(svg).toContain('data-ts-text="embed"');
    expect(svgViewBox(svg)).toEqual([0, 0, 1600, 900]);
    expect(svg.match(/<title\b/g)?.length).toBe(1);
    expect(svg).toContain('<title id="ts-title">A heading</title>');
    expect(svg.match(/<desc\b/g)?.length).toBe(1);
    expect(svg).toContain('<metadata>');
    // one text per line, a tspan per run on the baseline with its measured length
    expect(svg.match(/<text\b/g)?.length).toBe(2);
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
    expect(svg).toContain('textLength="580"');
    expect(svg).toContain('font-family="Inter"');
    expect(svg).toContain('font-weight="500"');
    expect(svg).toContain('letter-spacing="-0.5"');
    // the baseline: Inter's ascent under the inline box centred in the 48 px line at 40 px
    const baseline = baselineOf(scene(raster).texts[0]!.lines[0]!);
    expect(baseline).toBeCloseTo(
      129 + (48 - 40 * ((1984 + 494) / 2048)) / 2 + 40 * (1984 / 2048),
      3,
    );
    expect(svg).toContain(`y="${Math.round(baseline * 100) / 100}"`);
    // the one style element carries the @font-face alone
    expect(svg.match(/<style\b/g)?.length).toBe(1);
    expect(svg).toContain("@font-face { font-family: 'Inter'");
    expect(svg).toContain('src: url(data:font/woff2;base64,');
    // the rounded rectangle from the interpreter, the arrow, the icon and mark symbols, the raster
    expect(svg).toMatch(/<path d="M137,320 A20,20 0 0 1 157,300/);
    expect(svg).toContain('<line x1="800" y1="360" x2="1000" y2="360"');
    expect(svg).toContain('<use href="#i-check-circle"');
    expect(svg).toContain('<use href="#gt-mark"');
    expect(svg).toContain('<symbol id="i-check-circle"');
    expect(svg).toContain('<image href="data:image/png;base64,');
    expect(out.counts.symbols).toBe(2);
    expect(out.counts.images).toBe(1);
    const check = checkSvg(svg);
    expect(check.lines).toEqual([expect.stringMatching(/^svg: ok, embed text/)]);
    expect(check.ok).toBe(true);
    const path = join(dir, 'a.svg');
    await writeFile(path, svg);
    const file = await checkSvgFile(path, { page: { width: 1600, height: 900 } });
    expect(file.valid).toBe(true);
    expect(file.pageSize).toEqual({ cx: 1600 * 7620, cy: 900 * 7620 });
    const wrong = await checkSvgFile(path, { page: { width: 1200, height: 900 } });
    expect(wrong.valid).toBe(false);
  });

  it('draws glyph paths with the string on aria-label in outline mode', () => {
    const out = writeSvg(scene(raster), { text: 'outline', sprite: SPRITE, slide, readFile });
    expect(out.svg).not.toContain('<text');
    expect(out.svg).not.toContain('@font-face');
    expect(out.svg).toContain('aria-label="A heading"');
    expect(out.svg).toContain('data-weight="500"');
    expect(out.counts.paths).toBeGreaterThan(10);
    expect(out.residual.join(' ')).toContain('Regular master');
    const check = checkSvg(out.svg);
    expect(check.lines).toEqual([expect.stringMatching(/^svg: ok, outline text/)]);
  });

  it('names the families and inlines nothing in link mode', () => {
    const out = writeSvg(scene(raster), { text: 'link', sprite: SPRITE, slide, readFile });
    expect(out.svg).not.toContain('@font-face');
    expect(out.svg).toContain('font-family="Inter"');
    expect(out.svg.match(/<style\b/g)).toBeNull();
    expect(checkSvg(out.svg).ok).toBe(true);
    expect(out.bytes).toBeLessThan(
      writeSvg(scene(raster), { text: 'embed', sprite: SPRITE, slide, readFile }).bytes,
    );
  });

  it('refuses a script, an external reference, an undefined use target and a second title', () => {
    const bad =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-ts-text="link"><title>a</title><title>b</title><desc>d</desc><script>x()</script><image href="https://example.com/a.png"/><use href="#missing"/><rect onclick="x()"/></svg>';
    const check = checkSvg(bad);
    expect(check.ok).toBe(false);
    expect(check.lines).toEqual(
      expect.arrayContaining([
        'svg: the file carries a script element',
        'svg: the file carries an on* attribute',
        'svg: external reference https://example.com/a.png',
        'svg: use target #missing is not defined',
        'svg: 2 title element(s), expected one',
      ]),
    );
    expect(paintOf('rgba(0, 0, 0, 0)').paint).toBe('none');
    expect(paintOf('rgb(7, 7, 7)')).toEqual({ paint: 'rgb(7, 7, 7)' });
  });
});
