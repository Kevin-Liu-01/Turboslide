// buildOdp: the scenes of one theme as an ODF presentation (gslides-parity SPEC-5 6.3; R09 2):
// `content.xml` with one `draw:page` per scene, `styles.xml` at the deck's page with the deck's
// language, the manifest, the pictures and the media, packaged with `mimetype` first
// (odp/package.ts). Perfect writes the page raster of each sheet (the same raster policy the
// PPTX takes, pptx/page-raster.ts) under paper coloured runs at opacity 0, so the text stays
// searchable; Editable text writes the frame's rules and crosses, the plates and chips, every
// rect and preset as a `draw:custom-shape` from the shape interpreter, the lines, the tables, the
// charts and rasters as pictures, one text frame per measured text with the LibreOffice baseline
// model, the media plugins, the transition on the page style and the animation tree from B1's
// schedule, the notes under `includeNotes`, and `presentation:visibility="hidden"` on a skipped
// slide carried on request. Every element a block draws carries an `xml:id` the animation tree
// targets. The result names what travelled natively and as a raster per slide, the page raster
// facts of a Perfect page, the rows of every lossy path (SPEC-5 0.29) and the residual lines.
import type {
  ExportMode,
  ExportReport,
  ExportReportRow,
  MediaExportMode,
  MotionExportMode,
} from '@turboslide/schema/export';
import { PAGE_RASTER_BUDGETS, isContinuousToneBlockType } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';
import { decodeImage } from '@turboslide/effects/io';

import type { BaselineTarget } from '../pptx/baseline.ts';
import type { FontSet } from '../pptx/fonts-map.ts';
import { encodePageRaster } from '../pptx/page-raster.ts';
import type { PageRaster } from '../pptx/page-raster.ts';
import type { Scene, SceneRect, SceneText } from '../scene/types.ts';
import { mediaFrameXml } from './media.ts';
import { animationTreeXml, transitionOf } from './motion.ts';
import { notesXml } from './notes.ts';
import { metaXml, settingsXml, writeOdfPackage } from './package.ts';
import type { OdfBinaryPart } from './package.ts';
import {
  customShapeXml,
  dashDefinitions,
  pictureFrameXml,
  rasterFrameXml,
  ruleLineXml,
  segmentXml,
} from './shapes.ts';
import type { OdfShapeContext } from './shapes.ts';
import { StyleAllocator, namespaceAttrs, stylesXml } from './styles.ts';
import { tableXml } from './table.ts';
import { paragraphsXml, textFrameXml } from './text.ts';
import type { OdfTextContext } from './text.ts';
import { cssColor, el, xmlId } from './xml.ts';

export type BuildOdpOptions = {
  deckId: string;
  deckTitle: string;
  revision: number;
  theme: Theme;
  mode: ExportMode;
  fontSet: FontSet;
  baseline: BaselineTarget;
  /** The deck's page in sheet pixels (SPEC-5 6.1). */
  page: { width: number; height: number };
  /** The deck's language tag; en-US when absent (SPEC-5 7.1). */
  language?: string;
  includeNotes?: boolean;
  /** The slides to mark hidden (a skipped slide carried under includeSkipped). */
  hidden?: ReadonlySet<string>;
  media?: MediaExportMode;
  motion?: MotionExportMode;
  /** Reads a file the scene names (a raster, the sheet shot, a twin, a media file); undefined when absent. */
  readFile: (path: string) => Uint8Array | undefined;
  /** Skip the JPEG candidate of the page raster policy. */
  noJpeg?: boolean;
  onPage?: (scene: Scene, raster: PageRaster) => void;
};

export type BuiltOdp = {
  bytes: Uint8Array;
  slides: ExportReport['slides'];
  families: string[];
  residual: string[];
  rows: ExportReportRow[];
  warnings: string[];
  /** Perfect with every page raster within budget. */
  perfect: boolean;
  counts: {
    pages: number;
    texts: number;
    shapes: number;
    pictures: number;
    tables: number;
    transitions: number;
    effects: number;
    media: number;
    notes: number;
  };
};

