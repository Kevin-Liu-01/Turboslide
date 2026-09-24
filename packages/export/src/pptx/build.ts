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
// under `embedFonts` only), stored media, and the package validation the report fails on. Since the
// features round's ship two a shader block's frame travels as its own picture in both modes
// (docs/FEATURES.md 5.5; audit-shaders 9): the frame file (the long side 3200) at the block's box,
// named `ts:<slide>#<block>` with the recipe in `descr`, over the sheet raster in Perfect the way the
// kit's picture logos sit, over the block's own 2x raster in Editable text; a shader whose frame
// was missing or stale is the report's one `shaders:` row.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import PptxGenJS from 'pptxgenjs';

import { decodeImage } from '@turboslide/effects/io';
import type { ExportMode, PageRasterEntry } from '@turboslide/schema/export';
import { PAGE_RASTER_BUDGETS, isContinuousToneBlockType } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { shapeGuides } from '@turboslide/schema/shapes';
import { COLUMN_GAP_PX } from '@turboslide/schema/typography';

import { cleanContentTypes, setAppTitles, stripRepairRisks } from '../ooxml/clean.ts';
import type { ContentTypesClean } from '../ooxml/clean.ts';
import { embedFonts } from '../ooxml/fonts.ts';
import type { EmbedFont } from '../ooxml/fonts.ts';
import { readGeometry } from '../ooxml/geometry.ts';
import type { ShapeBounds } from '../ooxml/geometry.ts';
import { groupShapes } from '../ooxml/groups.ts';
import { toConnector, writeAdjustValues, writeAltText, writeColumns } from '../ooxml/shapes.ts';
import { addHiddenTitle, setSlideName } from '../ooxml/titles.ts';
import type { HiddenTitle } from '../ooxml/titles.ts';
import { validatePackage } from '../ooxml/validate.ts';
import type { PackageValidation } from '../ooxml/validate.ts';
import { openPackage, readPart, slideParts, writePackage, writePart } from '../ooxml/zip.ts';
import { KIT_LOGO_BLOCK_IDS } from '../scene/kit-logos.ts';
import { pendingShadersOf, shadersOf } from '../scene/shaders.ts';
import type { SceneShader } from '../scene/shaders.ts';
import { shaderReportRow } from '../report.ts';
import type { Scene, SceneRaster, SceneText } from '../scene/types.ts';
import { PAGE_EMU, PAGE_IN, compositeHex, parseCssColor, pxToEmu, szOf } from '../units.ts';
import { addSceneChart } from './chart.ts';
import type { FontSet, FontsCatalog } from './fonts-map.ts';
import { entryFor, pickFamily } from './fonts-map.ts';
import { addPicture, addPictureBackground, addRaster, dataUri, mimeOf } from './images.ts';
import type { PictureSource } from './images.ts';
import { addCross, addLinkRect, addSceneLine, addSceneRect, addSceneRule } from './lines.ts';
import { linkResolver } from './links.ts';
import type { LinkResolver } from './links.ts';
import { defineLayout, defineMasters, paperMasterName, pictureMasterName } from './masters.ts';
import { addSceneNotes } from './notes.ts';
import type { BaselineTarget } from './baseline.ts';
import { describeFormats, encodePageRaster } from './page-raster.ts';
import type { PageRaster } from './page-raster.ts';
import { objectName } from './shapes.ts';
import { addSceneTable } from './table.ts';
import { addSceneText, addShapeText, familyFor } from './text.ts';
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
  /** Merged cells written as rowspan or colspan anchors (gslides-parity SPEC-2 2.7.1). */
  merged?: number;
};

