// Pictures and rasters (SPEC 8.2): the full-picture background as a `p:bg` blip when its aspect is
// the sheet's, else a cover-cropped picture at the sheet box; every raster as an RGBA PNG at 2x
// placed at its measured box (alpha survives the package byte for byte, pptx report section 4.6);
// `altText` carries the block id, or the block's own alt text when it has one (gslides-parity
// SPEC-2 2.5.6). A raster of a rotated or flipped object was shot at its unrotated box (SPEC-2 1.5)
// and carries pptxgenjs `rotate`, `flipH` and `flipV`; a shadow travels on the image. pptxgenjs
// takes `data` as `image/png;base64,...` without the `data:` prefix.
import { readFileSync } from 'node:fs';

import type PptxGenJS from 'pptxgenjs';

import type { RecolorPreset, ShotReflection } from '@turboslide/schema/blocks';
import { SEMANTIC_PALETTE, isColorToken, isHexColor } from '@turboslide/schema/color';
import type { Color, HexColor } from '@turboslide/schema/color';
import { duotoneColors, isNativeRecolor } from '@turboslide/schema/blocks/media';

import { listShapes } from '../ooxml/groups.ts';
import type { Scene, SceneRaster } from '../scene/types.ts';
import { isPageAspect, pxToIn, scenePage } from '../units.ts';
import type { PageSize } from '../units.ts';
import { objectName, objectProps } from './shapes.ts';

export function dataUri(bytes: Uint8Array, mime: string): string {
  return `${mime};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`;
}

