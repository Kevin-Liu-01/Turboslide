// The main-thread mount of a material (SPEC 5.4: "In the editor a material mounts on the main
// thread inside the stage with setUniforms, setMinPixelRatio(2) and setMaxPixelCount(3200 * 1800 +
// 1)"). A framework-free wrapper over Paper's ShaderMount: it resolves the recipe against the
// catalog, converts the uniforms, loads the textures the shader samples, mounts on a host element
// (the canvas is prepended and sized to the host by Paper's ResizeObserver) and hands back a
// handle whose setters take recipe values, so the inspector's Material section writes the same
// `u_*` record the capture job hashes. Browser only (DOM); packages/viewer MaterialMount is the
// React glue over it, and the capture page inlines the same steps for the headless frame.
import { ShaderMount, getShaderNoiseTexture } from '@paper-design/shaders';
import type { MaterialRecipe, MaterialUniforms } from '@turboslide/schema/blocks/material';

import type { MaterialEntry } from './catalog.ts';
import { requireMaterial } from './catalog.ts';
import { fragmentShaderFor, mipmapsFor, textureSources, toShaderUniforms } from './paper.ts';
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
};

export type MaterialHandle = {
  entry: MaterialEntry;
  resolved: ResolvedRecipe;
  mount: ShaderMount;
  /** Recipe values (`u_*` names, hex colors): converted and pushed to the shader. */
  setUniforms: (uniforms: MaterialUniforms) => void;
  setFrame: (ms: number) => void;
  setSpeed: (speed: number) => void;
  /** The frame the shader shows, in ms. */
  frame: () => number;
  dispose: () => void;
};

/** An image from a data URI, decoded, so ShaderMount's texture upload sees a complete image. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** The HTMLImageElement uniforms of an entry (the empty pixel mask, Paper's noise texture). */
export async function loadTextures(
  entry: MaterialEntry,
): Promise<Record<string, HTMLImageElement>> {
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
  const entry = requireMaterial(recipe.materialId);
  const resolved = resolveRecipe(entry, recipe);
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
    mount,
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
    dispose: () => mount.dispose(),
  };
}
