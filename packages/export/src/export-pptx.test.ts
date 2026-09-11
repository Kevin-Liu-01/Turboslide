// One real export pass over four deck slides in both themes and both modes (MILESTONES M2 item 4):
// slides 01 (a two-tone opener with a plate), 08 (text plus a diagram and a ruled table with
// icons), 33 (text plus a screenshot with a caption) and 47 (a photographic opener). The files
// reopen with python-pptx when the .turboslide/venv exists, and the XML carries the expected sz,
// spc, spcPts and line widths, read back with jszip. The flatten files carry the page raster
// policy, no font parts, the slide names and the hidden titles, and validate as packages
// (docs/pptx.md). Runs where the Chrome for Testing binary and the deck exist;
// TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time (AGENTS.md).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import {
  PAGE_RASTER_BUDGETS,
  PAGE_RASTER_FORMATS,
  exportReportSchema,
} from '@turboslide/schema/export';
import { resolveExecutable } from '@turboslide/headless/launch';

import { checkPptx } from './check.ts';
import { exportPptx } from './export-pptx.ts';
import type { ExportPptxResult } from './export-pptx.ts';
import { readAllAttributes, readGeometry, readPageSize } from './ooxml/geometry.ts';
import { listEmbeddedFonts } from './ooxml/fonts.ts';
import { countGroups } from './ooxml/groups.ts';
import { hasTitlePlaceholder, readSlideName, readTitlePlaceholder } from './ooxml/titles.ts';
import { validatePackage } from './ooxml/validate.ts';
import { listParts, openPackage, readPart, slideParts } from './ooxml/zip.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';
import { spcOf, spcPtsOf, szOf } from './units.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const DECK_DIR = join(REPO, 'decks/gt-brand');
const VENV_PYTHON = join(REPO, '.turboslide/venv/bin/python');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !existsSync(join(DECK_DIR, 'deck.json'));

function loadDeck(): { deck: Deck; slides: Record<string, Slide>; ids: string[] } {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const order = slideOrder(deck);
  const ids = [1, 8, 33, 47].map((n) => order[n - 1] ?? '');
  const slides: Record<string, Slide> = {};
  for (const id of ids)
    slides[id] = JSON.parse(readFileSync(join(DECK_DIR, 'slides', `${id}.json`), 'utf8')) as Slide;
  return { deck, slides, ids };
}

