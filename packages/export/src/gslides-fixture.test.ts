// The export fixture deck of the Google Slides parity round (gslides-parity SPEC 14.2, 14.5),
// `decks/fixture/gslides`, through both PPTX modes and the PDF: one of every new object (a table,
// a numbered list, a multiline paragraph, a block link, a run slide link, an empty prompt, a
// skipped slide, notes). Asserts the table is an `a:tbl` in Editable text, an empty Text produces
// no text box, skipped slides and notes obey the two flags, a slide hyperlink is a slide jump, a
// paragraph break is a new paragraph, and the PDF has one page per unskipped slide at 960 by 540
// pt with every page under the gate of SPEC 7.6 where poppler exists. Runs where the Chrome for
// Testing binary exists; TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { exportReportSchema } from '@turboslide/schema/export';
import { resolveExecutable } from '@turboslide/headless/launch';
import { pdfPageCount, pdfPageSize } from '@turboslide/headless/pdf';

import { checkPptx } from './check.ts';
import { exportPptx } from './export-pptx.ts';
import type { ExportPptxResult } from './export-pptx.ts';
import { openPackage, readPart, slideParts } from './ooxml/zip.ts';
import { PDF_GATE, exportPdf, pdfGateAvailable } from './pdf/build.ts';
import type { ExportPdfResult } from './pdf/build.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const DECK_DIR = join(REPO, 'decks/fixture/gslides');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !existsSync(join(DECK_DIR, 'deck.json'));

function loadDeck(): DeckDocument {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(DECK_DIR, 'slides')))
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(DECK_DIR, 'slides', file), 'utf8'),
    ) as Slide;
  return { deck, slides };
}

type PartFacts = {
  name: string;
  tables: number;
  paragraphs: number;
  softBreaks: number;
  hyperlinks: number;
  slideJumps: number;
  textBoxes: number;
};

async function partFacts(file: string): Promise<PartFacts[]> {
  const zip = await openPackage(new Uint8Array(readFileSync(file)));
  const out: PartFacts[] = [];
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    out.push({
      name: /<p:cSld name="([^"]*)"/.exec(xml)?.[1] ?? '',
      tables: (xml.match(/<a:tbl>/g) ?? []).length,
      paragraphs: (xml.match(/<a:p>/g) ?? []).length,
      softBreaks: (xml.match(/<a:br\/>/g) ?? []).length,
      hyperlinks: (xml.match(/<a:hlinkClick/g) ?? []).length,
      slideJumps: (xml.match(/hlinksldjump/g) ?? []).length,
      textBoxes: (xml.match(/<p:sp>/g) ?? []).length,
    });
  }
  return out;
}

