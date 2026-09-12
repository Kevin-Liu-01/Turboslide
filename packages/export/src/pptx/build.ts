// One theme's scenes to one PPTX (SPEC 8.2). Native mode: the paper master carries the frame and
// the wordmark; a full-picture slide takes the chrome-free master, its picture as the background,
// the frame as alpha lines over it, the plates and chips as paper rectangles; text boxes at the
// browser's boxes, rows as hairlines plus key and value boxes, icons and marks as 2x PNGs, raster
// blocks as 2x PNGs, notes. Flatten mode: every text as an invisible run (`<a:alpha val="0"/>`)
// under the 2x sheet screenshot placed as a full-page picture, so the file is pixel identical in
// viewers that ignore text alpha and the text stays searchable and recoverable; the screenshot
// travels in the encoding the page raster policy picks (page-raster.ts) and its decoded mismatch
// is the report's `page.fraction`. The pptxgenjs buffer then goes through the OOXML post-process:
// the repair-risk strip (kern, empty ext lists), row groups, the slide name and the hidden title
// placeholder per slide, the content types clean, the app.xml titles, embedded fonts (native mode
// under `embedFonts` only), stored media, and the package validation the report fails on.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import PptxGenJS from 'pptxgenjs';

import { decodeImage } from '@turboslide/effects/io';
import type { ExportMode, PageRasterEntry } from '@turboslide/schema/export';
import { PAGE_RASTER_BUDGETS, isContinuousToneBlockType } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { cleanContentTypes, setAppTitles, stripRepairRisks } from '../ooxml/clean.ts';
import type { ContentTypesClean } from '../ooxml/clean.ts';
import { embedFonts } from '../ooxml/fonts.ts';
import type { EmbedFont } from '../ooxml/fonts.ts';
import { readGeometry } from '../ooxml/geometry.ts';
import type { ShapeBounds } from '../ooxml/geometry.ts';
import { groupShapes } from '../ooxml/groups.ts';
import { addHiddenTitle, setSlideName } from '../ooxml/titles.ts';
import type { HiddenTitle } from '../ooxml/titles.ts';
import { validatePackage } from '../ooxml/validate.ts';
import type { PackageValidation } from '../ooxml/validate.ts';
import { openPackage, readPart, slideParts, writePackage, writePart } from '../ooxml/zip.ts';
import type { Scene } from '../scene/types.ts';
import { PAGE_EMU, PAGE_IN, parseCssColor, pxToEmu, szOf } from '../units.ts';
import type { FontSet, FontsCatalog } from './fonts-map.ts';
import { entryFor, pickFamily } from './fonts-map.ts';
import { addPicture, addRaster, dataUri, mimeOf } from './images.ts';
import type { PictureSource } from './images.ts';
import { addCross, addLinkRect, addSceneLine, addSceneRect, addSceneRule } from './lines.ts';
import { linkResolver } from './links.ts';
import type { LinkResolver } from './links.ts';
import { defineLayout, defineMasters, paperMasterName, pictureMasterName } from './masters.ts';
import { addSceneNotes } from './notes.ts';
import type { BaselineTarget } from './baseline.ts';
import { describeFormats, encodePageRaster } from './page-raster.ts';
import type { PageRaster } from './page-raster.ts';
import { addSceneTable } from './table.ts';
import { addSceneText, familyFor } from './text.ts';
import type { TextEmitOptions } from './text.ts';

export type BuildOptions = {
  deckId: string;
  deckTitle: string;
  revision: number;
  theme: Theme;
  mode: ExportMode;
  fontSet: FontSet;
  fontsCatalog: FontsCatalog;
  /** The wordmark PNG at 2x for the master. */
  wordmarkPng?: Uint8Array;
  defaultNotes?: string;
  /**
   * Embed the export faces as fntdata parts. Off by default (docs/pptx.md): a viewer that rejects
   * a font part repairs the file, and the flatten mode has no visible text the faces would draw.
   * Honoured in native mode only; a flatten build records the request in its residual.
   */
  embedFonts?: boolean;
  /** The first-baseline target (pptx/baseline.ts); default libreoffice, the verify renderer. */
  baseline?: BaselineTarget;
  /** Skip the JPEG candidate of the page raster policy (a PNG-only flatten file). */
  noJpeg?: boolean;
  /**
   * Carry the speaker notes (`addNotes`, one notes part per slide); off by default
   * (gslides-parity SPEC 7.2.13, decision 15.2).
   */
  includeNotes?: boolean;
  /**
   * How a table block travels in Editable text (gslides-parity SPEC 7.3): `auto` (default) writes
   * `addTable` unless the block is in `tableFallback`, `table` always does, `rows` always writes
   * the ruled rows construction (hairlines plus grouped text boxes).
   */
  tableMode?: TableMode;
  /** `<slideId>#<blockId>` of the tables that missed the per cell budget and fall back to ruled rows. */
  tableFallback?: ReadonlySet<string>;
  onPage?: (scene: Scene, raster: PageRaster) => void;
};

