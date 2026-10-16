// The main-thread mount of a material (SPEC 5.4: "In the editor a material mounts on the main
// thread inside the stage with setUniforms, setMinPixelRatio(2) and setMaxPixelCount(3200 * 1800 +
// 1)"). A framework-free wrapper over Paper's ShaderMount: it resolves the recipe against the
// catalog, converts the uniforms, loads the textures the shader samples, mounts on a host element
// (the canvas is prepended and sized to the host by Paper's ResizeObserver) and hands back a
// handle whose setters take recipe values, so the inspector's Material section writes the same
// `u_*` record the capture job hashes. Browser only (DOM); packages/viewer MaterialMount is the
// React glue over it, and the capture page inlines the same steps for the headless frame.
// Glyphfield's engine (PLAN wave 3.1, engine.ts) mounts a `glyph:*` entry through the same handle,
// so the stage, the pacer, the gallery's hover and the client capture take either engine.
import { ShaderMount, getShaderNoiseTexture } from '@paper-design/shaders';
import type { MaterialRecipe, MaterialUniforms } from '@turboslide/schema/blocks/material';

import type { MaterialEntry, PaperEntry, ShaderEngineName } from './catalog.ts';
import { entryWithPalette, requireMaterial } from './catalog.ts';
import { mountGlyph } from './engine.ts';
import { fragmentShaderFor, mipmapsFor, textureSources, toShaderUniforms } from './paper.ts';
import type { ShaderPalette } from './presets.ts';
import type { ResolvedRecipe } from './recipe.ts';
import { resolveRecipe } from './recipe.ts';

/** SPEC 5.4: the minimum pixel ratio and the pixel cap the editor mounts with (a 3200 by 1800 frame). */
export const MOUNT_DEFAULTS = {
  minPixelRatio: 2,
  maxPixelCount: 3200 * 1800 + 1,
} as const;

export type MountOptions = {
  /** Playback speed; 0 freezes the frame at `frame` (the capture's mode). Default 1. */
  speed?: number;
  /** The starting frame in ms; the recipe's anchor when absent. */
  frame?: number;
  minPixelRatio?: number;
  maxPixelCount?: number;
  /** WebGL context attributes; the capture page asks for preserveDrawingBuffer. */
  contextAttributes?: WebGLContextAttributes;
  /**
   * The deck's shader palette (docs/archive/rounds/FEATURES.md 5.7): the palette presets of the entry are
   * computed from it, so a kit's colours reach the live mount; the legacy palette when absent.
   */
  palette?: ShaderPalette;
};

export type MaterialHandle = {
  entry: MaterialEntry;
  resolved: ResolvedRecipe;
  /** The engine drawing it (engine.ts). */
  engine: ShaderEngineName;
  /** Recipe values (`u_*` names, hex colors): converted and pushed to the shader. */
  setUniforms: (uniforms: MaterialUniforms) => void;
  setFrame: (ms: number) => void;
  setSpeed: (speed: number) => void;
  /** The frame the shader shows, in ms. */
  frame: () => number;
  /** The canvas the engine draws into, for a capture's `toBlob` and the perf rows' reads. */
  canvas: () => HTMLCanvasElement;
  /** Resolves once the canvas is exactly `width` by `height` pixels at any display ratio (the client capture). */
  reachSize: (width: number, height: number) => Promise<void>;
  /** The most pixels the canvas may hold; the show's adaptive quality halves it (PLAN wave 3.3). */
  setPixelBudget: (maxPixelCount: number) => void;
  dispose: () => void;
};

/** Frames a capture waits for the host's box and then the canvas's size, at most (four seconds at 60 Hz). */
const SIZE_WAIT_FRAMES = 240;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** An image from a data URI, decoded, so ShaderMount's texture upload sees a complete image. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** The HTMLImageElement uniforms of an entry (the empty pixel mask, Paper's noise texture). */
export async function loadTextures(entry: PaperEntry): Promise<Record<string, HTMLImageElement>> {
  const noise = getShaderNoiseTexture();
  const sources = textureSources(entry, noise?.src ?? '');
  const out: Record<string, HTMLImageElement> = {};
  for (const [name, src] of Object.entries(sources)) {
    if (src === '') continue;
    out[name] = await loadImage(src);
  }
  return out;
}

