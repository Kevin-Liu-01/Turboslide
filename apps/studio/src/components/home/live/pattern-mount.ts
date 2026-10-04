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
 * slide's 1,600 by 900 stage, which the page scales, and renders at most 1,600 by 900 pixels with no
 * extra pixel ratio: a cell is `u_pxSize` of 1,600 units of the slide's width, as in the editor and
 * in the 3,200 by 1,800 capture (twice the units at scale 2), so the moving side and the still
 * frame print the same cells.
 */

/** A colour as the shader takes it: red, green, blue and alpha in 0 to 1. */
export type ShaderColor = [number, number, number, number];

export type PatternMount = {
  /** plays at the recipe's speed, from the frame it holds */
  play(): void;
  /** holds the frame it shows: speed 0, no frame callback */
  pause(): void;
  /** the still frame: speed 0 at the capture's anchor */
  still(): void;
  /** the slide's ink and paper, after a kit or an appearance change */
  recolor(paper: ShaderColor, ink: ShaderColor): void;
  /** the frame in ms (the drivers' reading) */
  frame(): number;
  dispose(): void;
};

/** The pixels the mount renders at most: the slide's own 1,600 by 900 (one per sheet unit). */
const MAX_PIXELS = 1600 * 900;

export function createPatternMount(
  box: HTMLElement,
  colors: { paper: ShaderColor; ink: ShaderColor },
): PatternMount {
  const mount = new ShaderMount(
    box,
    ditheringFragmentShader,
    { ...HOME_PATTERN.uniforms, u_colorBack: colors.paper, u_colorFront: colors.ink },
    undefined,
    0,
    HOME_PATTERN.frame,
    1,
    MAX_PIXELS,
  );
  return {
    play: () => mount.setSpeed(HOME_PATTERN.speed),
    pause: () => mount.setSpeed(0),
    still() {
      mount.setSpeed(0);
      mount.setFrame(HOME_PATTERN.frame);
    },
    recolor: (paper, ink) => mount.setUniforms({ u_colorBack: paper, u_colorFront: ink }),
    frame: () => mount.getCurrentFrame(),
    dispose: () => {
      mount.dispose();
      mount.canvasElement.remove();
    },
  };
}