export type TableMode = 'auto' | 'table' | 'rows';

/** How one table block left the builder. */
export type TableOutcome = {
  slideId: string;
  blockId: string;
  written: 'table' | 'rows';
  rows: number;
  columns: number;
};

export type BuildSlideReport = {
  slideId: string;
  title: string;
  native: string[];
  raster: string[];
  /** Flatten mode: the page raster the slide carries. */
  page?: PageRasterEntry;
};

/**
 * The flatten cover picture sits 0.01 mm (360 EMU, 0.047 sheet px) below the page's top edge.
 * LibreOffice paints a picture shape through its 1/100 mm drawing layer and a full-page picture at
 * y = 0 lands a fraction of a device pixel high, which resamples the sheet: measured in the render
 * worker image on the deck's finest page (skills-marks, 2x), 6,916 mismatched pixels at y = 0,
 * 32,114 at -0.047 px, 0 at +0.047 px, 5 at +0.094 px (M2 integration, calibration.json
 * `pictureShapeOffset`). Every other renderer snaps 0.047 px away. The page background fill has
 * no such offset but cannot be used: QuickLook paints the invisible text layer over it.
 */
export const COVER_OFFSET_IN = 360 / 914_400;

/** The content box a slide with no measured text takes for its hidden title, in sheet px (SPEC 2.1 content origin). */
export const DEFAULT_TITLE_BOX: [number, number, number, number] = [137, 137, 1326, 60];

export type BuildResult = {
  bytes: Uint8Array;
  /** Families the runs use, in first-use order. */
  families: string[];
  embedded: string[];
  slides: BuildSlideReport[];
  geometry: ShapeBounds[];
  geometryInBounds: boolean;
  groups: number;
  /** Flatten: every page raster within PAGE_RASTER_BUDGETS.perfect and the package valid. */
  perfect: boolean;
  validation: PackageValidation;
  contentTypes: ContentTypesClean;
  /** kern attributes and empty ext lists removed over every slide part; custGeom counted. */
  stripped: { kern: number; extLst: number; custGeom: number };
  /** Every table block of a native build and how it was written (gslides-parity SPEC 7.3). */
  tables: TableOutcome[];
  /** Block and run links written (SPEC 7.2.7, 7.2.8), and the slide links with no target in the file. */
  links: { written: number; unresolved: string[] };
  residual: string[];
  warnings: string[];
};

function readPictureSource(scene: Scene): PictureSource | undefined {
  if (!scene.pictureFile || !existsSync(scene.pictureFile)) return undefined;
  const bytes = readFileSync(scene.pictureFile);
  const mime = mimeOf(scene.pictureFile);
  // the dimensions come from the measured element for the twin, and are 2x for a regenerated PNG
  const width = scene.pictureFile.endsWith('@2x.png')
    ? 3200
    : (scene.picture?.naturalWidth ?? 1600);
  const height = scene.pictureFile.endsWith('@2x.png')
    ? 1800
    : (scene.picture?.naturalHeight ?? 900);
  return { bytes, mime, width, height };
}

/**
 * A page carries continuous-tone pixels when one of its blocks is a screenshot, a photograph or a
 * shader frame, when the extractor tagged an opaque raster (a shot or an html escape's picture), or
 * when its full picture is a photograph that was not regenerated as a two-tone dither.
 */
export function isContinuousTone(scene: Scene): boolean {
  if (scene.blocks.some((b) => isContinuousToneBlockType(b.type))) return true;
  if (scene.rasters.some((r) => r.kind === 'shot' || r.kind === 'html' || r.kind === 'material'))
    return true;
  return (
    scene.picture !== undefined &&
    scene.pictureRegenerated !== true &&
    scene.pictureExcluded !== true
  );
}

