// The binding to @paper-design/shaders (SPEC 11: "Turboslide imports the package directly rather
// than extracting Glyphfield's LiveMaterialCanvas"): the fragment shader of a catalog entry and
// the conversion of a resolved recipe (the `u_*` record with hex colors, enum names and comma
// color lists) into the ShaderMountUniforms the mount takes (vec4 colors in 0 to 1, enum numbers,
// a colors array plus its count, the image flag), the way the React wrapper builds them
// (shaders-react liquid-metal.js, gem-smoke.js). The textures a shader samples (the transparent
// image pixel for the image-masked materials, Paper's noise texture) are loaded by mount.ts and
// by the capture page, since they are HTMLImageElements. Browser safe; importable in Node too
// (the package touches no DOM at import time), which is how the capture job converts uniforms.
import {
  ditheringFragmentShader,
  dotGridFragmentShader,
  emptyPixel,
  gemSmokeFragmentShader,
  getShaderColorFromString,
  godRaysFragmentShader,
  grainGradientFragmentShader,
  liquidMetalFragmentShader,
  meshGradientFragmentShader,
  metaballsFragmentShader,
  neuroNoiseFragmentShader,
  perlinNoiseFragmentShader,
  simplexNoiseFragmentShader,
  smokeRingFragmentShader,
  spiralFragmentShader,
  staticMeshGradientFragmentShader,
  staticRadialGradientFragmentShader,
  swirlFragmentShader,
  wavesFragmentShader,
} from '@paper-design/shaders';
import type { ShaderMountUniforms } from '@paper-design/shaders';
import type {
  MaterialUniformSpec,
  MaterialUniformValue,
  MaterialUniforms,
} from '@turboslide/schema/blocks/material';

import type { MaterialEntry, PaperShaderName } from './catalog.ts';
import { enumValue, isColorString, splitColors } from './recipe.ts';

const SHADERS: Readonly<Record<PaperShaderName, string>> = {
  liquidMetal: liquidMetalFragmentShader,
  gemSmoke: gemSmokeFragmentShader,
  smokeRing: smokeRingFragmentShader,
  godRays: godRaysFragmentShader,
  meshGradient: meshGradientFragmentShader,
  simplexNoise: simplexNoiseFragmentShader,
  swirl: swirlFragmentShader,
  spiral: spiralFragmentShader,
  grainGradient: grainGradientFragmentShader,
  dithering: ditheringFragmentShader,
  staticRadialGradient: staticRadialGradientFragmentShader,
  neuroNoise: neuroNoiseFragmentShader,
  metaballs: metaballsFragmentShader,
  waves: wavesFragmentShader,
  dotGrid: dotGridFragmentShader,
  perlinNoise: perlinNoiseFragmentShader,
  staticMeshGradient: staticMeshGradientFragmentShader,
};

/** The GLSL of an entry, from the package. */
export function fragmentShaderFor(entry: MaterialEntry): string {
  return SHADERS[entry.shader];
}

/** The `<name>FragmentShader` export the capture page reads off the module namespace. */
export function fragmentShaderExport(entry: MaterialEntry): string {
  return `${entry.shader}FragmentShader`;
}

/** The transparent pixel Paper mounts as u_image when no image is given (shaders-react transparent-pixel). */
export const EMPTY_PIXEL_SRC: string = emptyPixel;

export type Vec4 = [number, number, number, number];

/** A recipe color (hex or functional string, or a 3 or 4 component array in 0 to 1) as a vec4. */
export function toVec4(value: MaterialUniformValue): Vec4 {
  if (typeof value === 'string') return getShaderColorFromString(value);
  if (Array.isArray(value)) {
    if (value.length === 4) return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 1];
    if (value.length === 3) return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, 1];
  }
  throw new TypeError(`not a color: ${JSON.stringify(value)}`);
}

/** A colors uniform (comma list or a flat vec4 array) as vec4 rows. */
export function toVec4List(value: MaterialUniformValue): Vec4[] {
  if (typeof value === 'string')
    return splitColors(value).map((part) => getShaderColorFromString(part));
  if (Array.isArray(value) && value.length % 4 === 0) {
    const rows: Vec4[] = [];
    for (let i = 0; i < value.length; i += 4)
      rows.push([value[i] ?? 0, value[i + 1] ?? 0, value[i + 2] ?? 0, value[i + 3] ?? 1]);
    return rows;
  }
  throw new TypeError(`not a color list: ${JSON.stringify(value)}`);
}

function convert(spec: MaterialUniformSpec, value: MaterialUniformValue): ShaderMountUniforms {
  switch (spec.kind) {
    case 'float':
    case 'int':
      return { [spec.name]: typeof value === 'number' ? value : Number(value) };
    case 'bool':
      return { [spec.name]: value === 1 || value === 'true' };
    case 'enum': {
      const number = enumValue(spec, value);
      return { [spec.name]: number ?? (typeof spec.default === 'number' ? spec.default : 0) };
    }
    case 'color':
      return { [spec.name]: toVec4(value) };
    case 'colors': {
      const rows = toVec4List(value);
      return { [spec.name]: rows, [`${spec.name}Count`]: rows.length };
    }
  }
}

/**
 * The ShaderMountUniforms of a resolved recipe: every spec converted, `u_colorsCount` beside a
 * colors list, `u_isImage: false` for an image-masked material, and unknown names passed through
 * when they are numbers, arrays or colors (the shader ignores a name it has no location for).
 * Textures (u_image, u_noiseTexture) are not here; see loadTextureSources.
 */
export function toShaderUniforms(
  entry: MaterialEntry,
  uniforms: MaterialUniforms,
): ShaderMountUniforms {
  const out: ShaderMountUniforms = {};
  const known = new Map(entry.uniforms.map((spec) => [spec.name, spec]));
  for (const spec of entry.uniforms) {
    const value = uniforms[spec.name] ?? spec.default;
    Object.assign(out, convert(spec, value));
  }
  for (const [name, value] of Object.entries(uniforms)) {
    if (known.has(name)) continue;
    if (typeof value === 'number') out[name] = value;
    else if (Array.isArray(value)) out[name] = value;
    else if (isColorString(value)) out[name] = getShaderColorFromString(value);
  }
  if (entry.imageMask) out.u_isImage = false;
  return out;
}

/** The uniform names that take an HTMLImageElement, with the data URI each loads from. */
export function textureSources(entry: MaterialEntry, noiseSrc: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (entry.imageMask) out.u_image = EMPTY_PIXEL_SRC;
  if (entry.noiseTexture) out.u_noiseTexture = noiseSrc;
  return out;
}

/** The uniform names that get mipmaps (the image mask, as the React wrapper asks). */
export function mipmapsFor(entry: MaterialEntry): string[] {
  return entry.imageMask ? ['u_image'] : [];
}
