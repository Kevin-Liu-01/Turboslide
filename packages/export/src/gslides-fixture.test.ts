// The export fixture deck of the Google Slides parity rounds (gslides-parity SPEC 14.2, 14.5;
// SPEC-2 11.2, 11.5), `decks/fixture/gslides`, through both PPTX modes and the PDF: the seven
// round one slides (a table, a numbered list, a multiline paragraph, a block link, a run slide
// link, an empty prompt, a skipped slide, notes) and the twenty round two slides, one per new
// object. Asserts the round one facts as written for the seven slide deck, and round two's: the
// marks as run properties, `rot` and flips, one grpSp per group and the `plate` group of a
// converted opener, the presets with the callout's `avLst`, the attached elbow as `p:cxnSp` with
// `stCxn` and `endCxn`, custGeom for the path kinds, word art's outline, shadows, the background
// colour and the covering picture as `p:bg`, three picture objects, `a:tbl` with `rowSpan` and
// `gridSpan` and `noFill` borders at weight 0, one chart part per chart, bullets and numbering per
// level, `numCol`, `valign` with a four sided margin, `descr` from a block's `alt`, the residual
// lines that name the substitutions, and the PDF with one page per unskipped slide at 960 by 540
// pt under the fail line. Runs where the Chrome for Testing binary exists;
// TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { exportReportSchema } from '@turboslide/schema/export';
import { resolveExecutable } from '@turboslide/headless/launch';
import { pdfPageCount, pdfPageSize } from '@turboslide/headless/pdf';

import { checkPptx, describeCheck } from './check.ts';
import { exportPptx } from './export-pptx.ts';
import type { ExportPptxResult } from './export-pptx.ts';
import { listParts, openPackage, readPart, slideParts } from './ooxml/zip.ts';
import type { Package } from './ooxml/zip.ts';
import { PDF_GATE, exportPdf, pdfGateAvailable } from './pdf/build.ts';
import type { ExportPdfResult } from './pdf/build.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const DECK_DIR = join(REPO, 'decks/fixture/gslides');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !existsSync(join(DECK_DIR, 'deck.json'));

/** The play list of SPEC-2 11.2 without the skipped slide: 26 pages of 27 slides. */
const ORDER = [
  'title',
  'breaks',
  'table',
  'numbered',
  'links',
  'prompt',
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

function factsOf(xml: string): PartFacts {
  return {
    name: /<p:cSld name="([^"]*)"/.exec(xml)?.[1] ?? '',
    tables: (xml.match(/<a:tbl>/g) ?? []).length,
    paragraphs: (xml.match(/<a:p>/g) ?? []).length,
    softBreaks: (xml.match(/<a:br\/>/g) ?? []).length,
    hyperlinks: (xml.match(/<a:hlinkClick/g) ?? []).length,
    slideJumps: (xml.match(/hlinksldjump/g) ?? []).length,
    textBoxes: (xml.match(/<p:sp>/g) ?? []).length,
  };
}

/** Every slide part's XML by the slide id its hidden title object names (`ts:<slideId>#title`). */
async function partsById(file: string): Promise<{ zip: Package; parts: Map<string, string> }> {
  const zip = await openPackage(new Uint8Array(readFileSync(file)));
  const parts = new Map<string, string>();
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    const id = /name="ts:([^#"]+)#title"/.exec(xml)?.[1];
    if (id !== undefined) parts.set(id, xml);
  }
  return { zip, parts };
}

function count(xml: string, re: RegExp): number {
  return (xml.match(re) ?? []).length;
}

/** The grpSp elements of a part with their name and the object names inside. */
function groupsOf(xml: string): { name: string; members: string[]; cxnSp: number; sp: number }[] {
  return [...xml.matchAll(/<p:grpSp>[\s\S]*?<\/p:grpSp>/g)].map((m) => {
    const names = [...m[0].matchAll(/<p:cNvPr id="\d+" name="([^"]*)"/g)].map((n) => n[1] ?? '');
    return {
      name: names[0] ?? '',
      members: names.slice(1),
      cxnSp: count(m[0], /<p:cxnSp>/g),
      sp: count(m[0], /<p:sp>/g),
    };
  });
}

