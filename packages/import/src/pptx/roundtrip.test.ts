// The round trip gate (gslides-parity SPEC-5 5.4, 16.3; R04 7, 10 test 4): fixture 05 is the
// exporter's Editable text file of `decks/fixture/gslides` and 05b its Perfect file. Reading 05
// back gives every slide of the fixture under its own id and title, every canvas block of the
// fixture under its own id with its plain text and its box within 1 px, every table cell and
// chart value equal, and the object names' ids recovered without `import-ids.json`; the Perfect
// file's page raster is dropped with its row and the text layer imported at full alpha; the
// second pass (the imported deck exported again and read back) adds no report row the first pass
// did not write. The second pass runs the exporter, so it is the slow test of the package.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideOrder } from '@turboslide/schema/deck';
import { plainText } from '@turboslide/schema/text';
import { exportPptx } from '@turboslide/export/export-pptx';
import { loadFontsCatalog } from '@turboslide/export/pptx/fonts-map';
import { loadDeckDir } from '@turboslide/store/file-store';

import { fixtureBytes } from './__tests__/unzip.ts';
import type { ImportedDocument } from './import-pptx.ts';
import { importPptxBytes, writeImportedDeck } from './read.ts';
import { ROW_CODES } from './report.ts';

const FIXTURE_DECK = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'decks',
  'fixture',
  'gslides',
);
const FIXED_NOW = '2026-09-15T00:00:00.000Z';

let source: DeckDocument;
let first: ImportedDocument;
let perfect: ImportedDocument;

function blocksOf(slide: Slide | undefined): Block[] {
  return slide !== undefined && slide.kind === 'content' ? (slide.slots.main ?? []) : [];
}

/** The texts a block carries, as plain strings (the markup stripped), for the equality gate. */
function textsOf(block: Block): string[] {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'text':
    case 'credit':
      return [plainText(block.text)];
    case 'box':
    case 'shape':
      return block.text === undefined ? [] : [plainText(block.text)];
    case 'plain':
      return block.items.map((item) => plainText(item.text));
    case 'table':
      return block.rows.flatMap((row) => row.cells.map((cell) => plainText(cell)));
    default:
      return [];
  }
}

beforeAll(async () => {
  source = loadDeckDir(FIXTURE_DECK).document;
  first = await importPptxBytes(fixtureBytes('05-roundtrip.pptx'), {
    fileName: '05-roundtrip.pptx',
    into: 'rt',
    now: () => FIXED_NOW,
  });
  perfect = await importPptxBytes(fixtureBytes('05b-roundtrip-perfect.pptx'), {
    fileName: '05b-roundtrip-perfect.pptx',
    into: 'rt-perfect',
    now: () => FIXED_NOW,
  });
});