describe.skipIf(skip)('the export fixture deck (gslides-parity SPEC 14.5)', () => {
  let out = '';
  let flatten: ExportPptxResult;
  let native: ExportPptxResult;
  let withSkipped: ExportPptxResult;
  let pdf: ExportPdfResult;
  const document = loadDeck();
  const catalog = loadFontsCatalog(
    process.env.TURBOSLIDE_TEST_TTF_DIR ?? join(REPO, 'packages/fonts/export'),
  );

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-gslides-fixture-'));
    flatten = await exportPptx({
      deckDir: DECK_DIR,
      document,
      outDir: join(out, 'flatten'),
      mode: 'flatten',
      themes: ['light'],
      fontsCatalog: catalog,
    });
    native = await exportPptx({
      deckDir: DECK_DIR,
      document,
      outDir: join(out, 'native'),
      mode: 'native',
      themes: ['light'],
      fontsCatalog: catalog,
      includeNotes: true,
      writeScenes: true,
    });
    withSkipped = await exportPptx({
      deckDir: DECK_DIR,
      document,
      outDir: join(out, 'skipped'),
      mode: 'native',
      themes: ['dark'],
      fontsCatalog: catalog,
      includeSkipped: true,
      tableMode: 'rows',
    });
    pdf = await exportPdf({ deckDir: DECK_DIR, document, outDir: join(out, 'pdf'), verify: true });
  }, 600_000);

  afterAll(async () => {
    if (process.env.TURBOSLIDE_KEEP_EXPORT_TEST !== '1')
      await rm(out, { recursive: true, force: true });
    else console.log(`fixture export output kept at ${out}`);
  });

  test('leaves the skipped slide out unless asked, and numbers the play list', async () => {
    for (const result of [flatten, native]) {
      expect(result.omitted).toEqual(['skipped']);
      expect(result.merged.slides.map((s) => s.slideId)).toEqual([
        'title',
        'breaks',
        'table',
        'numbered',
        'links',
        'prompt',
      ]);
      expect(
        result.merged.residual.some((line) => line.startsWith('skipped: 1 slide(s) left out')),
      ).toBe(true);
    }
    expect(withSkipped.omitted).toEqual([]);
    expect(withSkipped.merged.slides).toHaveLength(7);
    // the counter counts what the file holds: the last slide of six reads 06 / 06
    const scenes = native.scenes.filter((s) => s.theme === 'light');
    expect(scenes.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(scenes.every((s) => s.total === 6)).toBe(true);
    const last = scenes.find((s) => s.slideId === 'prompt');
    expect(last?.counter?.lines[0]?.runs.map((r) => r.text).join('')).toBe('06 / 06');
    expect(withSkipped.scenes.every((s) => s.total === 7)).toBe(true);
  });

  test('flatten is perfect and valid with the play list as pages', async () => {
    expect(flatten.merged.perfect).toBe(true);
    expect(flatten.merged.passed).toBe(true);
    const check = await checkPptx(flatten.files[0] ?? '', { quickLook: false });
    expect(check.valid).toBe(true);
    expect(check.slides).toBe(6);
    const facts = await partFacts(flatten.files[0] ?? '');
    // the run slide links of the breaks slide travel as slide jumps on the invisible layer
    const breaks = facts.find((f) => f.name === 'Paragraph breaks and slide links');
    expect(breaks?.slideJumps).toBe(2);
    // a linked block is an invisible hit target over its box, one per linked block
    const links = facts.find((f) => f.name === 'Block links');
    expect(links?.hyperlinks).toBeGreaterThanOrEqual(3);
  });

  test('editable text writes the table as a:tbl, links as jumps, paragraphs as paragraphs, notes when asked', async () => {
    expect(native.merged.passed).toBe(true);
    const check = await checkPptx(native.files[0] ?? '', { quickLook: false });
    expect(check.valid).toBe(true);
    expect(check.slides).toBe(6);
    const facts = await partFacts(native.files[0] ?? '');
    const byName = new Map(facts.map((f) => [f.name, f]));
    expect(byName.get('Pricing table')?.tables).toBe(1);
    expect(
      native.merged.residual.some((line) =>
        line.startsWith('table: table#table written as a:tbl (4 by 4)'),
      ),
    ).toBe(true);
    // the breaks slide: two multiline paragraphs in one text box each, one paragraph per break
    const breaks = byName.get('Paragraph breaks and slide links');
    expect(breaks?.slideJumps).toBe(2);
    expect(breaks?.paragraphs).toBeGreaterThanOrEqual(5);
    // the block links: the box and the text box jump to slides, the shape opens the URL
    const links = byName.get('Block links');
    expect(links?.hyperlinks).toBeGreaterThanOrEqual(4);
    expect(links?.slideJumps).toBeGreaterThanOrEqual(2);
    expect(
      native.merged.residual.some((line) => /^links: \d+ hyperlink\(s\) written/.test(line)),
    ).toBe(true);
    // notes travel only when asked
    expect(native.merged.residual).toContain(
      'notes: the speaker notes travel as notes parts (includeNotes)',
    );
    expect(flatten.merged.residual.some((line) => line.startsWith('notes: left out'))).toBe(true);
    const zip = await openPackage(new Uint8Array(readFileSync(native.files[0] ?? '')));
    const titleNotes = await readPart(zip, 'ppt/notesSlides/notesSlide1.xml');
    expect(titleNotes).toContain('The title slide carries speaker notes');
    const flat = await openPackage(new Uint8Array(readFileSync(flatten.files[0] ?? '')));
    const flatNotes = await readPart(flat, 'ppt/notesSlides/notesSlide1.xml');
    expect(flatNotes).not.toContain('The title slide carries speaker notes');
  });

  test('an empty Text produces no text box and the slide falls back to Slide n', async () => {
    const scene = native.scenes.find((s) => s.slideId === 'prompt' && s.theme === 'light');
    expect(scene?.texts.filter((t) => t.blockId === 'h')).toHaveLength(0);
    expect(scene?.title).toBe('Slide 6');
    const facts = await partFacts(native.files[0] ?? '');
    expect(facts.find((f) => f.name === 'Slide 6')).toBeDefined();
    // the numeral of the numbered list is its own run, grouped with its item
    const numbered = native.scenes.find((s) => s.slideId === 'numbered' && s.theme === 'light');
    const numerals = numbered?.texts.filter((t) => t.id.endsWith('/num')) ?? [];
    expect(numerals.map((t) => t.lines[0]?.runs[0]?.text)).toEqual(['1', '2', '3']);
    expect(numerals[0]?.group).toBe('list/item/0');
  });

  test('the table falls back to ruled rows on request and the scene carries its grid', () => {
    expect(
      withSkipped.merged.residual.some((line) =>
        line.startsWith('table: table#table written as ruled rows'),
      ),
    ).toBe(true);
    const scene = native.scenes.find((s) => s.slideId === 'table' && s.theme === 'light');
    const table = scene?.tables?.[0];
    expect(table?.columns).toHaveLength(4);
    expect(table?.rows).toHaveLength(4);
    expect(table?.rows[0]?.header).toBe(true);
    expect(table?.headerRule).toBeDefined();
    expect(table?.rows[1]?.cells[1]?.align).toBe('right');
    // the row rules and the grouped cell texts of the ruled rows construction are measured too
    expect(scene?.rules.filter((r) => r.blockId === 'table')).toHaveLength(5);
    expect(
      scene?.texts.filter((t) => t.blockId === 'table' && t.group === 'table/row/1'),
    ).toHaveLength(4);
  });

  test('the PDF has one page per unskipped slide at 960 by 540 pt and every page under the gate', async () => {
    expect(pdf.pages).toBe(6);
    expect(await pdfPageCount(pdf.path)).toBe(6);
    expect(await pdfPageSize(pdf.path)).toEqual({ width: 960, height: 540 });
    expect(pdf.omitted).toEqual(['skipped']);
    expect(pdf.report.format).toBe('pdf');
    expect(pdf.report.slides.map((s) => s.slideId)).toEqual([
      'title',
      'breaks',
      'table',
      'numbered',
      'links',
      'prompt',
    ]);
    exportReportSchema.parse(JSON.parse(readFileSync(pdf.reportPath, 'utf8')));
    expect(pdf.passed).toBe(true);
    if (await pdfGateAvailable()) {
      expect(pdf.gate).toBe('raster');
      for (const page of pdf.slides) {
        expect(page.verify, page.slideId).toBeDefined();
        expect(page.verify?.fraction ?? 1).toBeLessThanOrEqual(PDF_GATE.target);
      }
      expect(pdf.report.perfect).toBe(true);
    } else {
      expect(pdf.gate).toBe('pages');
    }
  });
});
