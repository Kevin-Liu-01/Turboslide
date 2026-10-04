import { ShaderMount, ditheringFragmentShader } from '@paper-design/shaders';

import { HOME_PATTERN } from '../pattern.generated';

/**
 * The patterns band's shader chunk (docs/LANDING.md 2.13, 4.1, 6.2; the second pass). V4's file,
 * a chunk of its own (`home-pattern-*.js`, at most 8 KB gzip): Paper's `ShaderMount` and the one
 * dithering fragment, imported directly, never `@turboslide/materials/mount`. `live/pattern.ts`
 * imports it when the band comes within one viewport height and motion is allowed, never under
 * reduced motion or with Pause Motion pressed.
 *
 * The mount draws slide 8's Animated pattern with the recipe of `pattern.generated.ts` (the
 * fixture's capture, converted at build) and the slide's own two colours, so it is the picture the
 * exporter captured at its anchor until it moves. It is mounted on the picture box inside the
 * slide's 1,600 by 900 stage, which the page scales. With a fit (`live/pattern.ts` `fitOf`) the
 * canvas holds the box's drawn device pixels and a cell is the recipe's `u_pxSize` of the slide's
 * 1,600 units rounded to whole pixels of it, so no cell straddles a screen pixel (a cell of 3 units
 * is 0.94 px on the band's 500 px slide, which the page's scaling turned into a moiré grid); the
 * band's still frame is printed on the same grid. Without one it renders at most 1,600 by 900
 * pixels at the recipe's cell.
 */

/** A colour as the shader takes it: red, green, blue and alpha in 0 to 1. */
export type ShaderColor = [number, number, number, number];

/** A box's drawn size in device pixels and its cell in whole pixels of it (`live/pattern.ts`). */
export type PatternFit = { width: number; height: number; cell: number };

export type PatternMount = {
  /** plays at the recipe's speed, from the frame it holds */
  play(): void;
  /** holds the frame it shows: speed 0, no frame callback */
  pause(): void;
  /** the still frame: speed 0 at the capture's anchor */
  still(): void;
  /** the slide's ink and paper, after a kit or an appearance change */
  recolor(paper: ShaderColor, ink: ShaderColor): void;
  /** the box's drawn size after a resize */
  fit(next: PatternFit): void;
  /** the frame in ms (the drivers' reading) */
  frame(): number;
  dispose(): void;
};

/** The pixels the mount renders at most: the slide's own 1,600 by 900 (one per sheet unit). */
const MAX_PIXELS = 1600 * 900;

export function createPatternMount(
  box: HTMLElement,
  colors: { paper: ShaderColor; ink: ShaderColor },
  fit: PatternFit | null = null,
): PatternMount {
  /* the mount's pixel ratio is the canvas width over the box's layout width (1,600 units), so a
     u_pxSize of cell * units / width is `cell` canvas pixels */
  const units = box.offsetWidth || 1600;
  const pixels = (f: PatternFit): number => Math.min(MAX_PIXELS, f.width * f.height);
  const pxSize = (f: PatternFit, width: number): number => (f.cell * units) / width;
  const mount = new ShaderMount(
    box,
    ditheringFragmentShader,
    {
      ...HOME_PATTERN.uniforms,
      ...(fit === null ? {} : { u_pxSize: pxSize(fit, fit.width) }),
      u_colorBack: colors.paper,
      u_colorFront: colors.ink,
    },
    undefined,
    0,
    HOME_PATTERN.frame,
    1,
    fit === null ? MAX_PIXELS : pixels(fit),
  );
  return {
    play: () => mount.setSpeed(HOME_PATTERN.speed),
    pause: () => mount.setSpeed(0),
    still() {
      mount.setSpeed(0);
      mount.setFrame(HOME_PATTERN.frame);
    },
    recolor: (paper, ink) => mount.setUniforms({ u_colorBack: paper, u_colorFront: ink }),
    fit(next) {
      mount.setMaxPixelCount(pixels(next));
      /* the canvas as the mount sized it (a pixel off the fit's rounding), or the fit before the
         mount's first resize */
      const drawn = mount.canvasElement.width;
      mount.setUniforms({
        u_pxSize: pxSize(next, Math.abs(drawn - next.width) <= 2 ? drawn : next.width),
      });
    },
    frame: () => mount.getCurrentFrame(),
    dispose: () => {
      mount.dispose();
      mount.canvasElement.remove();
    },
  };
}
