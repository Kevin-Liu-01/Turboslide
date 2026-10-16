/**
 * The Dithering pattern of screen 05 (docs/SITE.md 9), the product's `paper:dithering`
 * material with its sphere shape and 8 by 8 Bayer screen (packages/materials), ported from the
 * shader to the CPU so the page needs no WebGL. The recipe is the old landing's deck slide
 * (scale 0.62, offset -0.28 and 0.04). A cell is lit when `shape + bayer / 64` reaches 1, as the
 * shader's `step(0.5, shape + bayer - 0.5)` decides it, and the light turns as the shader turns
 * it: `normalize(cos(0.75 s), 0.8, sin(0.625 s))`.
 */

/** The shader's own 8 by 8 table, row major (`bayer8x8` of @paper-design/shaders' dithering). */
const SHADER_BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
] as const;

export const PATTERN_RECIPE = { scale: 0.62, u0: 0.28, v0: 0.04 } as const;

/**
 * Prints the pattern at second `s` into `pixels`, a cols by rows grid of packed RGBA words (0 for
 * paper, `ink` for a lit cell). `k` is one cell in the recipe's unit (the box's height for the
 * slide, a square's side over 0.8 for a moment of the strip); `u0` and `v0` place the box's centre
 * in the recipe's space.
 */
export function printPattern(
  pixels: Uint32Array,
  cols: number,
  rows: number,
  s: number,
  k: number,
  u0: number,
  v0: number,
  ink: number,
): void {
  pixels.fill(0);
  const t = 0.5 * s;
  let lx = Math.cos(1.5 * t);
  let ly = 0.8;
  let lz = Math.sin(1.25 * t);
  const n = Math.hypot(lx, ly, lz);
  lx /= n;
  ly /= n;
  lz /= n;
  const sc = 2 / PATTERN_RECIPE.scale;
  for (let by = 0; by < rows; by += 1) {
    const iy = rows / 2 - 1 - by;
    const y = ((iy + 0.5) * k + v0) * sc;
    if (y * y >= 1) continue;
    const row = (((iy % 8) + 8) % 8) * 8;
    for (let bx = 0; bx < cols; bx += 1) {
      const ix = bx - cols / 2;
      const x = ((ix + 0.5) * k + u0) * sc;
      const d = 1 - x * x - y * y;
      if (d < 0) continue;
      const shape = 0.5 + 0.5 * (lx * x + ly * y + lz * Math.sqrt(d));
      if (shape + (SHADER_BAYER[row + (((ix % 8) + 8) % 8)] ?? 64) / 64 >= 1)
        pixels[by * cols + bx] = ink;
    }
  }
}
