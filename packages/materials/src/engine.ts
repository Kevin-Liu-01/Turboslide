// The shader engines (PLAN wave 3.1; docs/archive/rounds/FEATURES.md 5.2 item 2): one interface over
// two paths. `paper` is Paper Shaders' ShaderMount (mount.ts, unchanged); `glyph` is Glyphfield's
// own engine, a WebGL2 program per material or the glyph field on Canvas 2D (glyph/renderer.ts).
// A live mount of either is a MaterialHandle (mount.ts): recipe values in, `setFrame` to any
// moment, a speed, the canvas, `reachSize` for a capture and `setPixelBudget` for the show's
// adaptive quality. This module holds the glyph path: the pure conversion of a recipe into a frame
// (the client mount and the hosted capture share it) and the browser mount. A material's frame is
// a function of its uniforms and its time alone, so the still at the anchor is the same picture in
// the editor, in the show and in every export.
import type { MaterialUniformValue, MaterialUniforms } from '@turboslide/schema/blocks/material';

import type { GlyphEntry, MaterialEntry, ShaderEngineName } from './catalog.ts';
import { hexToSrgb, shaderColor } from './glyph/color.ts';
import type { GlyphColor, GlyphFrame, GlyphProgramSpec, GlyphRenderer } from './glyph/renderer.ts';
import { createGlyphRenderer } from './glyph/renderer.ts';
import { GLYPH_VERTEX_SOURCE, glyphFragmentSource } from './glyph/shaders.ts';
import { isColorString } from './recipe.ts';

/** What every engine's live mount answers (mount.ts builds the MaterialHandle over it). */
export type ShaderEngine = {
  name: ShaderEngineName;
  /** Recipe values (`u_*` names, hex colours), merged over the mount's and drawn at the current frame. */
  setUniforms: (uniforms: MaterialUniforms) => void;
  setFrame: (ms: number) => void;
  /** 0 holds the frame; above 0 the engine's own loop plays. */
  setSpeed: (speed: number) => void;
  frame: () => number;
  canvas: () => HTMLCanvasElement;
  /** Resolves once the canvas is exactly `width` by `height` pixels (the capture's frame size). */
  reachSize: (width: number, height: number) => Promise<void>;
  /** The most pixels the canvas may hold (the show's adaptive quality halves it). */
  setPixelBudget: (maxPixelCount: number) => void;
  dispose: () => void;
};

/** The engine an entry runs on. */
export function engineOf(entry: MaterialEntry): ShaderEngineName {
  return entry.engine;
}

/** The fonts the glyph field draws with: Inter, the one typeface. */
export const GLYPH_FIELD_FONT = 'Inter, InterVariable, system-ui, sans-serif';

/** The face the glyph field waits for before a capture (`document.fonts.load`). */
export const GLYPH_FIELD_FONT_LOAD = '500 32px Inter';

/** The letters the glyph field's grid cycles through. */
export const GLYPH_FIELD_GLYPHS = 'GLYPHFIELD';

/** The program a glyph entry compiles: its GLSL on WebGL2, or the glyph field on Canvas 2D. */
export function glyphProgramSpec(entry: GlyphEntry): GlyphProgramSpec {
  if (entry.shader === 'glyph-field')
    return { kind: 'canvas2d', glyphs: GLYPH_FIELD_GLYPHS, font: GLYPH_FIELD_FONT };
  return {
    kind: 'webgl2',
    vertex: GLYPH_VERTEX_SOURCE,
    fragment: glyphFragmentSource(entry.shader),
  };
}

function colorOf(value: MaterialUniformValue | undefined, fallback: string): GlyphColor {
  const hex =
    typeof value === 'string' && isColorString(value) && value.startsWith('#') ? value : fallback;
  const { linear, lab } = shaderColor(hex);
  return { srgb: hexToSrgb(hex), linear, lab };
}

