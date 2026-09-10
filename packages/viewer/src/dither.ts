import { bayer8 } from '@turboslide/effects/bayer';
import { RAMP_COLORS, rampCells, rampInk } from '@turboslide/effects/ramp';

/**
 * The live dither ramp canvas (SPEC 5.4; tail:104-114), drawn from
 * @turboslide/effects: one cell per canvas pixel at half the CSS size (the
 * CSS scales it 2x with image-rendering: pixelated), lit where
 * bayer8(y, x) / 64 < 1 - x / W. Paper and ink follow the theme so both
 * themes share cells (SPEC 5.3 determinism rules). The standalone runtime
 * (standalone/runtime.ts) keeps an inline copy of the same table because it
 * ships as one classic script.
 */
export { bayer8 };

export function drawDither(canvas: HTMLCanvasElement, theme: 'light' | 'dark'): void {
  const { w: W, h: H } = rampCells(canvas.clientWidth, canvas.clientHeight);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const colors = RAMP_COLORS[theme];
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colors.cell;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (rampInk(x, y, W)) ctx.fillRect(x, y, 1, 1);
    }
  }
  canvas.dataset.drawn = theme;
}

/** Draws every `canvas.dither` under root that is not already drawn for the theme. */
export function drawAllDither(root: ParentNode, theme: 'light' | 'dark'): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas.dither').forEach((canvas) => {
    if (canvas.dataset.drawn !== theme) drawDither(canvas, theme);
  });
}