describe('fixture 05, the Editable text round trip', () => {
  it('recognises the exporter and gives every slide back under its own id and title, in order', () => {
    const exported = slideOrder(source.deck).filter((id) => source.slides[id]?.skip !== true);
    expect(first.slides.map((slide) => slide.id)).toEqual(exported);
    for (const slide of first.slides) {
      const original = source.slides[slide.id];
      expect(original, slide.id).toBeDefined();
      const title = original?.title;
      if (title !== undefined) expect(slide.title).toBe(title);
    }
    // the exporter writes no p14:sectionLst (recorded in b3.md), so the deck has one section named after the file's title
    if ((first.report.source.sections ?? 0) > 0)
      expect(first.deck.sections.map((section) => section.name)).toEqual(
        source.deck.sections
          .filter((s) => s.slideIds.some((id) => exported.includes(id)))
          .map((section) => section.name),
      );
    else expect(first.deck.sections).toHaveLength(1);
    expect(
      first.report.rows.filter((row) => row.code === ROW_CODES.masterChrome).length,
    ).toBeGreaterThan(0);
    expect(first.report.rows.some((row) => row.code === ROW_CODES.perfectRaster)).toBe(false);
  });

  it('gives every canvas block back under its own id with its text and its box within 1 px', () => {
    let compared = 0;
    let worst = 0;
    for (const slide of first.slides) {
      const original = source.slides[slide.id];
      if (
        original === undefined ||
        original.kind !== 'content' ||
        original.layout.type !== 'freeform'
      )
        continue;
      const back = new Map(blocksOf(slide).map((block) => [block.id, block]));
      for (const block of blocksOf(original)) {
        if (
          block.type === 'rows' ||
          block.type === 'plain' ||
          block.type === 'dia' ||
          block.type === 'mark' ||
          block.type === 'material' ||
          block.type === 'html'
        )
          continue;
        // the spline kinds are sampled both ways (Catmull-Rom out, a polyline in), so their boxes are the samples' (b3.md 8.6)
        if (block.type === 'shape' && (block.shape === 'curve' || block.shape === 'scribble'))
          continue;
        // a page covering picture is written either as the slide background (`p:bg`, back as the
        // `background` block) or as a picture inset by the frame rails (40 px; b3.md 8.6)
        if (block.type === 'picture' && block.pos !== undefined && block.pos.w >= 1600) {
          const asBackground = back.get('background');
          const asPicture = back.get(block.id);
          expect(
            asBackground?.type === 'picture' || asPicture?.type === 'picture',
            `${slide.id}/${block.id} came back`,
          ).toBe(true);
          if (asPicture?.pos !== undefined)
            expect(Math.abs(asPicture.pos.w - block.pos.w)).toBeLessThanOrEqual(40);
          continue;
        }
        const found = back.get(block.id);
        expect(found, `${slide.id}/${block.id} came back`).toBeDefined();
        if (found === undefined || block.pos === undefined || found.pos === undefined) continue;
        // a line is written as a zero height connector at its centre, so the centre line is what holds
        const isLine =
          block.type === 'shape' && (block.shape === 'line' || block.shape === 'arrow');
        if (isLine) {
          const axis = block.pos.h <= block.pos.w ? 'y' : 'x';
          const extent = axis === 'y' ? 'h' : 'w';
          const centre = block.pos[axis] + block.pos[extent] / 2;
          const backCentre = found.pos[axis] + found.pos[extent] / 2;
          expect(
            Math.abs(backCentre - centre),
            `${slide.id}/${block.id} centre`,
          ).toBeLessThanOrEqual(1);
          const along = axis === 'y' ? 'x' : 'y';
          const length = axis === 'y' ? 'w' : 'h';
          expect(Math.abs(found.pos[along] - block.pos[along])).toBeLessThanOrEqual(1);
          expect(Math.abs(found.pos[length] - block.pos[length])).toBeLessThanOrEqual(1);
          compared += 1;
          continue;
        }
        // the exporter writes a text box at its measured text height and offsets it for the first
        // baseline (scene/extract.ts, pptx/baseline.ts), so a text block's y and h are the text's,
        // recorded in b3.md, while x and w hold to 1 px on every block
        const textLike =
          block.type === 'heading' ||
          block.type === 'paragraph' ||
          block.type === 'text' ||
          block.type === 'credit';
        for (const key of ['x', 'y', 'w', 'h'] as const) {
          if ((key === 'h' || key === 'y') && textLike) continue;
          const delta = Math.abs(found.pos[key] - block.pos[key]);
          worst = Math.max(worst, delta);
          expect(
            delta,
            `${slide.id}/${block.id} ${key}: ${found.pos[key]} against ${block.pos[key]}`,
          ).toBeLessThanOrEqual(1);
        }
        if ((block.pos.rotate ?? 0) !== 0)
          expect(found.pos.rotate).toBeCloseTo(block.pos.rotate ?? 0, 0);
        const texts = textsOf(block);
        const backTexts = textsOf(found);
        if (texts.length > 0 && found.type !== 'picture')
          expect(backTexts.join('\n')).toBe(texts.join('\n'));
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(20);
    // recorded in b3.md as the worst position delta of the round trip
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('gives every table cell and chart value back', () => {
    let tables = 0;
    let charts = 0;
    for (const slide of first.slides) {
      const original = source.slides[slide.id];
      if (original === undefined) continue;
      const back = blocksOf(slide);
      for (const block of slideBlocks(original).map((row) => row.block)) {
        if (block.type === 'table') {
          const found = back.find((b) => b.type === 'table');
          expect(found?.type).toBe('table');
          if (found?.type === 'table') {
            expect(found.rows.map((row) => row.cells.map((cell) => plainText(cell)))).toEqual(
              block.rows.map((row) => row.cells.map((cell) => plainText(cell))),
            );
            expect(found.spans ?? []).toEqual(expect.arrayContaining(block.spans ?? []));
            tables += 1;
          }
        }
        if (block.type === 'chart') {
          const found = back.find((b) => b.type === 'chart');
          expect(found?.type).toBe('chart');
          if (found?.type === 'chart') {
            expect(found.kind).toBe(block.kind);
            expect(found.categories).toEqual(block.categories);
            expect(found.series.map((s) => s.values)).toEqual(block.series.map((s) => s.values));
            charts += 1;
          }
        }
      }
    }
    expect(tables).toBeGreaterThanOrEqual(2);
    expect(charts).toBeGreaterThanOrEqual(3);
  });

  it('gives the grammar slides their texts back', () => {
    for (const slide of first.slides) {
      const original = source.slides[slide.id];
      if (
        original === undefined ||
        (original.kind === 'content' && original.layout.type === 'freeform')
      )
        continue;
      const backTexts = blocksOf(slide).flatMap(textsOf).join('\n');
      const expected: string[] = [];
      if (original.kind === 'title')
        expected.push(plainText(original.heading), plainText(original.lead));
      else if (original.kind === 'statement') expected.push(plainText(original.big));
      else if (original.kind === 'content')
        for (const block of Object.values(original.slots).flat())
          if (block !== undefined) expected.push(...textsOf(block));
      const flat = (value: string): string => value.replace(/[\s\u00a0]+/g, ' ').trim();
      for (const text of expected.filter((t) => t.trim() !== '')) {
        // a soft line break in the source becomes a paragraph break (R04 5.2); the exporter's nowrap spaces read as spaces
        expect(flat(backTexts)).toContain(flat(text));
      }
    }
  });

  it('accounts for every content object once', () => {
    const { imported, dropped } = first.report.summary;
    expect(imported + dropped).toBe(first.shapeCount);
    // the hidden title placeholder of every slide is the dropped row
    expect(
      first.report.rows.filter((row) => row.status === 'dropped' && row.code === 'shape.hidden'),
    ).toHaveLength(first.slides.length);
  });
});

describe('fixture 05b, the Perfect round trip', () => {
  it('drops the page raster with its row and imports the text layer at full alpha', () => {
    const rasterRows = perfect.report.rows.filter((row) => row.code === ROW_CODES.perfectRaster);
    expect(rasterRows).toHaveLength(perfect.slides.length);
    expect(Object.keys(perfect.deck.assets)).toEqual([]);
    for (const slide of perfect.slides) {
      const texts = blocksOf(slide).filter((block) => block.type === 'text');
      for (const block of texts) {
        if (block.type !== 'text') continue;
        expect(block.color).toBeUndefined();
        expect(block.text).not.toMatch(/c:#/);
      }
    }
    const title = perfect.slides[0];
    expect(blocksOf(title).flatMap(textsOf).join(' ')).toContain('Export fixture');
  });
});

describe('the second pass', () => {
  let work: string;
  let second: ImportedDocument;

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'turboslide-rt-'));
    const decksDir = join(work, 'decks');
    const written = writeImportedDeck(first, decksDir);
    const document = loadDeckDir(written.dir).document;
    const out = await exportPptx({
      deckDir: written.dir,
      document,
      outDir: join(work, 'export'),
      mode: 'native',
      themes: ['light'],
      fontsCatalog: loadFontsCatalog(),
      materialize: false,
      zip: false,
    });
    const file = out.files.find((path) => path.endsWith('.pptx')) ?? out.files[0];
    if (file === undefined) throw new Error('the exporter wrote no file');
    second = await importPptxBytes(new Uint8Array(readFileSync(file)), {
      fileName: 'second.pptx',
      into: 'rt2',
      now: () => FIXED_NOW,
    });
  }, 240_000);

  afterAll(() => {
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  });

  it('adds no report row the first pass did not write, and keeps the ids', () => {
    const key = (row: { slideIndex: number; code: string; object?: string; status: string }) =>
      `${row.status}|${row.code}|${row.object ?? ''}`;
    const before = new Set(first.report.rows.map(key));
    const fresh = second.report.rows.filter((row) => !before.has(key(row)));
    expect(fresh).toEqual([]);
    expect(second.slides.map((slide) => slide.id)).toEqual(first.slides.map((slide) => slide.id));
    // the one object the exporter leaves out of an Editable text file: a shape with text, a hex
    // stroke and no fill (`links/box` after the first pass), handed to B1 in b3.md; pinned so a
    // second omission shows
    const KNOWN_OMISSIONS = new Set(['links/box']);
    for (const slide of second.slides) {
      const original = first.slides.find((s) => s.id === slide.id);
      const back = blocksOf(slide);
      const ids = new Set(back.map((block) => block.id));
      // a `plain` list is written as rules and text boxes per item (R04 7: a rows block is not
      // rebuilt), so a list's id does not survive a pass; its item texts do
      const lists = blocksOf(original).filter((block) => block.type === 'plain');
      const backTexts = back.flatMap(textsOf).join('\n');
      for (const list of lists)
        for (const text of textsOf(list))
          expect(backTexts, `${slide.id}/${list.id} text`).toContain(text);
      const before2 = blocksOf(original)
        .filter((block) => block.type !== 'plain')
        .map((block) => block.id);
      const missing = before2.filter((id) => !ids.has(id)).map((id) => `${slide.id}/${id}`);
      expect(
        missing.filter((key) => !KNOWN_OMISSIONS.has(key)),
        `${slide.id} lost blocks`,
      ).toEqual([]);
      // the decomposition also writes one rule per item (`ts:<slide>#rule/<n>`)
      const extra = [...ids].filter(
        (id) =>
          !before2.includes(id) &&
          !lists.some((list) => id.startsWith(list.id)) &&
          !(lists.length > 0 && /^rule-\d+$/.test(id)),
      );
      expect(extra, `${slide.id} gained blocks`).toEqual([]);
    }
    const dir = readdirSync(join(work, 'decks', 'rt'));
    expect(dir).toEqual(
      expect.arrayContaining(['deck.json', 'slides', 'import-report.json', 'import-ids.json']),
    );
  }, 240_000);
});
