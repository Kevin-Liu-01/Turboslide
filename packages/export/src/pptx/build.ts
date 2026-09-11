// One theme's scenes to one PPTX (SPEC 8.2). Native mode: the paper master carries the frame and
// the wordmark; a full-picture slide takes the chrome-free master, its picture as the background,
// the frame as alpha lines over it, the plates and chips as paper rectangles; text boxes at the
// browser's boxes, rows as hairlines plus key and value boxes, icons and marks as 2x PNGs, raster
// blocks as 2x PNGs, notes. Flatten mode: every text as an invisible run (`<a:alpha val="0"/>`)
// under the 2x sheet screenshot placed as a full-page picture, so the file is pixel identical in
// viewers that ignore text alpha and the text stays searchable and recoverable. The pptxgenjs
// buffer then goes through the OOXML post-process: kern strip, row groups, embedded fonts, stored
// media.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import PptxGenJS from 'pptxgenjs';

import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { embedFonts } from '../ooxml/fonts.ts';
import type { EmbedFont } from '../ooxml/fonts.ts';
import { readGeometry } from '../ooxml/geometry.ts';
import type { ShapeBounds } from '../ooxml/geometry.ts';
import { groupShapes } from '../ooxml/groups.ts';
import { stripKern } from '../ooxml/kern.ts';
import { openPackage, readPart, slideParts, writePackage, writePart } from '../ooxml/zip.ts';
import type { Scene } from '../scene/types.ts';
import { PAGE_IN, parseCssColor } from '../units.ts';
import type { FontSet, FontsCatalog } from './fonts-map.ts';
import { entryFor, pickFamily } from './fonts-map.ts';
import { addPicture, addRaster, dataUri, mimeOf } from './images.ts';
import type { PictureSource } from './images.ts';
import { addCross, addSceneRect, addSceneRule } from './lines.ts';
import { defineLayout, defineMasters, paperMasterName, pictureMasterName } from './masters.ts';
import { addSceneNotes } from './notes.ts';
import type { BaselineTarget } from './baseline.ts';
import { addSceneText } from './text.ts';
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
  /** Skip the font parts (a test or a size-sensitive export). */
  embedFonts?: boolean;
  /** The first-baseline target (pptx/baseline.ts); default libreoffice, the verify renderer. */
  baseline?: BaselineTarget;
};

export type BuildSlideReport = { slideId: string; native: string[]; raster: string[] };

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

export type BuildResult = {
  bytes: Uint8Array;
  /** Families the runs use, in first-use order. */
  families: string[];
  embedded: string[];
  slides: BuildSlideReport[];
  geometry: ShapeBounds[];
  geometryInBounds: boolean;
  groups: number;
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

  for (const scene of scenes) {
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
    const textOptions: TextEmitOptions = {
      fontSet: options.fontSet,
      invisible: options.mode === 'flatten',
      hairHex,
      families,
      namePrefix,
      baseline: options.baseline ?? 'libreoffice',
    };

    if (options.mode === 'flatten') {
      // The text layer first, then the 2x sheet raster as a full-page picture over it. The runs
      // carry alpha 0, and the picture covers them as well, because QuickLook ignores text fill
      // alpha (measured on this machine: the layer rendered over the raster as a p:bg blip);
      // behind the picture the text stays searchable and extractable in every viewer.
      slide.background = { color: paperHex };
      for (const text of scene.texts) addSceneText(slide, text, textOptions);
      if (scene.counter) addSceneText(slide, scene.counter, textOptions);
      if (scene.sheetImage && existsSync(scene.sheetImage)) {
        slide.addImage({
          data: dataUri(readFileSync(scene.sheetImage), 'image/png'),
          x: 0,
          y: COVER_OFFSET_IN,
          w: PAGE_IN.width,
          // shortened by the offset so the shape ends on the page edge; measured equally exact
          h: PAGE_IN.height - COVER_OFFSET_IN,
          altText: `${scene.slideId} (${scene.theme}), the sheet at 2x`,
          objectName: `${namePrefix}#sheet`,
        });
      } else {
        warnings.push(
          `${scene.slideId}: no sheet screenshot; the slide shows the text layer on paper`,
        );
      }
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
      scene.plates.forEach((plate, i) => addSceneRect(slide, plate, onPaper, `plate/${i}`));
      scene.rects.forEach((rect, i) => addSceneRect(slide, rect, onPaper, `rect/${i}`));
      scene.rules.forEach((rule, i) => addSceneRule(slide, rule, onPaper, `rule/${i}`));
      for (const text of scene.texts) {
        if (!text.native) continue;
        addSceneText(slide, text, textOptions);
        if (text.lines.some((l) => l.runs.some((r) => r.gt)))
          residual.add(
            `${scene.slideId}#${text.blockId}: the GT letters are an invisible run under the mark; text after the mark on that line may shift by the width difference`,
          );
      }
      if (scene.counter) addSceneText(slide, scene.counter, textOptions);
      for (const raster of scene.rasters) {
        if (raster.blockId === 'wordmark') continue;
        if (!addRaster(slide, raster, namePrefix))
          warnings.push(`${scene.slideId}#${raster.blockId}: raster ${raster.id} has no file`);
      }
      if (scene.texts.some((t) => t.style.mono))
        residual.add(
          'code panels travel in Menlo; the face differs per machine unless a mono font is installed (SPEC 8.6)',
        );
    }
    addSceneNotes(slide, scene.notes, options.defaultNotes);
    slidesReport.push({
      slideId: scene.slideId,
      native: scene.blocks.filter((b) => b.native).map((b) => b.blockId),
      raster: scene.blocks.filter((b) => !b.native).map((b) => b.blockId),
    });
    for (const w of scene.warnings) warnings.push(`${scene.slideId}: ${w}`);
  }

  const raw = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await openPackage(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
  let groups = 0;
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    const grouped = groupShapes(stripKern(xml));
    groups += grouped.groups.length;
    writePart(zip, part, grouped.xml);
  }
  const embedded: string[] = [];
  if (options.embedFonts !== false) {
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
  }
  const geometry = await readGeometry(zip);
  const bytes = await writePackage(zip);
  return {
    bytes,
    families: [...families],
    embedded,
    slides: slidesReport,
    geometry,
    geometryInBounds: geometry.every((g) => g.inBounds),
    groups,
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
