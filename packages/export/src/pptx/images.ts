// Pictures and rasters (SPEC 8.2): the full-picture background as a `p:bg` blip when its aspect is
// the sheet's, else a cover-cropped picture at the sheet box; every raster as an RGBA PNG at 2x
// placed at its measured box (alpha survives the package byte for byte, pptx report section 4.6);
// `altText` carries the block id, or the block's own alt text when it has one (gslides-parity
// SPEC-2 2.5.6). A raster of a rotated or flipped object was shot at its unrotated box (SPEC-2 1.5)
// and carries pptxgenjs `rotate`, `flipH` and `flipV`; a shadow travels on the image. pptxgenjs
// takes `data` as `image/png;base64,...` without the `data:` prefix.
import { readFileSync } from 'node:fs';

import type PptxGenJS from 'pptxgenjs';

import type { Scene, SceneRaster } from '../scene/types.ts';
import { pxToIn } from '../units.ts';
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

/** True when the picture's pixels have the sheet's 16:9 aspect within half a percent. */
export function isSheetAspect(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - 16 / 9) / (16 / 9) < 0.005;
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
  if (isSheetAspect(source.width, source.height)) {
    slide.background = { data };
    return 'background';
  }
  const [x, y, w, h] = scene.picture?.box ?? [0, 0, 1600, 900];
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