/** The counts the parity round two reads back (gslides-parity SPEC-2 11.3). */
export type RoundTwoCounts = {
  italicRuns: number;
  rotated: number;
  charts: number;
  connectors: number;
  numCol: number;
  avLst: number;
  /** Shapes and text boxes whose block's alt text was written as `descr` (SPEC-2 2.5.6). */
  altTexts: number;
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
  /** The parity round two counts of the written file (SPEC-2 11.3); absent on a result built elsewhere. */
  counts?: RoundTwoCounts;
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
  const counts: RoundTwoCounts = {
    italicRuns: 0,
    rotated: 0,
    charts: 0,
    connectors: 0,
    numCol: 0,
    avLst: 0,
    altTexts: 0,
  };
  /**
   * The post-process rewrites per slide index: connectors, adjust values, columns and the alt
   * text of shapes and text boxes (SPEC-2 2.2.10, 2.3.2, 2.4.7, 2.5.6).
   */
  const rewrites: {
    connectors: { name: string; ends: NonNullable<Scene['lines']>[number]['connect'] }[];
    adjusts: { name: string; guides: string[]; values: number[] }[];
    columns: { name: string; columns: number }[];
    alts: { name: string; alt: string }[];
  }[] = [];

  for (const [sceneIndex, scene] of scenes.entries()) {
    const paperHex = parseCssColor(scene.paper).hex;
    const hairHex = parseCssColor(scene.frame.rules[0]?.color ?? scene.ink).hex;
    const namePrefix = `ts:${scene.slideId}`;
    const hasPicture =
      Boolean(scene.picture) && !scene.pictureExcluded && scene.pictureFile !== undefined;
    // the picture object that covers the sheet at the bottom of the stack is the slide background
    // (gslides-parity SPEC-2 2.6.4, 1.5): the chrome free master, the raster as the background,
    // the frame as alpha lines over it, as an unconverted picture kind exports
    const backgroundRaster =
      options.mode === 'native' && scene.background?.pictureRasterId !== undefined
        ? scene.rasters.find((r) => r.id === scene.background?.pictureRasterId && r.file)
        : undefined;
    const usePictureMaster =
      options.mode === 'flatten' || hasPicture || backgroundRaster !== undefined;
    const slideRewrites: (typeof rewrites)[number] = {
      connectors: [],
      adjusts: [],
      columns: [],
      alts: [],
    };
    rewrites.push(slideRewrites);
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
      paperHex,
    };
    // a text box with columns is rewritten with numCol after pptxgenjs wrote it (SPEC-2 2.2.10)
    const noteColumns = (text: SceneText): void => {
      if (text.columns !== undefined && text.columns > 1)
        slideRewrites.columns.push({
          name: objectName(namePrefix, text.id, text.userGroup, text.group),
          columns: text.columns,
        });
    };
    let page: PageRasterEntry | undefined;
    // the dithered pictures of the slide and the state each was shot in (SPEC-3 10.4)
    for (const entry of scene.dithers ?? [])
      residual.add(`dither: ${scene.slideId}#${entry.blockId} ${entry.key12} ${entry.state}`);

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
      // the brand kit's picture logos over the sheet raster at their boxes, the 3x shots the
      // extractor took of them (docs/FEATURES.md 4.8, row logos.export.pdf-pptx-crisp): the sheet
      // raster draws them at 2x, and this object is the crisp one under zoom, the way the GT
      // wordmark's PNG sits on the master over the same pixels; nothing on a deck under the GT mark
      for (const raster of scene.rasters) {
        if (!KIT_LOGO_BLOCK_IDS.has(raster.blockId) || raster.file === undefined) continue;
        if (existsSync(raster.file)) addRaster(slide, raster, namePrefix);
      }
      // the shader frames over the sheet raster at their boxes (docs/FEATURES.md 5.5): the sheet
      // draws them at 2x, and this object is the frame's own pixels, the long side 3200
      addShaderFrames(slide, scene, namePrefix, residual);
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
      // The slide background colour (SPEC-2 2.6.1, 2.6.2): the layer the page measured, composite
      // on the paper; the deck default is the master's paper otherwise
      if (scene.background?.color !== undefined && backgroundRaster === undefined) {
        const parsed = parseCssColor(scene.background.color);
        slide.background = {
          color: parsed.alpha < 1 ? compositeHex(parsed, paperHex) : parsed.hex,
        };
      }
      // The picture, then the chrome over it.
      if (hasPicture || backgroundRaster !== undefined) {
        if (backgroundRaster !== undefined) {
          const variantFile = scene.background?.pictureVariantFile;
          if (variantFile !== undefined && existsSync(variantFile)) {
            // the dithered covering picture travels as its variant's own bytes (SPEC-3 10.4): the
            // 1-bit file the store holds, not the raster the page shot
            slide.background = { data: dataUri(readFileSync(variantFile), 'image/png') };
            residual.add(
              `${scene.slideId}: the picture object ${backgroundRaster.blockId} covers the sheet at the bottom of the stack and travels as the slide background from its dither variant file (gslides-parity SPEC-3 10.4)`,
            );
          } else {
            addPictureBackground(slide, backgroundRaster);
            residual.add(
              `${scene.slideId}: the picture object ${backgroundRaster.blockId} covers the sheet at the bottom of the stack and travels as the slide background, the form a picture kind exports (gslides-parity SPEC-2 2.6.4)`,
            );
          }
        } else {
          const source = readPictureSource(scene);
          if (source) {
            const placed = addPicture(slide, scene, source, namePrefix);
            if (placed === 'cover' && scene.picture && scene.picture.objectPosition !== '50% 50%')
              residual.add(
                `${scene.slideId}: the picture is a center cover crop; object-position ${scene.picture.objectPosition} is not carried`,
              );
          }
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
      const onPaper = { paperHex, namePrefix, residual };
      const withLink = (
        blockId: string | undefined,
      ): typeof onPaper & { hyperlink?: PptxGenJS.HyperlinkProps } => {
        const hyperlink = blockId === undefined ? undefined : blockLink(blockId);
        return hyperlink ? { ...onPaper, hyperlink } : onPaper;
      };
      // the text layer of a shape with text (SPEC-2 2.2.17) merges into the shape's addText
      const shapeTexts = new Map<string, SceneText>();
      for (const text of scene.texts)
        if (text.inShape !== undefined && text.lines.length > 0) shapeTexts.set(text.inShape, text);
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
            rows: written.rows,
            columns: written.columns,
            ...(written.merged > 0 ? { merged: written.merged } : {}),
          });
          residual.add(
            `table: ${key} written as a:tbl (${written.rows} by ${written.columns}${written.merged > 0 ? `, ${written.merged} merged cell(s)` : ''}); the per cell 3 px budget is measured by the verify loop, which falls back to ruled rows when a cell misses it`,
          );
          if (written.rotated)
            residual.add(
              `table: ${key} is rotated on the sheet; pptxgenjs writes no rotation on a table, so the file holds it upright at its box (gslides-parity SPEC-2 2.1.1)`,
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
      // a block's rect is named after the block (the verify loop reads `ts:<slide>#<block>` back,
      // the connector post-process attaches to it); a plate, chip or panel keeps its index name
      scene.rects.forEach((rect, i) => {
        const name = rect.blockId ?? `rect/${i}`;
        const shapeText = rect.blockId !== undefined ? shapeTexts.get(rect.blockId) : undefined;
        if (shapeText && rect.role === 'shape') {
          if (addShapeText(slide, rect, shapeText, textOptions, name)) {
            noteColumns(shapeText);
          } else addSceneRect(slide, rect, withLink(rect.blockId), name);
        } else addSceneRect(slide, rect, withLink(rect.blockId), name);
        if (rect.alt !== undefined && rect.alt !== '')
          slideRewrites.alts.push({
            name: objectName(namePrefix, name, rect.userGroup, rect.group),
            alt: rect.alt,
          });
        if (rect.preset !== undefined && rect.adjust !== undefined && rect.adjust.length > 0)
          slideRewrites.adjusts.push({
            name: objectName(namePrefix, name, rect.userGroup, rect.group),
            guides: shapeGuides(rect.preset),
            values: rect.adjust,
          });
      });
      scene.rules
        .filter((rule) => rule.blockId === undefined || !asTable.has(rule.blockId))
        .forEach((rule, i) => addSceneRule(slide, rule, onPaper, `rule/${i}`));
      // the lines, arrows, connectors and paths of shape blocks (docs/freeform.md; SPEC-2 2.4)
      (scene.lines ?? []).forEach((line) => {
        addSceneLine(slide, line, withLink(line.blockId), line.blockId);
        if (line.alt !== undefined && line.alt !== '')
          slideRewrites.alts.push({
            name: objectName(namePrefix, line.blockId, line.userGroup),
            alt: line.alt,
          });
        if (line.connect !== undefined && (line.connect.start || line.connect.end))
          slideRewrites.connectors.push({
            name: objectName(namePrefix, line.blockId, line.userGroup),
            ends: line.connect,
          });
      });
      for (const text of scene.texts) {
        if (!text.native) continue;
        if (asTable.has(text.blockId)) continue;
        if (text.inShape !== undefined && shapeTexts.has(text.inShape)) continue;
        addSceneText(slide, text, textOptions);
        noteColumns(text);
        if (text.alt !== undefined && text.alt !== '')
          slideRewrites.alts.push({
            name: objectName(namePrefix, text.id, text.userGroup, text.group),
            alt: text.alt,
          });
        if (text.lines.some((l) => l.runs.some((r) => r.gt)))
          residual.add(
            `${scene.slideId}#${text.blockId}: the GT letters are an invisible run under the mark; text after the mark on that line may shift by the width difference`,
          );
      }
      if (scene.counter) addSceneText(slide, scene.counter, textOptions);
      // the charts as chart parts (SPEC-2 2.8.1); their boxes are picture regions in the verify loop
      for (const chart of scene.charts ?? []) {
        addSceneChart(
          slide,
          chart,
          { fontSet: options.fontSet, namePrefix, families, paperHex },
          pptx,
        );
        counts.charts += 1;
        residual.add(
          `chart: ${scene.slideId}#${chart.blockId} written as a ${chart.kind} chart part (addChart); its box is a picture region in the verify loop, reported and never gated (gslides-parity SPEC-2 2.8.1)`,
        );
      }
      for (const raster of scene.rasters) {
        if (raster.blockId === 'wordmark') continue;
        if (backgroundRaster !== undefined && raster.id === backgroundRaster.id) continue;
        if (!addRaster(slide, raster, namePrefix, undefined, blockLink(raster.blockId)))
          warnings.push(`${scene.slideId}#${raster.blockId}: raster ${raster.id} has no file`);
      }
      // the shader frames over the blocks' own rasters (docs/FEATURES.md 5.5): the picture the
      // verifier reads as `ts:<slide>#<block>`, the long side 3200, the recipe in descr
      addShaderFrames(slide, scene, namePrefix, residual);

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

  // the one shader row (5.5): the shaders whose frame was missing or stale at export time; the
  // studio's wait replaces it with the count it waited for and the seconds (server/download.ts)
  const pendingShaders = pendingShadersOf(scenes);
  const shaderRow = shaderReportRow(pendingShaders.length);
  if (shaderRow !== null) residual.add(shaderRow);

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
    let xml = strip.xml;
    // the shape rewrites of SPEC-2 2.2.10, 2.3.2 and 2.4.7 on the named shapes, before grouping
    const slideRewrites = rewrites[i];
    if (slideRewrites) {
      for (const adjust of slideRewrites.adjusts) {
        const out = writeAdjustValues(xml, adjust.name, adjust.guides, adjust.values);
        xml = out.xml;
        if (out.written) counts.avLst += 1;
      }
      for (const column of slideRewrites.columns) {
        const out = writeColumns(xml, column.name, column.columns, pxToEmu(COLUMN_GAP_PX));
        xml = out.xml;
        if (out.written) counts.numCol += 1;
      }
      for (const connector of slideRewrites.connectors) {
        const out = toConnector(xml, connector.name, connector.ends ?? {});
        xml = out.xml;
        if (out.written) counts.connectors += 1;
      }
      for (const alt of slideRewrites.alts) {
        const out = writeAltText(xml, alt.name, alt.alt);
        xml = out.xml;
        if (out.written) counts.altTexts += 1;
      }
    }
    const grouped = groupShapes(xml);
    groups += grouped.groups.length;
    xml = grouped.xml;
    if (scene) {
      xml = setSlideName(xml, scene.title ?? scene.slideId);
      xml = addHiddenTitle(xml, hiddenTitleFor(scene, options.fontSet));
    }
    counts.italicRuns += (xml.match(/<a:rPr\b[^>]*\si="1"/g) ?? []).length;
    counts.rotated += (xml.match(/<a:xfrm\b[^>]*\srot="-?\d+"/g) ?? []).length;
    writePart(zip, part, xml);
  }
  if (counts.connectors > 0)
    residual.add(
      `connectors: ${counts.connectors} connector(s) written as p:cxnSp with stCxn and endCxn on their targets, so PowerPoint moves them with the shapes (gslides-parity SPEC-2 2.4.7)`,
    );
  if (counts.rotated > 0)
    residual.add(
      `rotation: ${counts.rotated} object(s) carry a rotation or a flip on their own xfrm; a rotated group is written per member (gslides-parity SPEC-2 2.1)`,
    );
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
    counts,
    links,
    residual: [...residual],
    warnings,
  };
}

