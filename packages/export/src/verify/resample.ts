// Area averaging resample of an RGBA image (gslides-parity SPEC-5 6.2; R08 4.11): the per cell
// gate of a handout compares a cell of the PDF page raster against the slide's 2x reference
// shrunk to the cell's pixel size, and the shrink has to be the mean of the source box every
// destination pixel covers (fractional coverage at the box edges) so a hairline that covers half
// a destination pixel reads as half ink rather than vanishing, the way a viewer's own resampling
// reads it. The same arithmetic the studio's thumbnails use (apps/studio server/thumbs.ts
// `downsample`), written here for the verify loop, which the studio never imports.
import type { Png } from './diff.ts';

/** `image` resampled to `width` by `height` by area averaging; a size at or above the source in both axes answers a copy. */
export function resampleArea(image: Png, width: number, height: number): Png {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w >= image.width && h >= image.height && w === image.width && h === image.height)
    return { width: image.width, height: image.height, data: new Uint8Array(image.data) };
  const sx = image.width / w;
  const sy = image.height / h;
  const out = new Uint8Array(w * h * 4);
  const src = image.data;
  for (let dy = 0; dy < h; dy += 1) {
    const y0 = dy * sy;
    const y1 = Math.min(image.height, (dy + 1) * sy);
    const yStart = Math.floor(y0);
    const yEnd = Math.min(image.height, Math.ceil(y1));
    for (let dx = 0; dx < w; dx += 1) {
      const x0 = dx * sx;
      const x1 = Math.min(image.width, (dx + 1) * sx);
      const xStart = Math.floor(x0);
      const xEnd = Math.min(image.width, Math.ceil(x1));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = xStart; x < xEnd; x += 1) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const wgt = wx * wy;
          const i = (y * image.width + x) * 4;
          r += (src[i] ?? 0) * wgt;
          g += (src[i + 1] ?? 0) * wgt;
          b += (src[i + 2] ?? 0) * wgt;
          a += (src[i + 3] ?? 255) * wgt;
          weight += wgt;
        }
      }
      const o = (dy * w + dx) * 4;
      if (weight > 0) {
        out[o] = Math.round(r / weight);
        out[o + 1] = Math.round(g / weight);
        out[o + 2] = Math.round(b / weight);
        out[o + 3] = Math.round(a / weight);
      }
    }
  }
  return { width: w, height: h, data: out };
}
