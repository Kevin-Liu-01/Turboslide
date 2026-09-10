// The live dither ramp of the Dither slide (SPEC 5.2 dither block, 5.4): one cell per canvas
// pixel at half CSS size, lit when bayer8(y, x) / 64 < 1 - x / W, drawn from solid ink on the
// left to paper on the right (Prototemplate/deck/parts/tail.html lines 104 to 114). The viewer
// upscales the canvas with image-rendering: pixelated so every cell is a 2 by 2 square.
import { bayer8 } from './bayer.ts';
import type { RgbaImage } from './image.ts';

export type RampTheme = 'light' | 'dark';

/** The canvas colors the deck's drawDither uses per theme: ground first, then the lit cell. */
export const RAMP_COLORS: Record<RampTheme, { ground: string; cell: string }> = {
  dark: { ground: '#070707', cell: '#f2f2f0' },
  light: { ground: '#ffffff', cell: '#070707' },
};

/**
 * Whether the cell at (x, y) of a ramp w cells wide is ink. The ramp marks ink cells on a paper
 * ground (solid ink at x 0, paper at the right edge), the reverse of a two-tone twin's lit cells.
 */
export function rampInk(x: number, y: number, w: number): boolean {
  return bayer8(y, x) / 64 < 1 - x / w;
}

/** The ramp's cell width and height for a canvas of the given CSS size, as the deck computes them. */
export function rampCells(cssWidth: number, cssHeight: number): { w: number; h: number } {
  if (!cssWidth) return { w: 505, h: 110 };
  return { w: Math.max(8, Math.round(cssWidth / 2)), h: Math.max(8, Math.round(cssHeight / 2)) };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ramp as RGBA pixels, one pixel per cell; the caller scales it 2x nearest for the sheet. */
export function ditherRamp(w: number, h: number, theme: RampTheme): RgbaImage {
  const { ground, cell } = RAMP_COLORS[theme];
  const g = hexToRgb(ground);
  const c = hexToRgb(cell);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const [r, gg, b] = rampInk(x, y, w) ? c : g;
      data[i] = r;
      data[i + 1] = gg;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