export function mimeOf(path: string): string {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

export type PictureSource = { bytes: Uint8Array; mime: string; width: number; height: number };

/** True when the picture's pixels have the page's aspect within half a percent; the default page's 16:9 when none is given (units.ts isPageAspect). */
export function isSheetAspect(width: number, height: number, page?: PageSize): boolean {
  return isPageAspect(width, height, page);
}

/**
 * The full-picture background: a stretched blip when the aspect matches, else a picture at the
 * sheet box with a center cover crop (object-position other than center is a recorded residual).
 */
export function addPicture(
  slide: PptxGenJS.Slide,
  scene: Scene,
  source: PictureSource,
  namePrefix: string,
): 'background' | 'cover' {
  const data = dataUri(source.bytes, source.mime);
  const page = scenePage(scene);
  if (isSheetAspect(source.width, source.height, page)) {
    slide.background = { data };
    return 'background';
  }
  const [x, y, w, h] = scene.picture?.box ?? [0, 0, page.width, page.height];
  slide.addImage({
    data,
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    sizing: { type: 'cover', w: pxToIn(w), h: pxToIn(h) },
    altText: scene.picture?.alt ?? '',
    objectName: `${namePrefix}#picture`,
  });
  return 'cover';
}

/**
 * The picture object that covers the sheet at the bottom of the stack as the slide background
 * (gslides-parity SPEC-2 2.6.4, 1.5): its 2x raster as `slide.background = { data }`, the form the
 * picture kinds export, so a converted and an unconverted Section header produce the same file.
 * Returns false when the raster has no file.
 */
export function addPictureBackground(slide: PptxGenJS.Slide, raster: SceneRaster): boolean {
  if (!raster.file) return false;
  slide.background = { data: dataUri(readFileSync(raster.file), 'image/png') };
  return true;
}

/**
 * One raster PNG at its measured box, with the block's link when it carries one (SPEC 7.2.7), the
 * object's rotation, flip and shadow (SPEC-2 2.1, 2.3.4) and its alt text (2.5.6).
 */
export function addRaster(
  slide: PptxGenJS.Slide,
  raster: SceneRaster,
  namePrefix: string,
  bytes?: Uint8Array,
  hyperlink?: PptxGenJS.HyperlinkProps,
): boolean {
  const file = raster.file;
  if (!file && !bytes) return false;
  const png = bytes ?? readFileSync(file as string);
  const [x, y, w, h] = raster.box;
  if (w <= 0 || h <= 0) return false;
  const props = objectProps(raster);
  slide.addImage({
    data: dataUri(png, 'image/png'),
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    ...props,
    altText: props.altText ?? `${raster.blockId} (${raster.kind})`,
    ...(hyperlink ? { hyperlink } : {}),
    objectName: objectName(namePrefix, raster.id, raster.userGroup),
  });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Reflection and Recolor in the Editable text file (gslides-parity SPEC-5 0.47, 11; B2 day 6).
// The OOXML schema defines Grayscale and the duotones per pixel, so they travel as `a:grayscl`
// and `a:duotone` inside the picture's `a:blip` and the raster is the plain picture (the extractor
// shoots those pictures under `data-native-blips`, which drops the renderer's filter); Sepia,
// Negative and the reflection are PowerPoint's own renderer's curves and bake into the 2x shot
// raster with a residual line naming the object. The rewrite runs in the post process after
// pptxgenjs placed the pictures by name (`ts:<slide>#<block>`), the position B1's `pptx/build.ts`
// gives it (b2.md request).

/** Resolves a schema colour to six hex digits for `a:srgbClr`: a hex as it is, a semantic hue from the palette, a token from the theme's values. */
export type RecolorColorResolver = (color: Color) => string;

/** A resolver over one appearance's token values (`tokensFor(id)[appearance]`), the light appearance being the file's. */
export function recolorResolverFor(tokens: Readonly<Record<string, string>>): RecolorColorResolver {
  return (color) => {
    if (isHexColor(color)) return color.slice(1).toUpperCase();
    if (color === 'green' || color === 'amber' || color === 'red' || color === 'blue')
      return SEMANTIC_PALETTE[color].slice(1).toUpperCase();
    const value = tokens[color];
    if (value !== undefined && isHexColor(value.trim() as HexColor))
      return value.trim().slice(1).toUpperCase();
    // a token the theme spells in another form (an rgb() or a name): a neutral grey keeps the file valid
    return isColorToken(color) ? '808080' : '808080';
  };
}

/**
 * The blip element of a native preset: `<a:grayscl/>`, or `<a:duotone>` with the shadow colour
 * first and the highlight second (the schema: the first colour replaces black, the second white).
 * Null for `none` and for the presets that bake.
 */
export function recolorBlipXml(
  preset: RecolorPreset | undefined,
  resolve: RecolorColorResolver,
): string | null {
  if (preset === undefined || preset === 'none' || !isNativeRecolor(preset)) return null;
  if (preset === 'grayscale') return '<a:grayscl/>';
  const colors = duotoneColors(preset);
  if (colors === null) return null;
  return `<a:duotone><a:srgbClr val="${resolve(colors.shadow)}"/><a:srgbClr val="${resolve(colors.highlight)}"/></a:duotone>`;
}

export type RecolorBlipRow = {
  /** the picture's `p:cNvPr name` (`ts:<slide>#<block>`) */
  name: string;
  preset: RecolorPreset;
};

/**
 * Writes the native recolor element into the `a:blip` of every named picture (a `p:pic` whose
 * name is the row's or the row's with a `@n` suffix); a picture the part lacks, a blip already
 * carrying the element and a preset that bakes are left alone. Answers the rewritten part and the
 * count written.
 */
export function rewriteRecolorBlips(
  xml: string,
  rows: ReadonlyArray<RecolorBlipRow>,
  resolve: RecolorColorResolver,
): { xml: string; written: number } {
  let out = xml;
  let written = 0;
  for (const row of rows) {
    const element = recolorBlipXml(row.preset, resolve);
    if (element === null) continue;
    const shape = listShapes(out).find(
      (candidate) =>
        candidate.kind === 'pic' &&
        (candidate.name === row.name || candidate.name.startsWith(`${row.name}@`)),
    );
    if (shape === undefined) continue;
    const tag = element.startsWith('<a:grayscl') ? '<a:grayscl' : '<a:duotone';
    if (shape.xml.includes(tag)) continue;
    let next = shape.xml.replace(
      /<a:blip\b([^>]*?)\s*\/>/,
      (_m, attrs: string) => `<a:blip${attrs}>${element}</a:blip>`,
    );
    if (next === shape.xml)
      next = shape.xml.replace(
        /<a:blip\b([^>]*)>/,
        (_m, attrs: string) => `<a:blip${attrs}>${element}`,
      );
    if (next === shape.xml) continue;
    out = out.slice(0, shape.start) + next + out.slice(shape.end);
    written += 1;
  }
  return { xml: out, written };
}

export type PictureEffectRow = {
  slideId: string;
  blockId: string;
  recolor?: RecolorPreset;
  reflection?: ShotReflection;
};

/**
 * The residual sentences of the effects the file bakes (SPEC-5 0.20: the still state that differs
 * from what PowerPoint would draw natively): one per reflection, one per Sepia or Negative; a
 * native preset writes no line.
 */
export function pictureEffectResiduals(rows: ReadonlyArray<PictureEffectRow>): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const at = `${row.slideId}#${row.blockId}`;
    if (row.reflection !== undefined)
      out.push(
        `${at}: the reflection (transparency ${row.reflection.transparency}, distance ${row.reflection.distance} px, size ${row.reflection.size}) is baked into the picture raster; PowerPoint's own reflection curve is not written`,
      );
    if (row.recolor !== undefined && row.recolor !== 'none' && !isNativeRecolor(row.recolor))
      out.push(
        `${at}: the ${row.recolor} recolor is baked into the picture raster; the OOXML schema has no per pixel element for it`,
      );
  }
  return out;
}
