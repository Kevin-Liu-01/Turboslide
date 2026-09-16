// buildOdp over synthetic scenes (gslides-parity SPEC-5 6.3; no browser): the package rules
// (mimetype first, stored, no extra field; the manifest complete), both modes' content (the
// Perfect page raster under invisible runs; Editable text frames, custom shapes with the
// interpreter's enhanced path, lines, tables, pictures), the transition and animation attribute
// names the ODF check reads, the language on the default style, the page size in the page layout,
// hidden slides and notes, and `checkOdp` reading it all back as valid.
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { encodePngRgba } from '@turboslide/effects/io';

import {
  checkOdp,
  checkOdf,
  checkOdfContainerBytes,
  firstEntryFacts,
  odfLengthEmu,
} from '../check/odf.ts';
import { openPackage, readPart } from '../ooxml/zip.ts';
import type { Scene, SceneStyle, SceneText } from '../scene/types.ts';
import { buildOdp } from './build.ts';
import { ODP_MIME } from './package.ts';
import { spdOf, transitionOf } from './motion.ts';
import { cssColor, odfText } from './xml.ts';

const style: SceneStyle = {
  family: 'Inter',
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
    ],
  };
}

function scene(slideId: string, n: number, extra: Partial<Scene> = {}): Scene {
  return {
    slideId,
    n,
    total: 2,
    theme: 'light',
    kind: 'content',
    title: `Slide ${n}`,
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
    texts: [text('heading/text', 'heading', 137, 129, 'A heading with  two spaces')],
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
      { box: [500, 300, 200, 120], fill: 'rgb(230, 230, 230)', blockId: 'plate', role: 'box' },
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
    rasters: [],
    blocks: [
      { blockId: 'heading', type: 'heading', box: [137, 129, 600, 48], native: true },
      { blockId: 'padded', type: 'shape', box: [137, 300, 300, 120], native: true },
      { blockId: 'plate', type: 'box', box: [500, 300, 200, 120], native: true },
      { blockId: 'arrow', type: 'shape', box: [800, 350, 200, 20], native: true },
    ],
    fonts: ['Inter'],
    warnings: [],
    page: { width: 1600, height: 900 },
    language: 'de-DE',
    ...extra,
  };
}