/**
 * The hidden title placeholder of a slide: the slide title at the heading's text box in the
 * heading's face, size and color (an alpha 0 run), or the content box in the display face when the
 * slide measured no text. Kept inside the page so the geometry read-back stays in bounds.
 */
export function hiddenTitleFor(scene: Scene, fontSet: FontSet): HiddenTitle {
  const headings = new Set(scene.blocks.filter((b) => b.type === 'heading').map((b) => b.blockId));
  const text = scene.texts.find((t) => headings.has(t.blockId)) ?? scene.texts[0];
  const box = text?.textBox ?? DEFAULT_TITLE_BOX;
  const x = Math.max(0, pxToEmu(box[0]));
  const y = Math.max(0, pxToEmu(box[1]));
  const cx = Math.max(1, Math.min(pxToEmu(box[2]), PAGE_EMU.width - x));
  const cy = Math.max(1, Math.min(pxToEmu(box[3]), PAGE_EMU.height - y));
  return {
    title: scene.title ?? scene.slideId,
    name: `ts:${scene.slideId}#title`,
    off: [x, y],
    ext: [cx, cy],
    sz: szOf(text?.style.size ?? 44),
    family: text ? familyFor(text.style, fontSet) : pickFamily(44, 500, fontSet).family,
    colorHex: parseCssColor(text?.style.color ?? scene.ink).hex,
  };
}