/**
 * Mounts a recipe on a host. The host needs a box (position and size from its CSS); Paper prepends
 * a canvas and keeps it at the host's size. Throws RangeError for an unknown material or preset
 * and TypeError for a uniform the shader cannot take (recipe.ts), and Paper's own Error when
 * WebGL is unavailable.
 */
export async function mountMaterial(
  host: HTMLElement,
  recipe: MaterialRecipe,
  options: MountOptions = {},
): Promise<MaterialHandle> {
  const entry =
    options.palette === undefined
      ? requireMaterial(recipe.materialId)
      : entryWithPalette(requireMaterial(recipe.materialId), options.palette);
  const resolved = resolveRecipe(entry, recipe);
  if (entry.engine === 'glyph') {
    const engine = mountGlyph(host, entry, resolved.uniforms, {
      speed: options.speed ?? 1,
      frame: options.frame ?? recipe.anchor ?? 0,
      minPixelRatio: options.minPixelRatio ?? MOUNT_DEFAULTS.minPixelRatio,
      maxPixelCount: options.maxPixelCount ?? MOUNT_DEFAULTS.maxPixelCount,
      preserveDrawingBuffer: options.contextAttributes?.preserveDrawingBuffer === true,
    });
    return {
      entry,
      resolved,
      engine: 'glyph',
      setUniforms: (next) => {
        const merged = resolveRecipe(entry, {
          ...(resolved.preset !== undefined ? { preset: resolved.preset } : {}),
          uniforms: { ...resolved.uniforms, ...next },
        });
        resolved.uniforms = merged.uniforms;
        engine.setUniforms(merged.uniforms);
      },
      setFrame: engine.setFrame,
      setSpeed: engine.setSpeed,
      frame: engine.frame,
      canvas: engine.canvas,
      reachSize: engine.reachSize,
      setPixelBudget: engine.setPixelBudget,
      dispose: engine.dispose,
    };
  }
  return mountPaper(host, entry, recipe, resolved, options);
}

async function mountPaper(
  host: HTMLElement,
  entry: PaperEntry,
  recipe: MaterialRecipe,
  resolved: ResolvedRecipe,
  options: MountOptions,
): Promise<MaterialHandle> {
  const uniforms = toShaderUniforms(entry, resolved.uniforms);
  const textures = await loadTextures(entry);
  const mount = new ShaderMount(
    host,
    fragmentShaderFor(entry),
    { ...uniforms, ...textures },
    options.contextAttributes,
    options.speed ?? 1,
    options.frame ?? recipe.anchor ?? 0,
    options.minPixelRatio ?? MOUNT_DEFAULTS.minPixelRatio,
    options.maxPixelCount ?? MOUNT_DEFAULTS.maxPixelCount,
    mipmapsFor(entry),
  );
  return {
    entry,
    resolved,
    engine: 'paper',
    setUniforms: (next) => {
      const merged = resolveRecipe(entry, {
        ...(resolved.preset !== undefined ? { preset: resolved.preset } : {}),
        uniforms: { ...resolved.uniforms, ...next },
      });
      resolved.uniforms = merged.uniforms;
      mount.setUniforms(toShaderUniforms(entry, merged.uniforms));
    },
    setFrame: (ms) => mount.setFrame(ms),
    setSpeed: (speed) => mount.setSpeed(speed),
    frame: () => mount.getCurrentFrame(),
    canvas: () => mount.canvasElement,
    reachSize: async (width, height) => {
      const internals = mount as unknown as { parentWidth: number; devicePixelsSupported: boolean };
      for (let i = 0; i < SIZE_WAIT_FRAMES && internals.parentWidth === 0; i += 1)
        await nextFrame();
      // the fallback path of Paper's resize: the CSS box times max(dpr, minPixelRatio), so a 1x
      // display also reaches the target pixels (capture.ts clears the same flag)
      internals.devicePixelsSupported = false;
      mount.setMinPixelRatio(2);
      const canvas = mount.canvasElement;
      for (
        let i = 0;
        i < SIZE_WAIT_FRAMES && (canvas.width !== width || canvas.height !== height);
        i += 1
      )
        await nextFrame();
    },
    setPixelBudget: (maxPixelCount) => mount.setMaxPixelCount(maxPixelCount),
    dispose: () => mount.dispose(),
  };
}
