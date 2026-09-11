// Identical-region detail crops (MILESTONES M5 item 1; DETAILS.md: the deck's detail pairs are
// the same CSS box cut from the light and the dark capture at 2x). A region is a CSS-pixel box
// inside the page's viewport; both twins take the same box, so the pair aligns to the pixel.
// The math is pure; the crop runs through sharp on the captured PNG.
import sharp from 'sharp';

export type Region = [number, number, number, number];

export type DeviceRegion = { left: number; top: number; width: number; height: number };

/** Checks a CSS-pixel region against the viewport; throws RangeError outside it. */
export function checkRegion(region: Region, viewport: [number, number]): Region {
  const [x, y, w, h] = region;
  if (![x, y, w, h].every((v) => Number.isFinite(v)))
    throw new TypeError('region wants four numbers');
  if (w <= 0 || h <= 0) throw new RangeError(`region ${region.join(',')} has no area`);
  if (x < 0 || y < 0 || x + w > viewport[0] || y + h > viewport[1]) {
    throw new RangeError(
      `region ${region.join(',')} leaves the ${viewport[0]} by ${viewport[1]} viewport`,
    );
  }
  return [x, y, w, h];
}

/** A CSS region in device pixels at the capture scale, rounded to whole pixels. */
export function deviceRegion(region: Region, scale: number): DeviceRegion {
  const [x, y, w, h] = region;
  return {
    left: Math.round(x * scale),
    top: Math.round(y * scale),
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}

/** The identical region cut from a captured PNG, as PNG bytes. */
export async function cropRegion(
  png: Uint8Array,
  region: Region,
  scale: number,
): Promise<Uint8Array> {
  const box = deviceRegion(region, scale);
  const out = await sharp(Buffer.from(png.buffer, png.byteOffset, png.byteLength))
    .extract(box)
    .png()
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/** `<id>-detail-<n>`, the id of the n-th detail crop of a capture. */
export function detailId(id: string, index: number): string {
  return `${id}-detail-${index + 1}`;
}