function numberOf(value: MaterialUniformValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The frame a glyph program draws for resolved recipe uniforms at `ms` (the recipe's clock, Paper's
 * unit): every control from the record or the entry's default, the colours in the three forms, and
 * the program's time in seconds at the entry's tuned rate.
 */
export function glyphFrameOf(
  entry: GlyphEntry,
  uniforms: MaterialUniforms,
  width: number,
  height: number,
  ms: number,
): GlyphFrame {
  const defaults = new Map(entry.uniforms.map((spec) => [spec.name, spec.default]));
  const value = (name: string, fallback: number) =>
    numberOf(uniforms[name], numberOf(defaults.get(name), fallback));
  const colour = (name: string, fallback: string) => {
    const own = defaults.get(name);
    return colorOf(uniforms[name], typeof own === 'string' ? own : fallback);
  };
  return {
    width,
    height,
    time: (Math.max(0, ms) / 1000) * entry.timeScale,
    strength: value('u_strength', 0.3),
    detail: value('u_detail', 3.2),
    frequency: value('u_frequency', 5.5),
    amplitude: value('u_amplitude', 3.2),
    density: value('u_density', 0.8),
    brightness: value('u_brightness', 0.8),
    grain: value('u_grain', 32),
    rotation: value('u_rotation', 0),
    scale: value('u_scale', 1),
    colors: [
      colour('u_colorA', '#070707'),
      colour('u_colorB', '#8a8f98'),
      colour('u_colorC', '#f2f2f0'),
    ],
  };
}

export type GlyphMountOptions = {
  speed: number;
  frame: number;
  minPixelRatio: number;
  maxPixelCount: number;
  preserveDrawingBuffer: boolean;
};

/**
 * Mounts a glyph entry on a host: a canvas prepended and laid over the host's box the way Paper
 * lays its own, sized by a ResizeObserver to the box times max(dpr, minPixelRatio) under the pixel
 * cap, and drawn on every change. Speed above 0 plays on the engine's own animation frames; the
 * editor's pacer runs it at 0 and moves `setFrame` itself. Throws when the context is missing or
 * the program does not compile. Browser only.
 */
export function mountGlyph(
  host: HTMLElement,
  entry: GlyphEntry,
  uniforms: MaterialUniforms,
  options: GlyphMountOptions,
): ShaderEngine {
  const doc = host.ownerDocument;
  const view = doc.defaultView ?? window;
  const canvas = doc.createElement('canvas');
  Object.assign(canvas.style, {
    display: 'block',
    position: 'absolute',
    inset: '0',
    zIndex: '-1',
    width: '100%',
    height: '100%',
    borderRadius: 'inherit',
  });
  if (view.getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.prepend(canvas);
  const program = glyphProgramSpec(entry);
  let renderer: GlyphRenderer;
  try {
    renderer = createGlyphRenderer(canvas, program, options.preserveDrawingBuffer);
  } catch (error) {
    canvas.remove();
    throw error;
  }
  let values: MaterialUniforms = { ...uniforms };
  let frame = options.frame;
  let speed = options.speed;
  let budget = options.maxPixelCount;
  let box = { width: 0, height: 0 };
  let target: { width: number; height: number } | null = null;
  let loopId = 0;
  let last: number | null = null;
  let disposed = false;

  const pixels = () => {
    if (target !== null) return target;
    const ratio = Math.max(view.devicePixelRatio || 1, options.minPixelRatio);
    let width = Math.max(1, Math.round(box.width * ratio));
    let height = Math.max(1, Math.round(box.height * ratio));
    const headroom = Math.min(1, Math.sqrt(budget / (width * height)));
    width = Math.max(1, Math.round(width * headroom));
    height = Math.max(1, Math.round(height * headroom));
    return { width, height };
  };
  const draw = () => {
    if (disposed || box.width === 0) return;
    const size = pixels();
    renderer.draw(glyphFrameOf(entry, values, size.width, size.height, frame));
  };
  const tick = (time: number) => {
    loopId = 0;
    if (disposed || speed === 0) return;
    if (last !== null && !doc.hidden) frame += (time - last) * speed;
    last = time;
    draw();
    loopId = view.requestAnimationFrame(tick);
  };
  const play = () => {
    if (speed === 0) {
      if (loopId !== 0) view.cancelAnimationFrame(loopId);
      loopId = 0;
      last = null;
    } else if (loopId === 0) {
      loopId = view.requestAnimationFrame(tick);
    }
  };
  const observer = new view.ResizeObserver(([item]) => {
    const size = item?.borderBoxSize[0];
    box = size
      ? { width: size.inlineSize, height: size.blockSize }
      : { width: host.clientWidth, height: host.clientHeight };
    draw();
  });
  observer.observe(host);
  /* the glyph field draws in Inter: once the face is loaded, the frame is drawn again in it */
  const fontReady: Promise<unknown> =
    program.kind === 'canvas2d' && doc.fonts !== undefined
      ? doc.fonts.load(GLYPH_FIELD_FONT_LOAD).then(draw, () => undefined)
      : Promise.resolve();
  play();

  return {
    name: 'glyph',
    setUniforms: (next) => {
      values = { ...values, ...next };
      draw();
    },
    setFrame: (ms) => {
      frame = ms;
      draw();
    },
    setSpeed: (next) => {
      speed = next;
      play();
    },
    frame: () => frame,
    canvas: () => canvas,
    reachSize: async (width, height) => {
      target = { width, height };
      await fontReady;
      for (let i = 0; i < 240 && box.width === 0; i += 1)
        await new Promise((resolve) => view.requestAnimationFrame(resolve));
      draw();
    },
    setPixelBudget: (next) => {
      budget = next;
      draw();
    },
    dispose: () => {
      disposed = true;
      if (loopId !== 0) view.cancelAnimationFrame(loopId);
      observer.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };
}