/** The families a font set names for the deck's ladder, for the report when nothing was rendered. */
/**
 * The shader frames of a scene as pictures at their boxes (docs/FEATURES.md 5.5): the frame file
 * itself, the long side 3200, named `ts:<slide>#<block>` (no rid suffix: the verifier and the row
 * read the block's name), the recipe as the picture's `descr`, opaque. A shader with no frame on
 * disk or no measured box is left to the sheet or the block raster and the report's row.
 */
export function addShaderFrames(
  slide: PptxGenJS.Slide,
  scene: Scene,
  namePrefix: string,
  residual: Set<string>,
): SceneShader[] {
  const placed: SceneShader[] = [];
  for (const shader of shadersOf(scene)) {
    if (shader.file === undefined || shader.box === undefined || !existsSync(shader.file)) continue;
    const bytes = readFileSync(shader.file);
    const raster: SceneRaster = {
      id: shader.blockId,
      blockId: shader.blockId,
      kind: 'material',
      selector: '',
      box: shader.box,
      alpha: false,
      scale: 2,
      alt: JSON.stringify(shader.recipe),
    };
    if (!addRaster(slide, raster, namePrefix, bytes)) continue;
    placed.push(shader);
    const size = shader.size === undefined ? '' : ` (${shader.size[0]} by ${shader.size[1]})`;
    residual.add(
      `shader: ${scene.slideId}#${shader.blockId} travels as its frame${size} at the block's box with the recipe in descr${shader.stale ? '; the frame predates its recipe and is drawn as it is' : ''} (docs/FEATURES.md 5.5)`,
    );
  }
  return placed;
}

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
