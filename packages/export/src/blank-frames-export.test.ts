// One real Editable text export of a deck from Blank after its first write (Round 1 verification
// findings 4 and 12), through the browser the exporter measures with: the title slide converted
// the way the editor converts it, with the template's mark block that draws nothing and the text
// box the first write inserted, and a second slide with a table and a chart rotated 45 degrees.
// The written XML is read back: no object of slide 1 stands for the mark (no picture, no shape,
// no name), and the table's and the chart's graphic frames carry `rot` on their `p:xfrm`, so
// PowerPoint opens them turned as the editor and the PDF draw them. Runs where the Chrome for
// Testing binary exists; TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time
// (AGENTS.md).
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { resolveExecutable } from '@turboslide/headless/launch';
import type { Block } from '@turboslide/schema/blocks';
import { toCanvas } from '@turboslide/schema/canvas';
import { deckSchema, slideSchema } from '@turboslide/schema/deck';
import type { ContentSlide, Deck, Slide } from '@turboslide/schema/deck';

import { exportPptx } from './export-pptx.ts';
import type { ExportPptxResult } from './export-pptx.ts';
import { openPackage, readPart } from './ooxml/zip.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const BLANK = join(REPO, 'decks/templates/blank');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' || !existsSync(resolveExecutable().path);

function blankTitleAfterFirstWrite(): ContentSlide {
  const title: Slide = slideSchema.parse(
    JSON.parse(readFileSync(join(BLANK, 'slides', 'title.json'), 'utf8')),
  );
  const converted = toCanvas(title, {
    blocks: { heading: [137, 395.28125, 1326, 90], lead: [137, 511.03125, 901.453125, 38] },
    prompted: ['heading', 'lead'],
  });
  if (converted === null) throw new Error('the blank title converts');
  const text = {
    id: 'text',
    type: 'text',
    text: 'Hello from the first write',
    pos: { x: 300, y: 640, w: 700, h: 120, z: 3 },
  } as Block;
  return { ...converted.slide, slots: { main: [...(converted.slide.slots.main ?? []), text] } };
}

const turned: ContentSlide = {
  schemaVersion: 1,
  id: 'turned',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      {
        id: 'table',
        type: 'table',
        columns: [{ align: 'left' }, { align: 'right' }],
        rows: [{ cells: ['Region', 'Q1'], header: true }, { cells: ['North', '1,200'] }],
        pos: { x: 160, y: 300, w: 560, h: 160, z: 0, rotate: 45 },
      },
      {
        id: 'chart',
        type: 'chart',
        kind: 'bar',
        legend: 'none',
        numberFormat: 'plain',
        categories: ['Q1', 'Q2', 'Q3'],
        series: [{ name: 'Revenue', values: [12, 18, 9] }],
        pos: { x: 860, y: 240, w: 560, h: 360, z: 1, rotate: 45 },
      },
    ] as Block[],
  },
};

describe.skipIf(skip)('the Editable text file of a Blank deck after its first write', () => {
  let out = '';
  let result: ExportPptxResult;
  const parts = new Map<string, string>();

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-blank-frames-'));
    const base: Deck = deckSchema.parse(JSON.parse(readFileSync(join(BLANK, 'deck.json'), 'utf8')));
    const deck: Deck = {
      ...base,
      sections: [{ id: 'deck', name: 'Deck', slideIds: ['title', 'turned'] }],
    };
    result = await exportPptx({
      deckDir: BLANK,
      document: { deck, slides: { title: blankTitleAfterFirstWrite(), turned } },
      outDir: out,
      mode: 'native',
      themes: ['light', 'dark'],
      slideIds: ['title', 'turned'],
      fontsCatalog: loadFontsCatalog(),
    });
    for (const file of result.files) {
      const zip = await openPackage(new Uint8Array(readFileSync(file)));
      const theme = /-(light|dark)\.pptx$/.exec(file)?.[1] ?? file;
      parts.set(`${theme}/1`, await readPart(zip, 'ppt/slides/slide1.xml'));
      parts.set(`${theme}/2`, await readPart(zip, 'ppt/slides/slide2.xml'));
    }
  }, 600_000);

  afterAll(async () => {
    if (out !== '') await rm(out, { recursive: true, force: true });
  });

  test('slide 1 carries the text box and nothing for the mark, in both themes', () => {
    for (const theme of ['light', 'dark']) {
      const xml = parts.get(`${theme}/1`) ?? '';
      expect(xml, theme).toContain('Hello from the first write');
      expect(xml, theme).not.toMatch(/name="ts:title#mark[@"]/);
      const scene = result.scenes.find((s) => s.slideId === 'title' && s.theme === theme);
      expect(scene?.blocks.map((b) => b.blockId) ?? [], theme).not.toContain('mark');
      expect(scene?.rasters.map((r) => r.blockId) ?? [], theme).not.toContain('mark');
    }
  });

  test('the rotated table and chart carry rot on their graphic frames, in both themes', () => {
    for (const theme of ['light', 'dark']) {
      const xml = parts.get(`${theme}/2`) ?? '';
      const frame = (name: string): string => {
        const at = xml.indexOf(`name="${name}"`);
        expect(at, `${theme}: ${name}`).toBeGreaterThan(0);
        return xml.slice(
          xml.lastIndexOf('<p:graphicFrame>', at),
          xml.indexOf('</p:graphicFrame>', at),
        );
      };
      const table = frame('ts:turned#table');
      expect(table).toContain('<a:tbl>');
      expect(/<p:xfrm\b[^>]*>/.exec(table)?.[0], theme).toBe('<p:xfrm rot="2700000">');
      const chart = frame('ts:turned#chart');
      expect(chart).toContain('<c:chart ');
      expect(/<p:xfrm\b[^>]*>/.exec(chart)?.[0], theme).toBe('<p:xfrm rot="2700000">');
    }
    expect(
      result.merged.residual.some((line) =>
        /is rotated on the sheet; its graphic frame carries the rotation/.test(line),
      ),
    ).toBe(true);
  });
});