describe.skipIf(skip)('the export fixture deck (gslides-parity SPEC 14.5, SPEC-2 11.2)', () => {
  let out = '';
  let flatten: ExportPptxResult;
  let native: ExportPptxResult;
  let withSkipped: ExportPptxResult;
  let pdf: ExportPdfResult;
  let nativeParts: Map<string, string>;
  let nativeZip: Package;
  const document = loadDeck();
  const catalog = loadFontsCatalog(
    process.env.TURBOSLIDE_TEST_TTF_DIR ?? join(REPO, 'packages/fonts/export'),
  );
  const scene = (slideId: string) =>
    native.scenes.find((s) => s.slideId === slideId && s.theme === 'light');
  const part = (slideId: string): string => nativeParts.get(slideId) ?? '';

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
    const read = await partsById(native.files[0] ?? '');
    nativeParts = read.parts;
    nativeZip = read.zip;
  }, 900_000);

  afterAll(async () => {
    if (process.env.TURBOSLIDE_KEEP_EXPORT_TEST !== '1')
      await rm(out, { recursive: true, force: true });
    else console.log(`fixture export output kept at ${out}`);
  });

  test('leaves the skipped slide out unless asked, and numbers the play list of 26', async () => {
    for (const result of [flatten, native]) {
      expect(result.omitted).toEqual(['skipped']);
      expect(result.merged.slides.map((s) => s.slideId)).toEqual(ORDER);
      expect(
        result.merged.residual.some((line) => line.startsWith('skipped: 1 slide(s) left out')),
      ).toBe(true);
    }
    expect(withSkipped.omitted).toEqual([]);
    expect(withSkipped.merged.slides).toHaveLength(27);
    // the counter counts what the file holds: the last slide of 26 reads 26 / 26
    const scenes = native.scenes.filter((s) => s.theme === 'light');
    expect(scenes.map((s) => s.n)).toEqual(ORDER.map((_, i) => i + 1));
    expect(scenes.every((s) => s.total === 26)).toBe(true);
    const last = scenes.find((s) => s.slideId === 'autofit');
    expect(last?.counter?.lines[0]?.runs.map((r) => r.text).join('')).toBe('26 / 26');
    expect(withSkipped.scenes.every((s) => s.total === 27)).toBe(true);
    expect(nativeParts.size).toBe(26);
  });

  test('flatten is perfect and valid with the play list as pages, the converted slides included', async () => {
    expect(flatten.merged.perfect).toBe(true);
    expect(flatten.merged.passed).toBe(true);
    const check = await checkPptx(flatten.files[0] ?? '', { quickLook: false });
    expect(check.valid).toBe(true);
    expect(check.slides).toBe(26);
    expect(
      flatten.merged.residual.some((line) =>
        /^pages: 26 png-palette; .* worst decoded mismatch 0\.000 percent/.test(line),
      ),
    ).toBe(true);
    const { parts } = await partsById(flatten.files[0] ?? '');
    // the run slide links of the breaks slide travel as slide jumps on the invisible layer
    expect(factsOf(parts.get('breaks') ?? '').slideJumps).toBe(2);
    // a linked block is an invisible hit target over its box, one per linked block
    expect(factsOf(parts.get('links') ?? '').hyperlinks).toBeGreaterThanOrEqual(3);
    // the invisible runs of a rotated block carry the rotation (SPEC-2 2.1, MILESTONES-2 B2 item 4)
    expect(parts.get('rotated')).toContain('rot="2220000"');
    expect(
      flatten.merged.residual.some((line) =>
        /^rotation: \d+ object\(s\) carry a rotation/.test(line),
      ),
    ).toBe(true);
  });

  test('editable text writes the table as a:tbl, links as jumps, paragraphs as paragraphs, notes when asked', async () => {
    expect(native.merged.passed).toBe(true);
    const check = await checkPptx(native.files[0] ?? '', { quickLook: false });
    expect(check.valid).toBe(true);
    expect(check.slides).toBe(26);
    expect(factsOf(part('table')).tables).toBe(1);
    expect(
      native.merged.residual.some((line) =>
        line.startsWith('table: table#table written as a:tbl (4 by 4)'),
      ),
    ).toBe(true);
    // the breaks slide: two multiline paragraphs in one text box each, one paragraph per break
    const breaks = factsOf(part('breaks'));
    expect(breaks.slideJumps).toBe(2);
    expect(breaks.paragraphs).toBeGreaterThanOrEqual(5);
    // the block links: the box and the text box jump to slides, the shape opens the URL
    const links = factsOf(part('links'));
    expect(links.hyperlinks).toBeGreaterThanOrEqual(4);
    expect(links.slideJumps).toBeGreaterThanOrEqual(2);
    expect(
      native.merged.residual.some((line) => /^links: \d+ hyperlink\(s\) written/.test(line)),
    ).toBe(true);
    // notes travel only when asked
    expect(native.merged.residual).toContain(
      'notes: the speaker notes travel as notes parts (includeNotes)',
    );
    expect(flatten.merged.residual.some((line) => line.startsWith('notes: left out'))).toBe(true);
    const titleNotes = await readPart(nativeZip, 'ppt/notesSlides/notesSlide1.xml');
    expect(titleNotes).toContain('The title slide carries speaker notes');
    const flat = await openPackage(new Uint8Array(readFileSync(flatten.files[0] ?? '')));
    const flatNotes = await readPart(flat, 'ppt/notesSlides/notesSlide1.xml');
    expect(flatNotes).not.toContain('The title slide carries speaker notes');
  });

  test('an empty Text produces no text box and the slide falls back to Slide n', () => {
    const prompt = scene('prompt');
    expect(prompt?.texts.filter((t) => t.blockId === 'h')).toHaveLength(0);
    expect(prompt?.title).toBe('Slide 6');
    expect(factsOf(part('prompt')).name).toBe('Slide 6');
    // the numeral of the numbered list is its own run, grouped with its item
    const numbered = scene('numbered');
    const numerals = numbered?.texts.filter((t) => t.id.endsWith('/num')) ?? [];
    expect(numerals.map((t) => t.lines[0]?.runs[0]?.text)).toEqual(['1', '2', '3']);
    expect(numerals[0]?.group).toBe('list/item/0');
  });

  test('export check reads the round two counts back (SPEC-2 11.3)', async () => {
    const check = await checkPptx(native.files[0] ?? '', { quickLook: false });
    expect(check.tables).toBe(2);
    expect(check.mergedCells).toBeGreaterThanOrEqual(1);
    expect(check.charts).toBe(3);
    // the elbow of the lines slide and the three arrows of the process diagram
    expect(check.connectors).toBe(4);
    // the plate group, the group of four, the diagram's group and the ruled rows' row groups
    expect(check.groups).toBeGreaterThanOrEqual(3);
    // 37 degrees, 15 degrees and the four members of the plate group at 3 degrees
    expect(check.rotated).toBe(6);
    // the fixture's one italic run (the styles paragraph)
    expect(check.italicRuns).toBe(1);
    expect(check.numCol).toBe(1);
    expect(check.avLst).toBe(1);
    // the polyline, the closed curve and the scribble
    expect(check.custGeom).toBe(3);
    expect(
      describeCheck(check).some((line) => line.startsWith('round two: 1 italic run(s), 6 rotated')),
    ).toBe(true);
    const residual = native.merged.residual;
    expect(
      residual.some((line) => line.startsWith('connectors: 4 connector(s) written as p:cxnSp')),
    ).toBe(true);
    expect(residual.some((line) => line.startsWith('rotation: 6 object(s) carry a rotation'))).toBe(
      true,
    );
  });

  test('the marks travel as run properties and justify as algn (SPEC-2 7.2, 2.2)', () => {
    const styles = part('styles');
    expect(count(styles, /<a:rPr\b[^>]*\si="1"/g)).toBe(1);
    expect(count(styles, /<a:rPr\b[^>]*\su="sng"/g)).toBe(1);
    expect(count(styles, /<a:rPr\b[^>]*\sstrike="sngStrike"/g)).toBe(1);
    expect(styles).toContain('baseline="30000"');
    expect(styles).toContain('baseline="-40000"');
    expect(count(styles, /<a:highlight>/g)).toBe(1);
    expect(count(styles, /algn="just"/g)).toBeGreaterThanOrEqual(1);
    const runs = scene('styles')?.texts.flatMap((t) => t.lines.flatMap((l) => l.runs)) ?? [];
    expect(runs.find((r) => r.text === 'italic')?.style.italic).toBe(true);
    expect(runs.find((r) => r.text === 'underlined')?.style.underline).toBe(true);
    expect(runs.find((r) => r.text === 'struck through')?.style.strike).toBe(true);
    expect(runs.find((r) => r.text === 'highlighted')?.style.highlight).toBeDefined();
  });

  test('rotation, flips and groups: rot on the xfrm, one grpSp per group, the plate group of a converted opener (2.1)', () => {
    const rotated = part('rotated');
    expect(rotated).toContain('rot="2220000"');
    expect(rotated).toContain('flipH="1"');
    expect(rotated).toMatch(/<p:pic>[\s\S]*?<a:xfrm rot="900000">/);
    const rotatedScene = scene('rotated');
    expect(rotatedScene?.texts.find((t) => t.blockId === 'tilted')?.rotate).toBe(37);
    expect(rotatedScene?.rects.find((r) => r.blockId === 'arrow')).toMatchObject({
      flip: 'h',
      preset: 'rightArrow',
    });
    expect(rotatedScene?.rasters.find((r) => r.blockId === 'photo')?.rotate).toBe(15);
    // the group of four: one grpSp whose members share the tag
    const four = groupsOf(part('grouped'));
    expect(four).toHaveLength(1);
    expect(four[0]?.name).toBe('g:four');
    expect(four[0]?.members).toHaveLength(4);
    expect(four[0]?.members.every((m) => m.endsWith('@g:four'))).toBe(true);
    // the converted opener: the plate box and its three texts in the plate group, each at 3 degrees
    const opener = part('canvas-opener');
    const plate = groupsOf(opener);
    expect(plate).toHaveLength(1);
    expect(plate[0]?.name).toBe('g:plate');
    expect(plate[0]?.members).toEqual([
      'ts:canvas-opener#plate@g:plate',
      'ts:canvas-opener#big/text@g:plate',
      'ts:canvas-opener#p/text@g:plate',
      'ts:canvas-opener#credit/text@g:plate',
    ]);
    expect(count(opener, /rot="180000"/g)).toBe(4);
    const openerScene = scene('canvas-opener');
    expect(openerScene?.rects.find((r) => r.blockId === 'plate')).toMatchObject({
      userGroup: 'plate',
      rotate: 3,
    });
    // the opener's picture object was moved 40 px right (SPEC-2 11.2), so it no longer covers the
    // sheet and travels as a picture at its box, not as the slide background (2.6.4, 1.5)
    expect(opener).toContain('name="ts:canvas-opener#picture:1"');
    expect(opener).not.toContain('<p:bg>');
    expect(openerScene?.background?.pictureRasterId).toBeUndefined();
    // the process diagram: one group holding its shapes, text boxes and the three connectors
    const diagram = groupsOf(part('diagram'));
    expect(diagram).toHaveLength(1);
    expect(diagram[0]?.cxnSp).toBe(3);
    expect(diagram[0]?.sp).toBeGreaterThanOrEqual(8);
  });

  test('presets with avLst, dashes, the attached connector, custGeom paths, line heads, outline and shadows (2.3, 2.4)', () => {
    const shapes = part('shapes');
    for (const prst of [
      'hexagon',
      'rightArrow',
      'wedgeRectCallout',
      'mathPlus',
      'snip1Rect',
      'ellipse',
    ])
      expect(shapes).toContain(`<a:prstGeom prst="${prst}">`);
    expect(shapes).toContain(
      '<a:prstGeom prst="wedgeRectCallout"><a:avLst><a:gd name="adj1" fmla="val -30000"/><a:gd name="adj2" fmla="val 70000"/></a:avLst></a:prstGeom>',
    );
    expect(shapes).toContain('<a:prstDash val="dash"/>');
    const lines = part('lines');
    expect(lines).toMatch(
      /<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="\d+" name="ts:lines#elbow"><\/p:cNvPr><p:cNvCxnSpPr><a:stCxn id="\d+" idx="\d+"\/><a:endCxn id="\d+" idx="\d+"\/>/,
    );
    expect(lines).toContain('<a:prstGeom prst="bentConnector3">');
    expect(lines).toContain('<a:prstGeom prst="curvedConnector3">');
    expect(count(lines, /<a:custGeom>/g)).toBe(3);
    expect(lines).toContain('<a:headEnd type="oval"');
    expect(lines).toContain('<a:tailEnd type="stealth"');
    const linesScene = scene('lines');
    expect(linesScene?.lines?.find((l) => l.blockId === 'elbow')).toMatchObject({
      kind: 'elbow',
      connect: { start: { name: 'ts:lines#a' }, end: { name: 'ts:lines#b' } },
    });
    expect(
      native.merged.residual.some((line) =>
        line.startsWith(
          "paths: ts:lines#closed is a curve through its points; the file holds the sheet's Catmull-Rom cubics",
        ),
      ),
    ).toBe(true);
    // the closed curve is the sheet's cubic segments, one a:cubicBezTo per point, closed
    const closedShape = /<p:sp>(?:(?!<\/p:sp>)[\s\S])*?name="ts:lines#closed"[\s\S]*?<\/p:sp>/.exec(
      lines,
    )?.[0];
    expect(closedShape).toBeDefined();
    expect(count(closedShape ?? '', /<a:cubicBezTo>/g)).toBe(5);
    expect(closedShape).toContain('<a:close />');
    // the outlined ellipse is written drawn in by half its 2 px stroke: 618 px, not 617
    const dashed = /<p:sp>(?:(?!<\/p:sp>)[\s\S])*?name="ts:shapes#dashed"[\s\S]*?<\/p:sp>/.exec(
      part('shapes'),
    )?.[0];
    expect(dashed).toContain(`<a:off x="${Math.round((618 / 120) * 914400)}"`);
    // word art: the outline as a 2 px line on the run
    expect(part('word-art')).toMatch(/<a:rPr\b[^>]*>\s*<a:ln w="15240"/);
    // the box, the shape and the picture with drop shadows
    expect(count(part('shadow'), /<a:outerShdw\b/g)).toBeGreaterThanOrEqual(2);
  });

  test('the background colour and the covering picture as p:bg, three picture objects, descr from alt (2.5, 2.6)', () => {
    expect(part('background-color')).toMatch(
      /<p:bg><p:bgPr><a:solidFill><a:srgbClr val="[0-9A-F]{6}"\/>/,
    );
    expect(part('background-picture')).toMatch(/<p:bg><p:bgPr><a:blipFill\b/);
    expect(scene('background-picture')?.background?.pictureRasterId).toBeDefined();
    expect(
      native.merged.residual.some((line) =>
        line.startsWith(
          'background-picture: the picture object photo covers the sheet at the bottom of the stack and travels as the slide background',
        ),
      ),
    ).toBe(true);
    expect(count(part('image-tools'), /<p:pic>/g)).toBe(3);
    // the shape's alt text is its descr (pptxgenjs writes descr for pictures and charts only)
    expect(part('canvas-title')).toContain(
      'name="ts:canvas-title#padded" descr="A rounded rectangle holding a short label"',
    );
    // the padded shape keeps its middle alignment and its four sided padding as the insets
    // the side insets are the padding; the top inset gives the first baseline shift to the bottom
    // one so the centred text moves up by it (pptx/text.ts addShapeText), the sum stays the padding
    const padded =
      /lIns="182880" tIns="(\d+)" rIns="182880" bIns="(\d+)" rtlCol="0" anchor="ctr"/.exec(
        part('canvas-title'),
      );
    expect(padded).not.toBeNull();
    const [tIns, bIns] = [Number(padded?.[1]), Number(padded?.[2])];
    expect(tIns + bIns).toBe(121920);
    expect(tIns).toBeLessThan(60960);
  });

  test('a two column block measures its lines in reading order, paragraph by paragraph and column by column (2.2.10)', () => {
    const spaced = scene('spacing')?.texts.find((t) => t.blockId === 'spaced');
    expect(spaced?.columns).toBe(2);
    const lines = (spaced?.lines ?? []).map((l) =>
      l.runs
        .map((r) => r.text)
        .join('')
        .trim(),
    );
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines[0]).toMatch(/^The first paragraph/);
    expect(lines[0]).toMatch(/1\.5\.$/);
    expect(lines.join(' ')).toBe(
      'The first paragraph of a two column block at line spacing 1.5. The second paragraph follows 12 px of space before it and leaves 12 px after. The third paragraph fills the second column when the first is full.',
    );
    // the second paragraph runs from the first column into the second: its lines stay together
    const second = lines.findIndex((l) => l.startsWith('The second paragraph'));
    expect(lines[second + 1]).toMatch(/^leaves 12 px after\.$/);
  });

  test('the merged table is one a:tbl with rowSpan and gridSpan, noFill borders at weight 0 and a dashed border (2.7)', () => {
    const merged = part('table-merge');
    expect(count(merged, /<a:tbl>/g)).toBe(1);
    expect(merged).toContain('<a:tc rowSpan="2" gridSpan="2">');
    expect(merged).toContain('<a:tc vMerge="1" hMerge="1">');
    expect(count(merged, /<a:lnB w="0"[^>]*><a:noFill\/>/g)).toBeGreaterThanOrEqual(1);
    expect(merged).toContain('<a:prstDash val="sysDash"');
    expect(
      native.merged.residual.some((line) =>
        line.startsWith('table: table-merge#table written as a:tbl (4 by 4, 1 merged cell(s))'),
      ),
    ).toBe(true);
    const table = scene('table-merge')?.tables?.[0];
    expect(table?.merged).toBe(true);
    expect(
      table?.rows
        .flatMap((r) => r.cells)
        .some((c) => (c.rowspan ?? 1) === 2 && (c.colspan ?? 1) === 2),
    ).toBe(true);
    // the grid form's row height is the track pitch (the deck's 56 px), not the cells' own
    // height, so the rows do not drift in the viewer; the file writes it as 426720 EMU
    expect(table?.rows.map((r) => r.h)).toEqual([56, 56, 56, 56]);
    expect(count(merged, /<a:tr h="426720">/g)).toBe(4);
    // every cell carries the exact line pitch (17.4 pt), like a text box
    const tbl = /<a:tbl>[\s\S]*?<\/a:tbl>/.exec(merged)?.[0] ?? '';
    expect(count(tbl, /<a:lnSpc><a:spcPts val="1740"\/><\/a:lnSpc>/g)).toBeGreaterThanOrEqual(12);
  });

  test('one chart part per chart with its kind, legend and format; the chart box is a picture region (2.8)', async () => {
    const charts = listParts(nativeZip).filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p));
    expect(charts).toHaveLength(3);
    const [bar, line, pie] = await Promise.all(charts.map((p) => readPart(nativeZip, p)));
    expect(bar).toContain('<c:barDir val="bar"/>');
    expect(bar).toContain('<c:legendPos val="r"/>');
    expect(bar).toContain('formatCode="#,##0"');
    expect(line).toContain('<c:lineChart>');
    expect(pie).toContain('<c:pieChart>');
    expect(pie).toContain('formatCode="0%"');
    for (const id of ['chart-bar', 'chart-line', 'chart-pie'])
      expect(count(part(id), /<p:graphicFrame>/g)).toBe(1);
    const chart = scene('chart-bar')?.charts?.[0];
    expect(chart).toMatchObject({ kind: 'bar', legend: 'right', numberFormat: 'thousands' });
    expect(chart?.categories).toHaveLength(12);
    expect(chart?.series).toHaveLength(2);
    // the series colours reach the builder as hex, never as the computed rgb() the page measured
    for (const series of chart?.series ?? []) expect(series.colorHex).toMatch(/^[0-9A-F]{6}$/i);
    expect(chart?.labelColor).toMatch(/^[0-9A-F]{6}$/i);
    expect(
      scene('chart-pie')?.charts?.[0]?.sliceColorsHex?.every((c) => /^[0-9A-F]{6}$/i.test(c)),
    ).toBe(true);
    // the report lists the chart box as a picture region, reported and never gated
    const report = native.merged.slides.find((s) => s.slideId === 'chart-bar');
    expect(report?.pictures?.some((p) => p.regenerated === false)).toBe(true);
    expect(
      native.merged.residual.filter((l) =>
        /^chart: chart-(bar|line|pie)#chart written as a (bar|line|pie) chart part/.test(l),
      ),
    ).toHaveLength(3);
  });

  test('bullets and numbering per level, columns, paragraph spacing (2.2.10 to 2.2.13)', () => {
    const bullets = part('bullets');
    expect(count(bullets, /<a:buChar char="&#x25CF;"\/>/g)).toBe(2);
    expect(count(bullets, /<a:buChar char="&#x25CB;"\/>/g)).toBe(1);
    expect(count(bullets, /<a:buChar char="&#x25A0;"\/>/g)).toBe(1);
    // digit-alpha-roman: a digit at level one, a letter at two, a roman numeral at three
    expect(
      count(bullets, /<a:buAutoNum type="arabicPeriod" startAt="1"\/>/g),
    ).toBeGreaterThanOrEqual(1);
    expect(count(bullets, /<a:buAutoNum type="arabicPeriod" startAt="2"\/>/g)).toBe(1);
    expect(count(bullets, /<a:buAutoNum type="alphaLcPeriod" startAt="1"\/>/g)).toBe(1);
    expect(count(bullets, /<a:buAutoNum type="romanLcPeriod" startAt="1"\/>/g)).toBe(1);
    expect(count(bullets, /lvl="1"/g)).toBe(2);
    expect(count(bullets, /lvl="2"/g)).toBe(2);
    expect(count(bullets, /lvl="3"/g)).toBe(1);
    const items = scene('bullets')?.texts.filter((t) => t.blockId === 'bullets' && t.bullet) ?? [];
    expect(items.map((t) => t.bullet?.level)).toEqual([1, 2, 3, 4]);
    expect(items.map((t) => t.bullet?.glyph)).toEqual(['●', '○', '■', '●']);
    // the round one numbered form beside them keeps its numeral runs and row groups
    expect(
      scene('bullets')?.texts.filter((t) => t.blockId === 'ruled' && t.id.endsWith('/num')),
    ).toHaveLength(2);
    const spacing = part('spacing');
    expect(spacing).toMatch(/<a:bodyPr\b[^>]*numCol="2" spcCol="\d+"/);
    expect(spacing).toContain('<a:spcBef><a:spcPts val="720"/></a:spcBef>');
    expect(spacing).toContain('<a:spcAft><a:spcPts val="720"/></a:spcAft>');
  });

  test('the table falls back to ruled rows on request and the scene carries its grid', () => {
    expect(
      withSkipped.merged.residual.some((line) =>
        line.startsWith('table: table#table written as ruled rows'),
      ),
    ).toBe(true);
    const table = scene('table')?.tables?.[0];
    expect(table?.columns).toHaveLength(4);
    expect(table?.rows).toHaveLength(4);
    expect(table?.rows[0]?.header).toBe(true);
    expect(table?.headerRule).toBeDefined();
    expect(table?.rows[1]?.cells[1]?.align).toBe('right');
    // the row rules and the grouped cell texts of the ruled rows construction are measured too
    expect(scene('table')?.rules.filter((r) => r.blockId === 'table')).toHaveLength(5);
    expect(
      scene('table')?.texts.filter((t) => t.blockId === 'table' && t.group === 'table/row/1'),
    ).toHaveLength(4);
  });

  test('the PDF has one page per unskipped slide at 960 by 540 pt, every page under the fail line', async () => {
    expect(pdf.pages).toBe(26);
    expect(await pdfPageCount(pdf.path)).toBe(26);
    expect(await pdfPageSize(pdf.path)).toEqual({ width: 960, height: 540 });
    expect(pdf.omitted).toEqual(['skipped']);
    expect(pdf.report.format).toBe('pdf');
    expect(pdf.report.slides.map((s) => s.slideId)).toEqual(ORDER);
    exportReportSchema.parse(JSON.parse(readFileSync(pdf.reportPath, 'utf8')));
    expect(pdf.passed).toBe(true);
    if (await pdfGateAvailable()) {
      expect(pdf.gate).toBe('raster');
      const overTarget: string[] = [];
      for (const page of pdf.slides) {
        expect(page.verify, page.slideId).toBeDefined();
        expect(page.verify?.fraction ?? 1, page.slideId).toBeLessThanOrEqual(PDF_GATE.fail);
        if ((page.verify?.fraction ?? 0) > PDF_GATE.target) overTarget.push(page.slideId);
      }
      // the seven round one pages stay under the target; word art's stroked glyph edges rasterize
      // 0.003 percent over it through poppler (measured 0.103) and ship with the residual's note
      for (const id of ['title', 'breaks', 'table', 'numbered', 'links', 'prompt', 'styles'])
        expect(overTarget).not.toContain(id);
      expect(overTarget.length).toBeLessThanOrEqual(1);
      // the picture regions are compared and reported, never gated
      const pictures = pdf.slides
        .filter((p) => p.verify?.pictureFraction !== undefined)
        .map((p) => p.slideId);
      expect(pictures).toEqual(
        expect.arrayContaining([
          'canvas-opener',
          'rotated',
          'shadow',
          'background-picture',
          'image-tools',
        ]),
      );
    } else {
      expect(pdf.gate).toBe('pages');
    }
  });
});