describe('the ODP writer', () => {
  let dir: string;
  let shot: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'turboslide-odp-'));
    // a 16 by 9 white sheet shot stands in for the 2x page raster
    const data = new Uint8Array(16 * 9 * 4).fill(255);
    const png = await encodePngRgba({ width: 16, height: 9, data });
    shot = join(dir, 'sheet.png');
    await writeFile(shot, png);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const readFile = (path: string): Uint8Array | undefined => {
    try {
      return new Uint8Array(readFileSync(path));
    } catch {
      return undefined;
    }
  };

  const base = {
    deckId: 'fixture',
    deckTitle: 'Fixture',
    revision: 3,
    theme: 'light' as const,
    fontSet: 'exact' as const,
    baseline: 'libreoffice' as const,
    page: { width: 1600, height: 900 },
    language: 'de-DE',
    readFile,
  };

  it('packages mimetype first, stored, with no extra field and a complete manifest', async () => {
    const built = await buildOdp([scene('a', 1), scene('b', 2)], { ...base, mode: 'native' });
    const first = firstEntryFacts(built.bytes);
    expect(first).toEqual({ name: 'mimetype', method: 0, extraLength: 0 });
    const zip = await openPackage(built.bytes);
    expect((await readPart(zip, 'mimetype')).trim()).toBe(ODP_MIME);
    const container = await checkOdfContainerBytes(built.bytes);
    expect(container.ok).toBe(true);
    expect(container.lines).toEqual([expect.stringMatching(/^container: ok/)]);
    const manifest = await readPart(zip, 'META-INF/manifest.xml');
    expect(manifest).toContain('manifest:full-path="content.xml"');
    expect(manifest).toContain('manifest:full-path="styles.xml"');
    expect(manifest).toContain(`manifest:media-type="${ODP_MIME}"`);
  });

  it('writes the page at the deck size with the language on the default style', async () => {
    const built = await buildOdp([scene('a', 1)], {
      ...base,
      mode: 'native',
      page: { width: 1200, height: 900 },
    });
    const zip = await openPackage(built.bytes);
    const styles = await readPart(zip, 'styles.xml');
    expect(styles).toContain('fo:page-width="25.4000cm"');
    expect(styles).toContain('fo:page-height="19.0500cm"');
    expect(odfLengthEmu('25.4000cm')).toBe(1200 * 7620);
    expect(styles).toContain('fo:language="de"');
    expect(styles).toContain('fo:country="DE"');
    expect(styles).toContain('style:print-orientation="landscape"');
  });

  it('writes Editable text as frames, custom shapes with the interpreter path, lines and the frame', async () => {
    const built = await buildOdp([scene('a', 1)], { ...base, mode: 'native' });
    const zip = await openPackage(built.bytes);
    const content = await readPart(zip, 'content.xml');
    expect(content).toContain('<draw:page draw:name="Slide 1"');
    expect(content).toContain('<draw:text-box>');
    expect(content).toContain(
      '<text:span text:style-name="T1">A heading with <text:s text:c="1"/>two spaces</text:span>',
    );
    expect(content).toContain('draw:type="ooxml-roundRect"');
    // the flags open the path: F on the unfilled rounded rectangle, S on the unstroked plate
    expect(content).toContain('draw:enhanced-path="F M ');
    expect(content).toContain('draw:enhanced-path="S M ');
    expect(content).toContain('draw:type="ooxml-rect"');
    expect(content).toContain('<draw:line ');
    expect(content).toContain('draw:marker-end="Arrow"');
    expect(content).toContain('fo:language="de" fo:country="DE"');
    expect(content).toContain('fo:font-size="24.00pt"');
    expect(content).not.toContain('loext:opacity="0%"');
    expect(built.counts).toMatchObject({ pages: 1, texts: 1, tables: 0 });
    expect(built.counts.shapes).toBeGreaterThanOrEqual(3);
    expect(built.slides[0]?.native).toContain('heading');
    const odf = await checkOdf(zip);
    expect(odf.lines).toEqual([expect.stringMatching(/^odf: ok/)]);
    // the rounded rectangle, the plate and the chip are the three custom shapes
    expect(odf.counts?.presets).toBe(3);
  });

  it('writes Perfect as one page raster under paper coloured runs at opacity 0', async () => {
    const built = await buildOdp([scene('a', 1, { sheetImage: shot })], {
      ...base,
      mode: 'flatten',
    });
    expect(built.perfect).toBe(true);
    expect(built.slides[0]?.page?.format).toBeDefined();
    const zip = await openPackage(built.bytes);
    const content = await readPart(zip, 'content.xml');
    expect(content).toContain('<draw:image xlink:href="Pictures/a-page.png"');
    expect(content).toContain('loext:opacity="0%"');
    expect(content).toContain('fo:color="#ffffff"');
    expect(content).not.toContain('draw:type="ooxml-roundRect"');
    const manifest = await readPart(zip, 'META-INF/manifest.xml');
    expect(manifest).toContain(
      'manifest:full-path="Pictures/a-page.png" manifest:media-type="image/png"',
    );
  });

  it('writes the transition and the animation tree with the attribute names the check reads', async () => {
    const animated = scene('a', 1, {
      transition: { kind: 'fade', durationMs: 500 },
      schedule: {
        slideId: 'a',
        hiddenAtStart: ['heading'],
        transition: { kind: 'fade', durationMs: 500 },
        skipped: [],
        steps: [
          {
            durationMs: 500,
            effects: [
              {
                animation: {
                  id: 'an1',
                  blockId: 'heading',
                  effect: 'fadeIn',
                  trigger: 'click',
                  durationMs: 500,
                },
                delayMs: 0,
                durationMs: 500,
              },
              {
                animation: {
                  id: 'an2',
                  blockId: 'padded',
                  effect: 'appear',
                  trigger: 'withPrevious',
                  durationMs: 500,
                },
                delayMs: 0,
                durationMs: 500,
              },
            ],
          },
        ],
      },
    });
    const gallery = scene('b', 2, { transition: { kind: 'gallery', durationMs: 1000 } });
    const built = await buildOdp([animated, gallery], { ...base, mode: 'native' });
    const zip = await openPackage(built.bytes);
    const content = await readPart(zip, 'content.xml');
    expect(content).toContain('smil:type="fade"');
    expect(content).toContain('smil:subtype="crossfade"');
    expect(content).toContain('presentation:transition-speed="fast"');
    expect(content).toContain('presentation:node-type="timing-root"');
    expect(content).toContain('presentation:node-type="main-sequence"');
    expect(content).toContain('presentation:node-type="on-click"');
    expect(content).toContain('presentation:node-type="with-previous"');
    expect(content).toContain('presentation:preset-id="ooo-entrance-fade-in"');
    expect(content).toContain('presentation:preset-id="ooo-entrance-appear"');
    expect(content).toContain('smil:attributeName="visibility" smil:to="visible"');
    expect(content).toContain('smil:attributeName="opacity" smil:values="0;1"');
    expect(content).toMatch(/smil:targetElement="id-a-heading-\d+"/);
    expect(built.counts.transitions).toBe(2);
    expect(built.counts.effects).toBe(2);
    // the gallery has no SMIL transition: a fade with the fallback row (the one admitted fallback)
    expect(built.rows.map((row) => row.code)).toContain('transition.fallback');
    expect(spdOf(1000)).toBe('medium');
    expect(transitionOf('x', { kind: 'slideLeft', durationMs: 2000 }).attributes).toMatchObject({
      'smil:type': 'slideWipe',
      'smil:subtype': 'fromLeft',
      'presentation:transition-speed': 'slow',
    });
    const odf = await checkOdf(zip);
    expect(odf.lines).toEqual([expect.stringMatching(/^odf: ok/)]);
  });

  it('marks a hidden slide, carries the notes and passes checkOdp as a file', async () => {
    const built = await buildOdp(
      [scene('a', 1, { notes: 'Say this.\nThen that.' }), scene('b', 2)],
      {
        ...base,
        mode: 'native',
        includeNotes: true,
        hidden: new Set(['b']),
      },
    );
    const zip = await openPackage(built.bytes);
    const content = await readPart(zip, 'content.xml');
    expect(content).toContain('presentation:visibility="hidden"');
    expect(content).toContain('<presentation:notes>');
    expect(content).toContain('Say this.');
    expect(built.counts.notes).toBe(1);
    const path = join(dir, 'fixture-light.odp');
    await writeFile(path, built.bytes);
    const check = await checkOdp(path);
    expect(check.issues).toEqual([]);
    expect(check.valid).toBe(true);
    expect(check.slides).toBe(2);
    expect(check.notes).toBe(1);
    expect(check.pageSizeOk).toBe(true);
    expect(check.container?.ok).toBe(true);
    expect(check.odf?.ok).toBe(true);
    const wrongPage = await checkOdp(path, { page: { width: 1200, height: 900 } });
    expect(wrongPage.valid).toBe(false);
    expect(wrongPage.issues[0]).toMatch(/^page size/);
  });

  it('converts CSS colours and writes ODF text', () => {
    expect(cssColor('rgb(7, 7, 7)')).toEqual({ hex: '#070707', alpha: 1 });
    expect(cssColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColor('rgba(255, 0, 0, 0.5)')).toEqual({ hex: '#ff0000', alpha: 0.5 });
    expect(cssColor('#abc')).toEqual({ hex: '#aabbcc', alpha: 1 });
    expect(odfText('a  b\tc <d>')).toBe('a <text:s text:c="1"/>b<text:tab/>c &lt;d&gt;');
  });
});