/** The page raster policy's continuous tone flag for a scene. */
function continuousTone(scene: Scene): boolean {
  return (
    scene.blocks.some((block) => isContinuousToneBlockType(block.type)) ||
    (scene.picture !== undefined && !scene.pictureExcluded)
  );
}

export async function buildOdp(scenes: Scene[], options: BuildOdpOptions): Promise<BuiltOdp> {
  const styles = new StyleAllocator();
  const parts: OdfBinaryPart[] = [];
  const families = new Set<string>();
  const residual: string[] = [];
  const rows: ExportReportRow[] = [];
  const warnings: string[] = [];
  const slidesOut: ExportReport['slides'] = [];
  const counts = {
    pages: 0,
    texts: 0,
    shapes: 0,
    pictures: 0,
    tables: 0,
    transitions: 0,
    effects: 0,
    media: 0,
    notes: 0,
  };
  let perfect = options.mode === 'flatten';
  let partN = 0;
  const partNames = new Set<string>();
  const addPart = (folder: string, bytes: Uint8Array, mime: string, hint: string): string => {
    const ext =
      mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : (mime.split('/')[1] ?? 'bin');
    let name = `${folder}/${hint.replace(/[^A-Za-z0-9_-]+/g, '_')}.${ext}`;
    while (partNames.has(name)) {
      partN += 1;
      name = `${folder}/${hint.replace(/[^A-Za-z0-9_-]+/g, '_')}-${partN}.${ext}`;
    }
    partNames.add(name);
    parts.push({ path: name, bytes, mime });
    return name;
  };
  const shapeCtx: OdfShapeContext = {
    styles,
    addPicture: (bytes, mime, hint) => addPart('Pictures', bytes, mime, hint),
  };
  const first = scenes[0];
  const paperHex =
    cssColor(first?.paper)?.hex ?? (options.theme === 'dark' ? '#070707' : '#ffffff');
  const inkHex = cssColor(first?.ink)?.hex ?? (options.theme === 'dark' ? '#f2f2f0' : '#070707');
  const textCtx: OdfTextContext = {
    styles,
    fontSet: options.fontSet,
    language: options.language,
    invisible: options.mode === 'flatten',
    paperHex,
    baseline: options.baseline,
    families,
  };
  const notesParagraph = styles.add(
    'paragraph',
    el('style:paragraph-properties', { 'fo:text-align': 'start' }),
  );

  const pages: string[] = [];
  for (const scene of scenes) {
    counts.pages += 1;
    const ids = new Map<string, string[]>();
    let n = 0;
    const idFor = (blockId: string): Record<string, string> => {
      n += 1;
      const id = xmlId('id-', `${scene.slideId}-${blockId}-${n}`);
      const list = ids.get(blockId) ?? [];
      list.push(id);
      ids.set(blockId, list);
      return { 'xml:id': id, 'draw:id': id };
    };
    const native: string[] = [];
    const raster: string[] = [];
    const body: string[] = [];
    const entry: ExportReport['slides'][number] = {
      slideId: scene.slideId,
      theme: options.theme,
      native: [],
      raster: [],
    };

    // the page style: the transition (SPEC-5 2.4) and the background colour
    const transition =
      options.motion === 'drop'
        ? { attributes: {}, rows: [] }
        : transitionOf(scene.slideId, scene.transition);
    if (Object.keys(transition.attributes).length > 0) counts.transitions += 1;
    rows.push(...transition.rows);
    const backgroundColor = options.mode === 'native' ? cssColor(scene.background?.color) : null;
    const pageStyle = styles.add(
      'drawing-page',
      el('style:drawing-page-properties', {
        'presentation:background-visible': 'true',
        'presentation:background-objects-visible': 'true',
        'presentation:display-footer': 'false',
        'presentation:display-page-number': 'false',
        'presentation:display-date-time': 'false',
        ...(backgroundColor !== null
          ? { 'draw:fill': 'solid', 'draw:fill-color': backgroundColor.hex }
          : {}),
        ...transition.attributes,
      }),
    );

    if (options.mode === 'flatten') {
      // Perfect: the sheet shot under the page raster policy as one covering image, then the
      // invisible text layer (R09 2.4 path a)
      const shot = scene.sheetImage !== undefined ? options.readFile(scene.sheetImage) : undefined;
      if (shot === undefined) {
        warnings.push(`${scene.slideId}: no sheet shot for the Perfect page`);
        perfect = false;
      } else {
        const image = await decodeImage(shot);
        const encoded = await encodePageRaster(image, {
          continuousTone: continuousTone(scene),
          ...(options.noJpeg ? { noJpeg: true } : {}),
        });
        options.onPage?.(scene, encoded);
        const href = addPart('Pictures', encoded.bytes, encoded.mime, `${scene.slideId}-page`);
        body.push(pictureFrameXml(href, scene.sheet, shapeCtx, {}, idFor('page'), scene.title));
        counts.pictures += 1;
        entry.page = {
          format: encoded.format,
          bytes: encoded.bytes.byteLength,
          colors: encoded.colors,
          mismatch: encoded.mismatch,
          fraction: encoded.fraction,
        };
        if (encoded.fraction > PAGE_RASTER_BUDGETS.perfect) perfect = false;
        for (const block of scene.blocks) raster.push(block.blockId);
      }
      for (const text of [...scene.texts, ...(scene.counter ? [scene.counter] : [])]) {
        body.push(textFrameXml(text, textCtx, idFor(text.blockId)));
        counts.texts += 1;
      }
    } else {
      // Editable text: the background picture, the frame, the objects, the texts, the media
      const backgroundRaster = scene.background?.pictureRasterId;
      if (scene.picture !== undefined && !scene.pictureExcluded) {
        const file =
          scene.pictureFile !== undefined ? options.readFile(scene.pictureFile) : undefined;
        if (file !== undefined) {
          const mime =
            scene.pictureFile?.toLowerCase().endsWith('.jpg') ||
            scene.pictureFile?.toLowerCase().endsWith('.jpeg')
              ? 'image/jpeg'
              : 'image/png';
          body.push(
            pictureFrameXml(
              addPart('Pictures', file, mime, `${scene.slideId}-picture`),
              scene.picture.box,
              shapeCtx,
              { alt: scene.picture.alt },
              idFor('picture'),
            ),
          );
          counts.pictures += 1;
          raster.push('picture');
        } else warnings.push(`${scene.slideId}: the picture file is missing`);
      }
      for (const rule of scene.frame.rules)
        body.push(ruleLineXml(rule.box, rule.color, rule.width, shapeCtx));
      for (const cross of scene.frame.crosses) {
        const [x, y, w, h] = cross;
        body.push(ruleLineXml([x, y + h / 2 - 0.5, w, 1], scene.frame.crossColor, 1, shapeCtx));
        body.push(ruleLineXml([x + w / 2 - 0.5, y, 1, h], scene.frame.crossColor, 1, shapeCtx));
      }
      for (const plate of scene.plates) {
        body.push(
          customShapeXml(
            plate,
            shapeCtx,
            '',
            plate.blockId !== undefined ? idFor(plate.blockId) : {},
          ),
        );
        counts.shapes += 1;
      }
      for (const chip of scene.chips) {
        const chipRect: SceneRect = { box: chip, fill: inkHex, role: 'chip' };
        body.push(customShapeXml(chipRect, shapeCtx));
        counts.shapes += 1;
      }
      const written = new Set<string>();
      const textsByShape = new Map<string, SceneText[]>();
      for (const text of scene.texts)
        if (text.inShape !== undefined)
          textsByShape.set(text.inShape, [...(textsByShape.get(text.inShape) ?? []), text]);
      for (const rect of scene.rects) {
        const inner =
          (rect.blockId !== undefined ? textsByShape.get(rect.blockId) : undefined) ?? [];
        for (const text of inner) written.add(text.id);
        const innerXml = inner.map((text) => paragraphsXml(text, textCtx)).join('');
        body.push(
          customShapeXml(
            rect,
            shapeCtx,
            innerXml,
            rect.blockId !== undefined ? idFor(rect.blockId) : {},
          ),
        );
        counts.shapes += 1;
        if (rect.blockId !== undefined) native.push(rect.blockId);
      }
      for (const rule of scene.rules) {
        body.push(
          ruleLineXml(
            rule.box,
            rule.color,
            rule.width,
            shapeCtx,
            rule.blockId !== undefined ? idFor(rule.blockId) : {},
          ),
        );
        counts.shapes += 1;
        if (rule.blockId !== undefined) native.push(rule.blockId);
      }
      for (const segment of scene.lines ?? []) {
        body.push(segmentXml(segment, shapeCtx, idFor(segment.blockId)));
        counts.shapes += 1;
        native.push(segment.blockId);
      }
      for (const table of scene.tables ?? []) {
        const built = tableXml(table, scene.texts, shapeCtx, textCtx, idFor(table.blockId));
        body.push(built.xml);
        for (const id of built.written) written.add(id);
        counts.tables += 1;
        native.push(table.blockId);
      }
      const chartIds = new Set((scene.charts ?? []).map((chart) => chart.blockId));
      const mediaPosters = new Set(
        (scene.media ?? []).map((m) => m.poster).filter((p): p is string => p !== undefined),
      );
      const equationRasters = new Set(
        (scene.equations ?? []).map((e) => e.raster).filter((r): r is string => r !== undefined),
      );
      for (const item of scene.rasters) {
        if (item.blockId === 'wordmark' || item.file === undefined) continue;
        if (mediaPosters.has(item.id)) continue;
        if (backgroundRaster === item.id && scene.background !== undefined) {
          const file = options.readFile(item.file);
          if (file !== undefined) {
            body.unshift(rasterFrameXml(item, file, shapeCtx, idFor(item.blockId)));
            counts.pictures += 1;
            raster.push(item.blockId);
          }
          continue;
        }
        const file = options.readFile(item.file);
        if (file === undefined) {
          warnings.push(`${scene.slideId}: raster ${item.id} has no file`);
          continue;
        }
        body.push(rasterFrameXml(item, file, shapeCtx, idFor(item.blockId)));
        counts.pictures += 1;
        raster.push(item.blockId);
        if (chartIds.has(item.blockId))
          rows.push({
            slideId: scene.slideId,
            blockId: item.blockId,
            code: 'chart.raster',
            message: `${scene.slideId}#${item.blockId}: the chart travels as a picture; the embedded chart object is a later build`,
          });
        if (equationRasters.has(item.id))
          rows.push({
            slideId: scene.slideId,
            blockId: item.blockId,
            code: 'equation.raster',
            message: `${scene.slideId}#${item.blockId}: the equation travels as its 2x raster (SPEC-5 6.3)`,
          });
      }
      for (const text of scene.texts) {
        if (written.has(text.id)) continue;
        body.push(textFrameXml(text, textCtx, idFor(text.blockId)));
        counts.texts += 1;
        if (text.native) native.push(text.blockId);
      }
      if (scene.counter !== undefined) {
        body.push(textFrameXml(scene.counter, textCtx));
        counts.texts += 1;
      }
      const wordmark = scene.rasters.find(
        (item) => item.blockId === 'wordmark' && item.file !== undefined,
      );
      if (wordmark?.file !== undefined) {
        const file = options.readFile(wordmark.file);
        if (file !== undefined) {
          body.push(rasterFrameXml(wordmark, file, shapeCtx));
          counts.pictures += 1;
        }
      }
      for (const media of scene.media ?? []) {
        const mode = options.media ?? 'embed';
        const fileBytes =
          media.file !== undefined && mode === 'embed' ? options.readFile(media.file) : undefined;
        const posterRaster =
          media.poster !== undefined ? scene.rasters.find((r) => r.id === media.poster) : undefined;
        const posterBytes =
          posterRaster?.file !== undefined
            ? options.readFile(posterRaster.file)
            : media.poster !== undefined
              ? options.readFile(media.poster)
              : undefined;
        const built = mediaFrameXml(
          {
            media,
            ...(fileBytes !== undefined && media.file !== undefined
              ? {
                  file: {
                    bytes: fileBytes,
                    mime: media.mime ?? 'application/octet-stream',
                    name: media.file.split('/').pop() ?? media.blockId,
                  },
                }
              : {}),
            ...(posterBytes !== undefined ? { poster: posterBytes } : {}),
            mode,
            addMedia: (bytes, mime, name) =>
              addPart('Media', bytes, mime, name.replace(/\.[^.]+$/, '')),
          },
          shapeCtx,
          idFor(media.blockId),
        );
        body.push(built.xml);
        rows.push({ slideId: scene.slideId, blockId: media.blockId, ...built.row });
        counts.media += 1;
      }
    }

    // the animation tree (SPEC-5 6.3) from the schedule, the blocks' element ids as targets
    if (options.motion !== 'drop') {
      const tree = animationTreeXml(scene.schedule, (blockId) => ids.get(blockId) ?? []);
      if (tree.xml !== '') body.push(tree.xml);
      counts.effects += tree.effects;
      rows.push(...tree.rows);
    }
    const notes = options.includeNotes === true ? notesXml(scene.notes, notesParagraph) : '';
    if (notes !== '') counts.notes += 1;
    const hidden = options.hidden?.has(scene.slideId) === true;
    pages.push(
      el(
        'draw:page',
        {
          'draw:name': scene.title ?? scene.slideId,
          'draw:style-name': pageStyle,
          'draw:master-page-name': 'Default',
          ...(hidden ? { 'presentation:visibility': 'hidden' } : {}),
        },
        body.join('') + notes,
      ),
    );
    entry.native = [...new Set(native)];
    entry.raster = [...new Set(raster)];
    slidesOut.push(entry);
  }

  const content =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-content${namespaceAttrs()}>` +
    `<office:scripts/>` +
    `<office:font-face-decls>${[...families]
      .sort()
      .map((family) =>
        el('style:font-face', {
          'style:name': family,
          'svg:font-family': family.includes(' ') ? `'${family}'` : family,
        }),
      )
      .join('')}</office:font-face-decls>` +
    styles.xml() +
    `<office:body><office:presentation>${pages.join('')}</office:presentation></office:body>` +
    '</office:document-content>\n';
  const stylesText = stylesXml({
    page: options.page,
    language: options.language,
    families,
    paperHex,
    defaultFamily: [...families][0] ?? 'Inter',
  }).replace('<office:styles>', `<office:styles>${dashDefinitions()}`);
  const bytes = await writeOdfPackage({
    content,
    styles: stylesText,
    meta: metaXml({ title: options.deckTitle, pages: scenes.length, revision: options.revision }),
    settings: settingsXml(),
    parts,
  });
  residual.push(
    options.mode === 'flatten'
      ? 'odp (perfect): one page raster per slide under paper coloured runs at opacity 0, the text searchable and invisible (R09 2.4 path a)'
      : 'odp (editable text): text frames at the browser boxes with the LibreOffice baseline model, shapes as draw:custom-shape from the shape interpreter, tables as table:table, charts and rasters as pictures',
  );
  residual.push(
    `odp: ${counts.pages} page(s), ${counts.texts} text frame(s), ${counts.shapes} shape(s), ${counts.tables} table(s), ${counts.pictures} picture(s), ${counts.media} media, ${counts.transitions} transition(s), ${counts.effects} effect(s), ${counts.notes} notes page(s), ${styles.size} automatic style(s), ${parts.length} stored part(s)`,
  );
  return {
    bytes,
    slides: slidesOut,
    families: [...families],
    residual,
    rows,
    warnings,
    perfect,
    counts,
  };
}