describe.skipIf(skip)('export pptx over slides 01, 08, 33 and 47', () => {
  let out = '';
  let flatten: ExportPptxResult;
  let native: ExportPptxResult;
  const { deck, slides, ids } = loadDeck();
  const catalog = loadFontsCatalog(
    process.env.TURBOSLIDE_TEST_TTF_DIR ?? join(REPO, 'packages/fonts/export'),
  );

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-export-test-'));
    const document = { deck, slides };
    flatten = await exportPptx({
      deckDir: DECK_DIR,
      document,
      outDir: join(out, 'flatten'),
      mode: 'flatten',
      themes: ['light', 'dark'],
      slideIds: ids,
      fontsCatalog: catalog,
      writeScenes: true,
    });
    native = await exportPptx({
      deckDir: DECK_DIR,
      document,
      outDir: join(out, 'native'),
      mode: 'native',
      themes: ['light', 'dark'],
      slideIds: ids,
      fontsCatalog: catalog,
      embedFonts: true,
      writeScenes: true,
    });
  });

  afterAll(async () => {
    if (process.env.TURBOSLIDE_KEEP_EXPORT_TEST !== '1')
      await rm(out, { recursive: true, force: true });
    else console.log(`export test output kept at ${out}`);
  });

  test('the four slides are slides 01, 08, 33 and 47 of the deck', () => {
    expect(ids).toEqual(['opener-brand', 'audience', 'site', 'opener-blog']);
  });

  test('writes one file and one report per theme plus the merged report and the zip, all valid', () => {
    for (const result of [flatten, native]) {
      expect(result.files).toHaveLength(2);
      expect(result.zipPath?.endsWith('gt-brand-both.zip')).toBe(true);
      expect(existsSync(result.zipPath ?? '')).toBe(true);
      expect(result.merged.files).toHaveLength(3);
      expect(result.merged.residual.some((r) => r.startsWith('both: gt-brand-both.zip'))).toBe(
        true,
      );
      expect(result.reports).toHaveLength(2);
      for (const report of result.reports) exportReportSchema.parse(report);
      exportReportSchema.parse(JSON.parse(readFileSync(result.reportPath, 'utf8')));
      expect(result.merged.slides).toHaveLength(8);
      expect(result.merged.geometryInBounds).toBe(true);
      expect(result.merged.revision).toBe(deck.revision);
      expect(result.merged.passed).toBe(true);
      expect(result.merged.residual.some((r) => r.startsWith('renderer: Chrome for Testing'))).toBe(
        true,
      );
    }
    expect(flatten.merged.mode).toBe('flatten');
    expect(native.merged.mode).toBe('native');
    expect(native.merged.perfect).toBe(false);
  });

  test('flatten is perfect: every page raster within budget, no font parts, a valid package', async () => {
    expect(flatten.merged.perfect).toBe(true);
    for (const report of flatten.reports) {
      expect(report.perfect).toBe(true);
      expect(report.fonts.embedded).toEqual([]);
      expect(report.slides).toHaveLength(4);
      for (const slide of report.slides) {
        expect(slide.page, slide.slideId).toBeDefined();
        expect(PAGE_RASTER_FORMATS).toContain(slide.page?.format);
        expect(slide.page?.fraction).toBeLessThanOrEqual(PAGE_RASTER_BUDGETS.perfect);
        expect(slide.page?.bytes).toBeGreaterThan(0);
      }
      // the two-tone opener with its plate and credit quantizes to a palette; the photographic
      // opener (opener-blog, a continuous treatment) carries a continuous-tone picture
      const bySlide = new Map(report.slides.map((s) => [s.slideId, s]));
      expect(bySlide.get('opener-brand')?.page?.format).toBe('png-palette');
      expect(['jpeg', 'png-palette', 'png-rgba']).toContain(
        bySlide.get('opener-blog')?.page?.format,
      );
      expect(report.residual.some((r) => r.startsWith('pages: '))).toBe(true);
      expect(report.residual.some((r) => r.startsWith('package: ') && r.includes('valid'))).toBe(
        true,
      );
    }
    for (const path of flatten.files) {
      const zip = await openPackage(readFileSync(path));
      expect(await listEmbeddedFonts(zip)).toEqual([]);
      expect(listParts(zip).some((p) => p.startsWith('ppt/fonts/'))).toBe(false);
      expect(await readPart(zip, 'ppt/presentation.xml')).not.toContain('embeddedFontLst');
      const validation = await validatePackage(zip);
      expect(validation.valid, validation.issues.join('; ')).toBe(true);
      expect(validation.missingOverrides).toEqual([]);
      const types = await readPart(zip, '[Content_Types].xml');
      expect(types).not.toContain('slideMaster2.xml');
      expect(types).not.toContain('image/jpg"');
    }
  });

  test('every slide is named after its title and carries a hidden title placeholder', async () => {
    for (const result of [flatten, native]) {
      const path = result.files.find((f) => f.endsWith('-light.pptx')) ?? '';
      const zip = await openPackage(readFileSync(path));
      const parts = slideParts(zip);
      expect(parts).toHaveLength(4);
      for (const [i, part] of parts.entries()) {
        const id = ids[i] ?? '';
        const title = slideTitle(slides[id] as Slide, i + 1);
        const xml = await readPart(zip, part);
        expect(readSlideName(xml), part).toBe(title);
        expect(hasTitlePlaceholder(xml)).toBe(true);
        expect(readTitlePlaceholder(xml)).toBe(title);
        expect(xml).toContain(`name="ts:${id}#title" hidden="1"`);
        expect(xml).not.toContain('kern="0"');
      }
      const app = await readPart(zip, 'docProps/app.xml');
      expect(app).toContain(`<vt:lpstr>${slideTitle(slides[ids[1] ?? ''] as Slide, 2)}</vt:lpstr>`);
      expect(app).not.toContain('<vt:lpstr>Slide 1</vt:lpstr>');
      for (const g of await readGeometry(zip)) expect(g.inBounds, `${g.part} ${g.name}`).toBe(true);
    }
  });

  test('export check reads the flatten file back as valid', async () => {
    const check = await checkPptx(flatten.files[0] ?? '', { quickLook: false });
    expect(check.valid, check.issues.join('; ')).toBe(true);
    expect(check.slides).toBe(4);
    expect(check.titledSlides).toBe(4);
    expect(check.slideNames).toEqual(ids.map((id, i) => slideTitle(slides[id] as Slide, i + 1)));
    expect(check.embeddedFonts).toEqual([]);
    expect(check.kernZero).toBe(0);
    expect(check.contentTypes.missingOverrides).toEqual([]);
  });

  test('the scene measured the deck geometry: the h2 of slide 08 at the left column origin', () => {
    const scene = native.scenes.find((s) => s.slideId === 'audience' && s.theme === 'light');
    expect(scene).toBeDefined();
    if (!scene) return;
    expect(scene.sheet).toEqual([0, 0, 1600, 900]);
    const h2 = scene.texts.find((t) => t.id === 'h/text');
    expect(h2).toBeDefined();
    // a cols layout centers its columns vertically (head:83), so the h2 sits below the content top
    expect(h2?.textBox[0]).toBeCloseTo(137, 0);
    expect(h2?.textBox[1]).toBeGreaterThan(129);
    expect(h2?.textBox[1]).toBeCloseTo(h2?.box[1] ?? 0, 0);
    expect(h2?.textBox[2]).toBeCloseTo(418, 0);
    const rowsBlock = scene.blocks.find((b) => b.blockId === 'rows');
    expect(rowsBlock?.box[0]).toBeCloseTo(627, 0);
    expect(rowsBlock?.box[2]).toBeCloseTo(836, 0);
    expect(h2?.style.size).toBe(44);
    expect(h2?.style.weight).toBe(500);
    expect(h2?.style.letterSpacing).toBeCloseTo(-1.1, 1);
    expect(h2?.lines).toHaveLength(1);
    expect(h2?.lines[0]?.runs.map((r) => r.text).join('')).toBe('Audience');
    const rows = scene.texts.filter((t) => t.blockId === 'rows');
    expect(rows.length).toBe(8);
    const value = scene.texts.find((t) => t.id === 'rows/items/1/value');
    expect(value?.lines.length).toBeGreaterThan(1);
    expect(value?.lines.map((l) => l.runs.map((r) => r.text).join('')).join(' ')).toBe(
      'Buyers are technical and product executives who need consistency, security, and a review process they can defend.',
    );
    // the ruled table: the top hairline plus one per row, grouped with the row's boxes
    expect(scene.rules.filter((r) => r.blockId === 'rows')).toHaveLength(5);
    expect(scene.rasters.filter((r) => r.kind === 'icon' && r.blockId === 'rows')).toHaveLength(4);
    expect(scene.rasters.filter((r) => r.kind === 'block' && r.blockId === 'dia1')).toHaveLength(1);
    expect(scene.blocks.map((b) => `${b.blockId}:${b.native}`)).toEqual([
      'h:true',
      'p1:true',
      'dia1:false',
      'rows:true',
    ]);
    // the GT words of the paragraph are runs at the mark with the letters kept
    const p1 = scene.texts.find((t) => t.id === 'p1/text');
    expect(p1?.lines.flatMap((l) => l.runs).filter((r) => r.gt).length).toBe(2);
    expect(scene.counter?.lines[0]?.runs[0]?.text).toBe('08 / 85');
  });

  test('an opener scene has the picture, the plate and the regenerated 2x two-tone twin', () => {
    const scene = flatten.scenes.find((s) => s.slideId === 'opener-brand' && s.theme === 'dark');
    expect(scene?.picture?.box).toEqual([0, 0, 1600, 900]);
    expect(scene?.picture?.assetId).toBe('opener-brand');
    expect(scene?.pictureFile?.endsWith('opener-brand@2x.png')).toBe(true);
    expect(scene?.plates).toHaveLength(1);
    expect(scene?.plates[0]?.box[0]).toBeCloseTo(137, 0);
    expect((scene?.plates[0]?.box[1] ?? 0) + (scene?.plates[0]?.box[3] ?? 0)).toBeCloseTo(771, 0);
    expect(scene?.chips).toHaveLength(2);
    expect(scene?.sheetImage && existsSync(scene.sheetImage)).toBe(true);
    const credit = scene?.texts.find((t) => t.id === 'credit/text');
    expect(credit?.style.size).toBe(15);
    expect(credit?.style.letterSpacing).toBeCloseTo(0.15, 1);
  });

  test('native XML carries sz, spc, spcPts and 7,620 EMU hairlines, kern stripped, rows grouped', async () => {
    const path = native.files.find((f) => f.endsWith('-light.pptx')) ?? '';
    const zip = await openPackage(readFileSync(path));
    expect(await readPageSize(zip)).toEqual({ cx: 12_192_000, cy: 6_858_000 });
    const parts = slideParts(zip);
    expect(parts).toHaveLength(4);
    const attrs = await readAllAttributes(zip);
    const audience = attrs[parts[1] ?? ''];
    expect(audience).toBeDefined();
    if (!audience) return;
    expect(audience.sz).toContain(szOf(44));
    expect(audience.sz).toContain(szOf(22));
    expect(audience.sz).toContain(szOf(20));
    expect(audience.sz).toContain(szOf(13));
    expect(audience.spc).toContain(spcOf(-1.1));
    expect(audience.spc).toContain(spcOf(-0.2));
    expect(audience.spc).toContain(spcOf(0.26));
    expect(audience.spcPts).toContain(spcPtsOf(48.4));
    expect(audience.spcPts).toContain(spcPtsOf(33));
    expect(audience.spcPts).toContain(spcPtsOf(29));
    expect(audience.lineWidths.filter((w) => w === 7620).length).toBeGreaterThanOrEqual(5);
    expect(audience.kernZero).toBe(0);
    expect(audience.softBreaks).toBeGreaterThan(0);
    expect(audience.typefaces).toContain(catalog.built ? 'GT Inter Display' : 'GT Inter Display');
    const xml = await readPart(zip, parts[1] ?? '');
    expect(countGroups(xml)).toBe(4);
    expect(xml).not.toContain('normAutofit');
    expect(xml).toContain('lIns="0"');
    expect(xml).toContain('anchor="t"');
    // the opener: alpha lines over the picture and the picture as the background
    const opener = await readPart(zip, parts[0] ?? '');
    expect(opener).toContain('<p:bg>');
    expect(attrs[parts[0] ?? '']?.alphaValues).toContain(18000);
    expect(attrs[parts[0] ?? '']?.alphaValues).toContain(38000);
    const dark = await openPackage(
      readFileSync(native.files.find((f) => f.endsWith('-dark.pptx')) ?? ''),
    );
    const darkOpener = (await readAllAttributes(dark))[slideParts(dark)[0] ?? ''];
    expect(darkOpener?.alphaValues).toContain(22000);
    expect(darkOpener?.alphaValues).toContain(34000);
    for (const g of await readGeometry(zip)) expect(g.inBounds, `${g.part} ${g.name}`).toBe(true);
  });

  test('flatten XML has the invisible text layer under a full-page sheet picture', async () => {
    const path = flatten.files.find((f) => f.endsWith('-dark.pptx')) ?? '';
    const zip = await openPackage(readFileSync(path));
    const parts = slideParts(zip);
    expect(parts).toHaveLength(4);
    for (const part of parts) {
      const xml = await readPart(zip, part);
      expect(xml).toContain('<a:alpha val="0"/>');
      expect(xml).not.toContain('<a:ln w="7620">');
      // the sheet picture is the last shape and covers the page
      const pics = [...xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].map((m) => m[0]);
      expect(pics).toHaveLength(1);
      // the cover sits 360 EMU (0.01 mm) below the top edge, LibreOffice's measured picture-shape
      // offset (build.ts COVER_OFFSET_IN)
      expect(pics[0]).toMatch(/<a:off x="0" y="360"\/>\s*<a:ext cx="12192000" cy="685\d{4}"\/>/);
      expect(xml.lastIndexOf('<p:sp>')).toBeLessThan(xml.indexOf('<p:pic>'));
    }
    const attrs = await readAllAttributes(zip);
    expect(attrs[parts[2] ?? '']?.sz).toContain(szOf(16));
    expect(attrs[parts[2] ?? '']?.sz).toContain(szOf(44));
    // the caption of the shot is recoverable text even though the block is a raster
    expect(await readPart(zip, parts[2] ?? '')).toContain('The home page at 1440 by 900');
  });

  test('the report lists native and raster blocks per slide and the fonts', () => {
    const bySlide = new Map(native.reports[0]?.slides.map((s) => [s.slideId, s]));
    expect(bySlide.get('audience')).toEqual({
      slideId: 'audience',
      native: ['h', 'p1', 'rows'],
      raster: ['dia1'],
    });
    expect(bySlide.get('site')).toEqual({ slideId: 'site', native: ['h', 'p1'], raster: ['fig'] });
    expect(bySlide.get('opener-brand')).toMatchObject({
      slideId: 'opener-brand',
      native: ['h', 'p1', 'credit'],
      raster: [],
    });
    // the opener's two-tone picture was regenerated at 2x and its full-sheet box travels to verify
    expect(bySlide.get('opener-brand')?.pictures).toEqual([
      { box: [0, 0, 1600, 900], regenerated: true },
    ]);
    expect(bySlide.get('audience')?.pictures).toBeUndefined();
    const fonts = native.reports[0]?.fonts;
    expect(fonts).toBeDefined();
    expect([...(fonts?.embedded ?? []), ...(fonts?.requiredOnViewer ?? [])]).toContain(
      'GT Inter Display',
    );
    expect([...(fonts?.embedded ?? []), ...(fonts?.requiredOnViewer ?? [])]).toContain(
      'GT Inter Text 22',
    );
  });

  test.skipIf(!existsSync(VENV_PYTHON))(
    'the files reopen with python-pptx with four slides each',
    () => {
      const files = [...flatten.files, ...native.files];
      const script = [
        'import sys, json',
        'from pptx import Presentation',
        'from pptx.util import Emu',
        'out = []',
        'for path in sys.argv[1:]:',
        '    p = Presentation(path)',
        '    shapes = sum(len(s.shapes) for s in p.slides)',
        '    titles = [s.shapes.title.text if s.shapes.title is not None else None for s in p.slides]',
        '    out.append({"path": path, "slides": len(p.slides), "shapes": shapes, "width": p.slide_width, "height": p.slide_height, "notes": sum(1 for s in p.slides if s.has_notes_slide), "names": [s.name for s in p.slides], "titles": titles})',
        'print(json.dumps(out))',
      ].join('\n');
      const raw = execFileSync(VENV_PYTHON, ['-c', script, ...files], { encoding: 'utf8' });
      const rows = JSON.parse(raw) as {
        path: string;
        slides: number;
        shapes: number;
        width: number;
        height: number;
        names: string[];
        titles: (string | null)[];
      }[];
      expect(rows).toHaveLength(4);
      const titles = ids.map((id, i) => slideTitle(slides[id] as Slide, i + 1));
      for (const row of rows) {
        expect(row.slides).toBe(4);
        expect(row.width).toBe(12_192_000);
        expect(row.height).toBe(6_858_000);
        expect(row.shapes).toBeGreaterThan(0);
        expect(row.names).toEqual(titles);
        expect(row.titles).toEqual(titles);
      }
    },
  );

  test.skipIf(!catalog.built)(
    'native with embedFonts lists the font parts in presentation.xml',
    async () => {
      const zip = await openPackage(readFileSync(native.files[0] ?? ''));
      const listed = await listEmbeddedFonts(zip);
      expect(listed.length).toBeGreaterThan(0);
      expect(native.reports[0]?.fonts.embedded).toEqual(listed);
    },
  );
});