export async function buildPptx(scenes: Scene[], options: BuildOptions): Promise<BuildResult> {
  const pptx = new PptxGenJS();
  pptx.title = `${options.deckTitle} (${options.theme})`;
  pptx.subject = `Turboslide export, revision ${options.revision}, ${options.mode} mode`;
  pptx.author = 'Turboslide';
  pptx.company = 'General Translation';
  defineLayout(pptx);
  const first = scenes[0];
  if (!first) throw new RangeError('buildPptx: no scenes');
  defineMasters(pptx, { theme: options.theme, scene: first, wordmarkPng: options.wordmarkPng });

  const families = new Set<string>();
  const residual = new Set<string>();
  const warnings: string[] = [];
  const slidesReport: BuildSlideReport[] = [];
  const pages: PageRaster[] = [];
  const tables: TableOutcome[] = [];
  const links = { written: 0, unresolved: [] as string[] };
  const fileSlideIds = scenes.map((scene) => scene.slideId);
  const tableMode = options.tableMode ?? 'auto';

  for (const [sceneIndex, scene] of scenes.entries()) {
    const paperHex = parseCssColor(scene.paper).hex;
    const hairHex = parseCssColor(scene.frame.rules[0]?.color ?? scene.ink).hex;
    const namePrefix = `ts:${scene.slideId}`;
    const hasPicture =
      Boolean(scene.picture) && !scene.pictureExcluded && scene.pictureFile !== undefined;
    const usePictureMaster = options.mode === 'flatten' || hasPicture;
    const slide = pptx.addSlide({
      masterName: usePictureMaster
        ? pictureMasterName(options.theme)
        : paperMasterName(options.theme),
    });
    // links resolve against this file's slides (gslides-parity SPEC 7.2.7, 7.2.8); a slide link
    // whose target is not in the file (a skipped slide) is dropped and named
    const resolve = linkResolver(fileSlideIds, sceneIndex);
    const linkOf: LinkResolver = (href) => {
      const props = resolve(href);
      if (props === undefined) {
        const note = `${scene.slideId}: ${href}`;
        if (!links.unresolved.includes(note)) links.unresolved.push(note);
      } else links.written += 1;
      return props;
    };
    const blockLink = (blockId: string): PptxGenJS.HyperlinkProps | undefined => {
      const href = scene.blocks.find((b) => b.blockId === blockId)?.link;
      return href === undefined ? undefined : linkOf(href);
    };
    const textOptions: TextEmitOptions = {
      fontSet: options.fontSet,
      invisible: options.mode === 'flatten',
      hairHex,
      families,
      namePrefix,
      baseline: options.baseline ?? 'libreoffice',
      residual,
      links: linkOf,
    };
    let page: PageRasterEntry | undefined;

    if (options.mode === 'flatten') {
      // The text layer first, then the 2x sheet raster as a full-page picture over it. The runs
      // carry alpha 0, and the picture covers them as well, because QuickLook ignores text fill
      // alpha (measured on this machine: the layer rendered over the raster as a p:bg blip);
      // behind the picture the text stays searchable and extractable in every viewer.
      slide.background = { color: paperHex };
      for (const text of scene.texts) addSceneText(slide, text, textOptions);
      if (scene.counter) addSceneText(slide, scene.counter, textOptions);
      if (scene.sheetImage && existsSync(scene.sheetImage)) {
        const shot = await decodeImage(scene.sheetImage);
        const raster = await encodePageRaster(shot, {
          continuousTone: isContinuousTone(scene),
          ...(options.noJpeg ? { noJpeg: true } : {}),
        });
        pages.push(raster);
        options.onPage?.(scene, raster);
        page = {
          format: raster.format,
          bytes: raster.bytes.byteLength,
          colors: raster.colors,
          mismatch: raster.mismatch,
          fraction: raster.fraction,
        };
        if (raster.fraction > PAGE_RASTER_BUDGETS.perfect)
          residual.add(
            `${scene.slideId}: the ${raster.format} page raster mismatches its shot by ${(raster.fraction * 100).toFixed(3)} percent, over the perfect budget of ${PAGE_RASTER_BUDGETS.perfect * 100}`,
          );
        slide.addImage({
          data: dataUri(raster.bytes, raster.mime),
          x: 0,
          y: COVER_OFFSET_IN,
          w: PAGE_IN.width,
          // shortened by the offset so the shape ends on the page edge; measured equally exact
          h: PAGE_IN.height - COVER_OFFSET_IN,
          altText: `${scene.title ?? scene.slideId} (${scene.theme}), the sheet at 2x`,
          objectName: `${namePrefix}#sheet`,
        });
      } else {
        warnings.push(
          `${scene.slideId}: no sheet screenshot; the slide shows the text layer on paper`,
        );
      }
      // a linked block is an invisible hit target over its box, above the cover (SPEC 7.2.7)
      for (const block of scene.blocks) {
        if (block.link === undefined) continue;
        const props = linkOf(block.link);
        if (props)
          addLinkRect(slide, block.box, props, paperHex, `${namePrefix}#${block.blockId}/link`);
      }
      if (
        scene.texts.some((t) =>
          t.lines.some((l) => l.runs.some((r) => r.style.link && r.style.link.startsWith('#'))),
        )
      )
        residual.add(
          'links: a slide link on an invisible run of the flatten layer is written as a slide jump; whether PowerPoint honours it under the cover picture is unverified (gslides-parity SPEC 7.2.8)',
        );
    } else {
      // The picture, then the chrome over it.
      if (hasPicture) {
        const source = readPictureSource(scene);
        if (source) {
          const placed = addPicture(slide, scene, source, namePrefix);
          if (placed === 'cover' && scene.picture && scene.picture.objectPosition !== '50% 50%')
            residual.add(
              `${scene.slideId}: the picture is a center cover crop; object-position ${scene.picture.objectPosition} is not carried`,
            );
        }
        const over = { namePrefix };
        scene.frame.rules.forEach((rule, i) => addSceneRule(slide, rule, over, `frame/${i}`));
        scene.frame.crosses.forEach((box, i) =>
          addCross(slide, box, scene.frame.crossColor, over, `cross/${i}`),
        );
        scene.chips.forEach((box, i) =>
          addSceneRect(
            slide,
            { box, fill: scene.paper, role: 'chip' },
            { paperHex, namePrefix },
            `chip/${i}`,
          ),
        );
        if (options.wordmarkPng && scene.wordmark) {
          addRaster(
            slide,
            {
              id: 'wordmark',
              blockId: 'wordmark',
              kind: 'mark',
              selector: '',
              box: scene.wordmark,
              alpha: true,
              scale: 2,
            },
            namePrefix,
            options.wordmarkPng,
          );
        }
      } else if (scene.pictureExcluded) {
        residual.add(
          `${scene.slideId}: share-alike picture excluded; the plate carries the credit (SPEC 11)`,
        );
      }
      const onPaper = { paperHex, namePrefix };
      const withLink = (
        blockId: string | undefined,
      ): typeof onPaper & { hyperlink?: PptxGenJS.HyperlinkProps } => {
        const hyperlink = blockId === undefined ? undefined : blockLink(blockId);
        return hyperlink ? { ...onPaper, hyperlink } : onPaper;
      };
      // Tables (gslides-parity SPEC 7.3): `a:tbl` through addTable unless the mode or the
      // fallback set says ruled rows; a table written as a:tbl keeps its rules and cell texts out
      // of the shape list below, the fallback leaves them in (the rows construction)
      const asTable = new Set<string>();
      for (const table of scene.tables ?? []) {
        const key = `${scene.slideId}#${table.blockId}`;
        const useTable =
          tableMode === 'table' ||
          (tableMode === 'auto' && !(options.tableFallback?.has(key) ?? false));
        if (useTable) {
          const written = addSceneTable(slide, table, scene.texts, { ...textOptions, paperHex });
          asTable.add(table.blockId);
          tables.push({
            slideId: scene.slideId,
            blockId: table.blockId,
            written: 'table',
            ...written,
          });
          residual.add(
            `table: ${key} written as a:tbl (${written.rows} by ${written.columns}); the per cell 3 px budget is measured by the verify loop, which falls back to ruled rows when a cell misses it`,
          );
        } else {
          tables.push({
            slideId: scene.slideId,
            blockId: table.blockId,
            written: 'rows',
            rows: table.rows.length,
            columns: table.columns.length,
          });
          residual.add(
            options.tableFallback?.has(key)
              ? `table: ${key} missed the per cell 3 px budget as a:tbl; written as ruled rows (hairlines plus grouped text boxes, SPEC 8.2)`
              : `table: ${key} written as ruled rows (hairlines plus grouped text boxes) by request`,
          );
        }
      }
      scene.plates.forEach((plate, i) => addSceneRect(slide, plate, onPaper, `plate/${i}`));
      scene.rects.forEach((rect, i) =>
        addSceneRect(slide, rect, withLink(rect.blockId), `rect/${i}`),
      );
      scene.rules
        .filter((rule) => rule.blockId === undefined || !asTable.has(rule.blockId))
        .forEach((rule, i) => addSceneRule(slide, rule, onPaper, `rule/${i}`));
      // the lines and arrows of shape blocks (docs/freeform.md), native with triangle heads
      (scene.lines ?? []).forEach((line, i) =>
        addSceneLine(slide, line, withLink(line.blockId), `line/${i}`),
      );
      for (const text of scene.texts) {
        if (!text.native) continue;
        if (asTable.has(text.blockId)) continue;
        addSceneText(slide, text, textOptions);
        if (text.lines.some((l) => l.runs.some((r) => r.gt)))
          residual.add(
            `${scene.slideId}#${text.blockId}: the GT letters are an invisible run under the mark; text after the mark on that line may shift by the width difference`,
          );
      }
      if (scene.counter) addSceneText(slide, scene.counter, textOptions);
      for (const raster of scene.rasters) {
        if (raster.blockId === 'wordmark') continue;
        if (!addRaster(slide, raster, namePrefix, undefined, blockLink(raster.blockId)))
          warnings.push(`${scene.slideId}#${raster.blockId}: raster ${raster.id} has no file`);
      }
      if (scene.texts.some((t) => t.style.mono))
        residual.add(
          'code panels travel in DejaVu Sans Mono (Menlo on a Mac without it); the face differs per machine unless a mono font is installed (SPEC 8.6)',
        );
    }
    // the notes travel only when asked (gslides-parity SPEC 7.2.13, decision 15.2)
    if (options.includeNotes === true) addSceneNotes(slide, scene.notes, options.defaultNotes);
    slidesReport.push({
      slideId: scene.slideId,
      title: scene.title ?? scene.slideId,
      native: scene.blocks.filter((b) => b.native).map((b) => b.blockId),
      raster: scene.blocks.filter((b) => !b.native).map((b) => b.blockId),
      ...(page ? { page } : {}),
    });
    for (const w of scene.warnings) warnings.push(`${scene.slideId}: ${w}`);
  }

  const raw = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await openPackage(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
  let groups = 0;
  const stripped = { kern: 0, extLst: 0, custGeom: 0 };
  // pptxgenjs numbers the slide parts in insertion order, so part i is scene i
  for (const [i, part] of slideParts(zip).entries()) {
    const scene = scenes[i];
    const strip = stripRepairRisks(await readPart(zip, part));
    stripped.kern += strip.kern;
    stripped.extLst += strip.extLst;
    stripped.custGeom += strip.custGeom;
    const grouped = groupShapes(strip.xml);
    groups += grouped.groups.length;
    let xml = grouped.xml;
    if (scene) {
      xml = setSlideName(xml, scene.title ?? scene.slideId);
      xml = addHiddenTitle(xml, hiddenTitleFor(scene, options.fontSet));
    }
    writePart(zip, part, xml);
  }
  const contentTypes = await cleanContentTypes(zip);
  await setAppTitles(
    zip,
    scenes.map((scene) => scene.title ?? scene.slideId),
  );
  const embedded: string[] = [];
  if (options.embedFonts === true && options.mode === 'native') {
    const fonts: EmbedFont[] = [];
    for (const family of families) {
      const entry = options.fontsCatalog.entries.find((e) => e.family === family);
      if (!entry?.file) continue;
      const path = join(options.fontsCatalog.dir, entry.file);
      if (!existsSync(path)) {
        warnings.push(`${family}: fonts.json names ${entry.file} but the file is missing`);
        continue;
      }
      fonts.push({ family, ttf: readFileSync(path) });
    }
    const result = await embedFonts(zip, fonts);
    embedded.push(...result.embedded);
    warnings.push(...result.warnings);
    residual.add(
      `fonts: ${embedded.length} face(s) embedded as fntdata parts (--embed-fonts); PowerPoint's acceptance of the uncompressed EOT is the scheduled manual pass (docs/export-verification.md)`,
    );
  } else if (options.embedFonts === true) {
    residual.add(
      'fonts: --embed-fonts ignored in flatten mode; the text layer is invisible and no viewer draws it (docs/pptx.md)',
    );
  }
  const validation = await validatePackage(zip);
  for (const issue of validation.issues) warnings.push(`package: ${issue}`);
  if (contentTypes.removedOverrides.length > 0)
    residual.add(
      `package: ${contentTypes.removedOverrides.length} content type override(s) for parts the package does not hold removed (pptxgenjs writes one slideMaster override per slide)`,
    );
  if (stripped.kern > 0 || stripped.extLst > 0)
    residual.add(
      `package: ${stripped.kern} kern="0" attribute(s) and ${stripped.extLst} empty ext list(s) removed; ${stripped.custGeom} custGeom`,
    );
  if (options.mode === 'flatten' && pages.length > 0) {
    const worst = Math.max(...pages.map((p) => p.fraction));
    const bytes = pages.reduce((n, p) => n + p.bytes.byteLength, 0);
    residual.add(
      `pages: ${describeFormats(pages)}; ${(bytes / (1024 * 1024)).toFixed(2)} MiB of page rasters; worst decoded mismatch ${(worst * 100).toFixed(3)} percent at threshold ${PAGE_RASTER_BUDGETS.threshold} (perfect budget ${PAGE_RASTER_BUDGETS.perfect * 100})`,
    );
  }
  if (links.written > 0)
    residual.add(
      `links: ${links.written} hyperlink(s) written (a URL as is, a slide link as a jump to its number in this file; SPEC 7.2.7, 7.2.8)`,
    );
  if (links.unresolved.length > 0)
    residual.add(
      `links: ${links.unresolved.length} slide link(s) with no target in this file were dropped: ${links.unresolved.join('; ')}`,
    );
  residual.add(
    options.includeNotes === true
      ? 'notes: the speaker notes travel as notes parts (includeNotes)'
      : 'notes: left out; pass includeNotes to carry the speaker notes (gslides-parity decision 15.2)',
  );
  const geometry = await readGeometry(zip);
  const perfect =
    options.mode === 'flatten' &&
    pages.length === scenes.length &&
    pages.every((p) => p.fraction <= PAGE_RASTER_BUDGETS.perfect) &&
    validation.valid;
  const bytes = await writePackage(zip);
  return {
    bytes,
    families: [...families],
    embedded,
    slides: slidesReport,
    geometry,
    geometryInBounds: geometry.every((g) => g.inBounds),
    groups,
    perfect,
    validation,
    contentTypes,
    stripped,
    tables,
    links,
    residual: [...residual],
    warnings,
  };
}

/** The families a font set names for the deck's ladder, for the report when nothing was rendered. */
export function familiesOfLadder(set: FontSet): string[] {
  const picks = [
    [88, 500],
    [72, 500],
    [44, 500],
    [26, 400],
    [24, 500],
    [22, 400],
    [20, 400],
    [20, 500],
    [18, 400],
    [15, 400],
    [13, 400],
  ] as const;
  return [...new Set(picks.map(([size, weight]) => pickFamily(size, weight, set).family))];
}

export { entryFor };
