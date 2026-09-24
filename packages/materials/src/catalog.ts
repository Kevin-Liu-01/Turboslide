// The material catalog (SPEC 5.4: "The catalog in @turboslide/materials lists paper:* (Paper
// Shaders) and proto:* ... with uniform schemas and brand palette presets"). One entry per Paper
// Shaders material this package binds, with its fragment shader name, its sizing family, the
// textures it samples, its palette roles and one spec per uniform in the recipe's `u_*` names:
// kind, default, range and options, read from @paper-design/shaders 0.0.78's uniform docs and
// the React wrapper's Default presets. The entry shape every transport reads (material.list) is
// MaterialCatalogEntry in the schema package; the extra fields here drive paper.ts and mount.ts.
// The features round's ship two (docs/FEATURES.md 5.2, 5.4, 5.7) adds the gallery's five
// categories (Glyphfield's `shaderLab.ts`: Fluid, Light, Metal, Gradient, Graphic), the featured
// order the gallery lists first, the still entries whose frame has no time, the featured preset an
// insert lands (the diamond for liquid metal, never `ink-paper`) and `entryWithPalette`, the entry
// with its palette presets computed from a deck's kit (presets.ts). Browser safe.
import type {
  MaterialCatalogEntry,
  MaterialUniformSpec,
  MaterialUniformValue,
} from '@turboslide/schema/blocks/material';

import type { PaletteRoles, ShaderPalette } from './presets.ts';
import { LEGACY_SHADER_PALETTE, presetsFor } from './presets.ts';
import { PROTO_MATERIALS } from './proto.ts';

/** The gallery's five chips (docs/FEATURES.md 5.4; Glyphfield's `shaderLab.ts` categories). */
export const SHADER_CATEGORIES = [
  { id: 'fluid', label: 'Fluid' },
  { id: 'light', label: 'Light' },
  { id: 'metal', label: 'Metal' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'graphic', label: 'Graphic' },
] as const;
export type ShaderCategory = (typeof SHADER_CATEGORIES)[number]['id'];

/** The entries the gallery lists first, in this order (5.4). */
export const FEATURED_MATERIAL_IDS: ReadonlyArray<string> = [
  'paper:liquid-metal',
  'paper:gem-smoke',
  'paper:god-rays',
  'paper:mesh-gradient',
  'paper:smoke-ring',
  'paper:grain-gradient',
];

/** The @paper-design/shaders export that holds the fragment shader, without the `FragmentShader` suffix. */
export type PaperShaderName =
  | 'liquidMetal'
  | 'gemSmoke'
  | 'smokeRing'
  | 'godRays'
  | 'meshGradient'
  | 'simplexNoise'
  | 'swirl'
  | 'spiral'
  | 'grainGradient'
  | 'dithering'
  | 'staticRadialGradient'
  | 'neuroNoise'
  | 'metaballs'
  | 'waves'
  | 'dotGrid'
  | 'perlinNoise'
  | 'staticMeshGradient';

export type MaterialEntry = MaterialCatalogEntry & {
  shader: PaperShaderName;
  /** Paper's two sizing families: object (fit contain, the shape in the box) or pattern (fit none). */
  sizing: 'object' | 'pattern';
  /** The shader samples Paper's packaged noise texture through u_noiseTexture. */
  noiseTexture: boolean;
  /** The shader masks by an uploaded image (u_image, u_isImage); a frame uses its shape instead. */
  imageMask: boolean;
  palette: PaletteRoles;
  /** The gallery chip the entry sits under (5.4). */
  category: ShaderCategory;
  /** A still shader (dot grid, waves, the static gradients): its frame has no time, so the Frame row hides (5.2 P1 item 3). */
  still: boolean;
  /** The preset an insert lands (5.2): the recorded recipe where one exists, else the first palette preset. */
  featuredPreset?: string;
};

const PAPER_CREDIT = 'Material: {label}, Paper Shaders';
const PAPER_LICENSE = 'Apache-2.0, Copyright 2026 Paper (THIRD_PARTY_NOTICES.md)';

function f(
  name: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step = 0.01,
  help?: string,
): MaterialUniformSpec {
  return { name, label, kind: 'float', default: def, min, max, step, ...(help ? { help } : {}) };
}

function int(
  name: string,
  label: string,
  def: number,
  min: number,
  max: number,
  help?: string,
): MaterialUniformSpec {
  return { name, label, kind: 'int', default: def, min, max, step: 1, ...(help ? { help } : {}) };
}

function color(name: string, label: string, def: string, help?: string): MaterialUniformSpec {
  return { name, label, kind: 'color', default: def, ...(help ? { help } : {}) };
}

function colors(name: string, label: string, def: string, maxCount: number): MaterialUniformSpec {
  return {
    name,
    label,
    kind: 'colors',
    default: def,
    maxCount,
    help: `Up to ${maxCount} colors as a comma list of hex values.`,
  };
}

function en(
  name: string,
  label: string,
  def: MaterialUniformValue,
  options: Record<string, number>,
  help?: string,
): MaterialUniformSpec {
  return {
    name,
    label,
    kind: 'enum',
    default: def,
    options: Object.entries(options).map(([optionName, value]) => ({ name: optionName, value })),
    ...(help ? { help } : {}),
  };
}

const SHAPES_5 = { none: 0, circle: 1, daisy: 2, diamond: 3, metaballs: 4 } as const;
const FIT = { none: 0, contain: 1, cover: 2 } as const;

/** Paper's sizing uniforms (shader-sizing.ts), defaults per family with the entry's own scale. */
function sizing(family: 'object' | 'pattern', scale = 1): MaterialUniformSpec[] {
  return [
    en(
      'u_fit',
      'Fit',
      family === 'object' ? 'contain' : 'none',
      FIT,
      'How the graphic fits the canvas.',
    ),
    f('u_scale', 'Scale', scale, 0.01, 4, 0.01, 'Zoom of the graphic (0.01 to 4).'),
    f('u_rotation', 'Rotation', 0, 0, 360, 1, 'Degrees.'),
    f('u_offsetX', 'Offset X', 0, -1, 1, 0.01),
    f('u_offsetY', 'Offset Y', 0, -1, 1, 0.01),
    f('u_originX', 'Origin X', 0.5, 0, 1, 0.01),
    f('u_originY', 'Origin Y', 0.5, 0, 1, 0.01),
    f('u_worldWidth', 'World width', 0, 0, 8192, 1, '0 takes the canvas width.'),
    f('u_worldHeight', 'World height', 0, 0, 8192, 1, '0 takes the canvas height.'),
  ];
}

type Base = Omit<
  MaterialEntry,
  'family' | 'available' | 'credit' | 'license' | 'presets' | 'still'
> & { still?: boolean };

function paper(base: Base): MaterialEntry {
  return {
    ...base,
    still: base.still ?? false,
    family: 'paper',
    available: true,
    credit: PAPER_CREDIT.replace('{label}', base.label.toLowerCase()),
    license: PAPER_LICENSE,
    presets: presetsFor(base.id, base.palette),
  };
}

export const MATERIALS: Readonly<Record<string, MaterialEntry>> = {
  'paper:liquid-metal': paper({
    id: 'paper:liquid-metal',
    label: 'Liquid metal',
    doc: 'Fluid chrome over a shape (circle, daisy, diamond, metaballs) or the whole canvas: animated stripes distorted along the edges, with dispersion and contour controls. The Prototemplate and Glyphfield opener.',
    shader: 'liquidMetal',
    sizing: 'object',
    noiseTexture: false,
    imageMask: true,
    palette: { back: 'u_colorBack', front: 'u_colorTint' },
    category: 'metal',
    featuredPreset: 'diamond',
    uniforms: [
      color('u_colorBack', 'Ground', '#aaaaac'),
      color('u_colorTint', 'Tint', '#ffffff', 'Color burn over the metal.'),
      f('u_repetition', 'Repetition', 2, 1, 10, 0.1, 'Density of the stripes (1 to 10).'),
      f('u_softness', 'Softness', 0.1, 0, 1, 0.01, '0 a hard edge, 1 a smooth gradient.'),
      f('u_shiftRed', 'Shift red', 0.3, -1, 1, 0.01, 'Red channel dispersion.'),
      f('u_shiftBlue', 'Shift blue', 0.3, -1, 1, 0.01, 'Blue channel dispersion.'),
      f('u_distortion', 'Distortion', 0.07, 0, 1, 0.01, 'Noise over the stripes.'),
      f('u_contour', 'Contour', 0.4, 0, 1, 0.01, 'Distortion along the shape edge.'),
      f('u_angle', 'Angle', 70, 0, 360, 1, 'Direction of the stripe motion in degrees.'),
      en(
        'u_shape',
        'Shape',
        'diamond',
        SHAPES_5,
        'The form the metal fills when no image is given.',
      ),
      ...sizing('object', 0.6),
    ],
  }),
  'paper:gem-smoke': paper({
    id: 'paper:gem-smoke',
    label: 'Gem smoke',
    doc: 'Animated color fields behind a glassy shape: smoke inside and around the form with separate glow and distortion inside and out. The two color openers, Blog and content and Developer experience.',
    shader: 'gemSmoke',
    sizing: 'object',
    noiseTexture: false,
    imageMask: true,
    palette: { back: 'u_colorBack', colors: 'u_colors', inner: 'u_colorInner' },
    category: 'fluid',
    featuredPreset: 'brand-blue',
    uniforms: [
      color('u_colorBack', 'Ground', '#f0efea'),
      colors('u_colors', 'Smoke colors', '#333333,#e7e6df', 6),
      color(
        'u_colorInner',
        'Inner fill',
        '#fafaf5',
        'Mixed with the smoke inside the shape; #00000000 is none.',
      ),
      f('u_innerDistortion', 'Inner distortion', 0.8, 0, 1),
      f('u_outerDistortion', 'Outer distortion', 0.6, 0, 1),
      f('u_outerGlow', 'Outer glow', 0.55, 0, 1),
      f('u_innerGlow', 'Inner glow', 1, 0, 1),
      f('u_offset', 'Offset', 0, -1, 1, 0.01, 'Vertical offset of the smoke inside the shape.'),
      f('u_angle', 'Angle', 0, 0, 360, 1, 'Smoke direction in degrees.'),
      f('u_size', 'Size', 0.8, 0, 1, 0.01, 'Size of the smoke relative to the shape box.'),
      en('u_shape', 'Shape', 'diamond', SHAPES_5),
      ...sizing('object', 0.6),
    ],
  }),
  'paper:smoke-ring': paper({
    id: 'paper:smoke-ring',
    label: 'Smoke ring',
    doc: 'A radial multi-color gradient shaped with layered noise into a smoky ring.',
    shader: 'smokeRing',
    sizing: 'object',
    noiseTexture: true,
    imageMask: false,
    palette: { back: 'u_colorBack', colors: 'u_colors' },
    category: 'fluid',
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      colors('u_colors', 'Ring colors', '#ffffff', 10),
      f('u_noiseScale', 'Noise scale', 3, 0.01, 5, 0.01),
      f('u_thickness', 'Thickness', 0.65, 0, 1),
      f('u_radius', 'Radius', 0.25, 0, 1),
      f('u_innerShape', 'Inner shape', 0.7, 0, 4, 0.01),
      int('u_noiseIterations', 'Noise iterations', 8, 1, 8, 'More layers, more detail (1 to 8).'),
      ...sizing('object', 0.8),
    ],
  }),
  'paper:god-rays': paper({
    id: 'paper:god-rays',
    label: 'God rays',
    doc: 'A fan of light rays from one point with a bloom, the cleanest hard geometry after the ring (OPENERS.md, rejected at 1.9 percent lit).',
    shader: 'godRays',
    sizing: 'object',
    noiseTexture: true,
    imageMask: false,
    palette: { back: 'u_colorBack', colors: 'u_colors', front: 'u_colorBloom' },
    category: 'light',
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      color('u_colorBloom', 'Bloom', '#0000ff'),
      colors('u_colors', 'Ray colors', '#a600ff6e,#6200fff0,#ffffff,#33fff5', 10),
      f('u_spotty', 'Spotty', 0.3, 0, 1),
      f('u_midSize', 'Mid size', 0.2, 0, 1),
      f('u_midIntensity', 'Mid intensity', 0.4, 0, 1),
      f('u_density', 'Density', 0.3, 0, 1),
      f('u_intensity', 'Intensity', 0.8, 0, 1),
      f('u_bloom', 'Bloom amount', 0.4, 0, 1),
      ...sizing('object', 1),
    ],
  }),
  'paper:mesh-gradient': paper({
    id: 'paper:mesh-gradient',
    label: 'Mesh gradient',
    doc: 'Color spots moving along distinct paths, warped by organic distortion and swirl.',
    shader: 'meshGradient',
    sizing: 'object',
    noiseTexture: false,
    imageMask: false,
    palette: { colors: 'u_colors' },
    category: 'gradient',
    uniforms: [
      colors('u_colors', 'Colors', '#e0eaff,#241d9a,#f75092,#9f50d3', 10),
      f('u_distortion', 'Distortion', 0.8, 0, 1),
      f('u_swirl', 'Swirl', 0.1, 0, 1),
      f('u_grainMixer', 'Grain mixer', 0, 0, 1),
      f('u_grainOverlay', 'Grain overlay', 0, 0, 1),
      ...sizing('object', 1),
    ],
  }),
  'paper:simplex-noise': paper({
    id: 'paper:simplex-noise',
    label: 'Simplex noise',
    doc: 'A multi-color gradient mapped into smooth animated curves, stepped or soft.',
    shader: 'simplexNoise',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { colors: 'u_colors' },
    category: 'gradient',
    uniforms: [
      colors('u_colors', 'Colors', '#4449cf,#ffd1e0,#f94446,#ffd36b,#ffffff', 10),
      int('u_stepsPerColor', 'Steps per color', 2, 1, 10),
      f('u_softness', 'Softness', 0, 0, 1),
      ...sizing('pattern', 0.6),
    ],
  }),
  'paper:swirl': paper({
    id: 'paper:swirl',
    label: 'Swirl',
    doc: 'Color bands twisted around a center, with noise over the twist.',
    shader: 'swirl',
    sizing: 'object',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', colors: 'u_colors' },
    category: 'fluid',
    uniforms: [
      color('u_colorBack', 'Ground', '#330000'),
      colors('u_colors', 'Band colors', '#ffd1d1,#ff8a8a,#660000', 10),
      f('u_bandCount', 'Band count', 4, 0, 15, 1, '0 gives concentric ripples.'),
      f('u_twist', 'Twist', 0.1, 0, 1),
      f('u_center', 'Center', 0.2, 0, 1),
      f('u_proportion', 'Proportion', 0.5, 0, 1),
      f('u_softness', 'Softness', 0, 0, 1),
      f('u_noiseFrequency', 'Noise frequency', 0.4, 0, 1),
      f('u_noise', 'Noise', 0.2, 0, 1),
      ...sizing('object', 1),
    ],
  }),
  'paper:spiral': paper({
    id: 'paper:spiral',
    label: 'Spiral',
    doc: 'A single spiral stroke on a ground, with taper, cap and noise; dithers to one clean line (OPENERS.md).',
    shader: 'spiral',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', front: 'u_colorFront' },
    category: 'graphic',
    uniforms: [
      color('u_colorBack', 'Ground', '#001429'),
      color('u_colorFront', 'Stroke', '#79d1ff'),
      f('u_density', 'Density', 1, 0, 1),
      f('u_distortion', 'Distortion', 0, 0, 1),
      f('u_strokeWidth', 'Stroke width', 0.5, 0, 1),
      f('u_strokeTaper', 'Stroke taper', 0, 0, 1),
      f('u_strokeCap', 'Stroke cap', 0, 0, 1),
      f('u_noise', 'Noise', 0, 0, 1),
      f('u_noiseFrequency', 'Noise frequency', 0, 0, 1),
      f('u_softness', 'Softness', 0, 0, 1),
      ...sizing('pattern', 1),
    ],
  }),
  'paper:grain-gradient': paper({
    id: 'paper:grain-gradient',
    label: 'Grain gradient',
    doc: 'A grainy gradient shaped as a wave, dots, truchet tiles, corners, a ripple, a blob or a sphere.',
    shader: 'grainGradient',
    sizing: 'pattern',
    noiseTexture: true,
    imageMask: false,
    palette: { back: 'u_colorBack', colors: 'u_colors' },
    category: 'gradient',
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      colors('u_colors', 'Colors', '#7300ff,#eba8ff,#00bfff,#2a00ff', 10),
      f('u_softness', 'Softness', 0.5, 0, 1),
      f('u_intensity', 'Intensity', 0.5, 0, 1),
      f('u_noise', 'Noise', 0.25, 0, 1),
      en('u_shape', 'Shape', 'corners', {
        wave: 1,
        dots: 2,
        truchet: 3,
        corners: 4,
        ripple: 5,
        blob: 6,
        sphere: 7,
      }),
      ...sizing('pattern', 1),
    ],
  }),
  'paper:dithering': paper({
    id: 'paper:dithering',
    label: 'Dithering',
    doc: 'Paper’s ordered dither over a shape, at 2 by 2, 4 by 4 or 8 by 8, in two colors; the deck’s own screen is the two-tone treatment, this is the shader.',
    shader: 'dithering',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', front: 'u_colorFront' },
    category: 'graphic',
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      color('u_colorFront', 'Front', '#00b2ff'),
      en('u_shape', 'Shape', 'sphere', {
        simplex: 1,
        warp: 2,
        dots: 3,
        wave: 4,
        ripple: 5,
        swirl: 6,
        sphere: 7,
      }),
      en('u_type', 'Type', '4x4', { random: 1, '2x2': 2, '4x4': 3, '8x8': 4 }),
      f('u_pxSize', 'Pixel size', 2, 1, 20, 1),
      ...sizing('pattern', 0.6),
    ],
  }),
  'paper:static-radial-gradient': paper({
    id: 'paper:static-radial-gradient',
    label: 'Static radial gradient',
    doc: 'A still radial gradient with a movable focal point, falloff, mixing and distortion.',
    shader: 'staticRadialGradient',
    sizing: 'object',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', colors: 'u_colors' },
    category: 'gradient',
    still: true,
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      colors('u_colors', 'Colors', '#00bbff,#00ffe1,#ffffff', 10),
      f('u_radius', 'Radius', 0.8, 0, 2),
      f('u_focalDistance', 'Focal distance', 0.99, 0, 1),
      f('u_focalAngle', 'Focal angle', 0, 0, 360, 1),
      f('u_falloff', 'Falloff', 0.24, -1, 1),
      f('u_mixing', 'Mixing', 0.5, 0, 1),
      f('u_distortion', 'Distortion', 0, 0, 1),
      f('u_distortionShift', 'Distortion shift', 0, -1, 1),
      f('u_distortionFreq', 'Distortion frequency', 12, 0, 20, 0.1),
      f('u_grainMixer', 'Grain mixer', 0, 0, 1),
      f('u_grainOverlay', 'Grain overlay', 0, 0, 1),
      ...sizing('object', 1),
    ],
  }),
  'paper:neuro-noise': paper({
    id: 'paper:neuro-noise',
    label: 'Neuro noise',
    doc: 'A glowing web of fluid lines and soft intersections in three colors.',
    shader: 'neuroNoise',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', front: 'u_colorFront' },
    category: 'light',
    uniforms: [
      color('u_colorFront', 'Front', '#ffffff'),
      color('u_colorMid', 'Mid', '#47a6ff'),
      color('u_colorBack', 'Ground', '#000000'),
      f('u_brightness', 'Brightness', 0.05, 0, 1),
      f('u_contrast', 'Contrast', 0.3, 0, 1),
      ...sizing('pattern', 1),
    ],
  }),
  'paper:metaballs': paper({
    id: 'paper:metaballs',
    label: 'Metaballs',
    doc: 'Up to 20 gooey blobs moving around the center and merging into smooth forms.',
    shader: 'metaballs',
    sizing: 'object',
    noiseTexture: true,
    imageMask: false,
    palette: { back: 'u_colorBack', colors: 'u_colors' },
    category: 'fluid',
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      colors('u_colors', 'Colors', '#6e33cc,#ff5500,#ffc105,#ffc800,#f585ff', 8),
      int('u_count', 'Count', 10, 1, 20),
      f('u_size', 'Size', 0.83, 0, 1),
      ...sizing('object', 1),
    ],
  }),
  'paper:waves': paper({
    id: 'paper:waves',
    label: 'Waves',
    doc: 'A still line pattern from sharp zigzags to smooth waves in two colors.',
    shader: 'waves',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', front: 'u_colorFront' },
    category: 'graphic',
    still: true,
    uniforms: [
      color('u_colorFront', 'Front', '#ffbb00'),
      color('u_colorBack', 'Ground', '#000000'),
      f('u_shape', 'Shape', 0, 0, 3, 0.01, '0 zigzag, 1 sine, 2 to 3 irregular; fractions morph.'),
      f('u_frequency', 'Frequency', 0.5, 0, 2),
      f('u_amplitude', 'Amplitude', 0.5, 0, 1),
      f('u_spacing', 'Spacing', 1.2, 0, 2),
      f('u_proportion', 'Proportion', 0.1, 0, 1),
      f('u_softness', 'Softness', 0, 0, 1),
      ...sizing('pattern', 0.6),
    ],
  }),
  'paper:dot-grid': paper({
    id: 'paper:dot-grid',
    label: 'Dot grid',
    doc: 'A still grid of circles, diamonds, squares or triangles with fill and stroke.',
    shader: 'dotGrid',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', front: 'u_colorFill' },
    category: 'graphic',
    still: true,
    uniforms: [
      color('u_colorBack', 'Ground', '#000000'),
      color('u_colorFill', 'Fill', '#ffffff'),
      color('u_colorStroke', 'Stroke', '#ffaa00'),
      f('u_dotSize', 'Dot size', 2, 0, 100, 0.5),
      f('u_gapX', 'Gap X', 32, 2, 500, 1),
      f('u_gapY', 'Gap Y', 32, 2, 500, 1),
      f('u_strokeWidth', 'Stroke width', 0, 0, 50, 0.5),
      f('u_sizeRange', 'Size range', 0, 0, 1),
      f('u_opacityRange', 'Opacity range', 0, 0, 1),
      en('u_shape', 'Shape', 'circle', { circle: 0, diamond: 1, square: 2, triangle: 3 }),
      ...sizing('pattern', 1),
    ],
  }),
  'paper:perlin-noise': paper({
    id: 'paper:perlin-noise',
    label: 'Perlin noise',
    doc: 'Animated 3D Perlin noise in two colors with octave, persistence and lacunarity controls.',
    shader: 'perlinNoise',
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    palette: { back: 'u_colorBack', front: 'u_colorFront' },
    category: 'fluid',
    uniforms: [
      color('u_colorFront', 'Front', '#fccff7'),
      color('u_colorBack', 'Ground', '#632ad5'),
      f('u_proportion', 'Proportion', 0.35, 0, 1),
      f('u_softness', 'Softness', 0.1, 0, 1),
      int('u_octaveCount', 'Octaves', 1, 1, 8),
      f('u_persistence', 'Persistence', 1, 0.3, 1),
      f('u_lacunarity', 'Lacunarity', 1.5, 1.5, 10, 0.1),
      ...sizing('pattern', 1),
    ],
  }),
  'paper:static-mesh-gradient': paper({
    id: 'paper:static-mesh-gradient',
    label: 'Static mesh gradient',
    doc: 'A still mesh gradient: color spots placed by a seed and warped by two waves.',
    shader: 'staticMeshGradient',
    sizing: 'object',
    noiseTexture: false,
    imageMask: false,
    palette: { colors: 'u_colors' },
    category: 'gradient',
    still: true,
    uniforms: [
      colors('u_colors', 'Colors', '#ffad0a,#6200ff,#e2a3ff,#ff99fd', 10),
      f('u_positions', 'Positions seed', 2, 0, 100, 1),
      f('u_waveX', 'Wave X', 1, 0, 1),
      f('u_waveXShift', 'Wave X shift', 0.6, 0, 1),
      f('u_waveY', 'Wave Y', 1, 0, 1),
      f('u_waveYShift', 'Wave Y shift', 0.21, 0, 1),
      f('u_mixing', 'Mixing', 0.93, 0, 1),
      f('u_grainMixer', 'Grain mixer', 0, 0, 1),
      f('u_grainOverlay', 'Grain overlay', 0, 0, 1),
      ...sizing('object', 1),
    ],
  }),
};

export const MATERIAL_IDS: ReadonlyArray<string> = Object.keys(MATERIALS);

/** The catalog ids in the gallery's order: the featured six first, then the rest in catalog order (5.4). */
export const GALLERY_MATERIAL_IDS: ReadonlyArray<string> = [
  ...FEATURED_MATERIAL_IDS.filter((id) => id in MATERIALS),
  ...MATERIAL_IDS.filter((id) => !FEATURED_MATERIAL_IDS.includes(id)),
];

export function materialEntry(id: string): MaterialEntry | undefined {
  return MATERIALS[id];
}

/**
 * The entry with its palette presets computed from a deck's shader palette (docs/FEATURES.md 5.7):
 * the same entry when the palette is the legacy one, so a deck without a kit record reads the
 * static catalog and today's pixels.
 */
export function entryWithPalette(entry: MaterialEntry, palette: ShaderPalette): MaterialEntry {
  if (palette === LEGACY_SHADER_PALETTE) return entry;
  return { ...entry, presets: presetsFor(entry.id, entry.palette, palette) };
}

/** The entry for a deck: `requireMaterial` over the deck's palette. */
export function requireMaterialFor(id: string, palette: ShaderPalette): MaterialEntry {
  return entryWithPalette(requireMaterial(id), palette);
}

/** The preset an insert lands (5.2): the entry's featured preset, else its first. */
export function featuredPresetOf(entry: MaterialEntry): string | undefined {
  return entry.featuredPreset ?? entry.presets[0]?.name;
}

/** The label of a category chip. */
export function categoryLabel(category: ShaderCategory): string {
  return SHADER_CATEGORIES.find((row) => row.id === category)?.label ?? category;
}

/** The entry, or a RangeError naming the ids that exist (the class SPEC 7.1 gives an unknown id). */
export function requireMaterial(id: string): MaterialEntry {
  const entry = MATERIALS[id];
  if (entry === undefined) {
    const proto = PROTO_MATERIALS.find((candidate) => candidate.id === id);
    if (proto !== undefined) {
      throw new RangeError(
        `${id} is a Prototemplate direction engine and is not ported (SPEC open question 9); available: ${MATERIAL_IDS.join(', ')}`,
      );
    }
    throw new RangeError(`Unknown material "${id}"; available: ${MATERIAL_IDS.join(', ')}`);
  }
  return entry;
}

/** The catalog as every transport reads it (material.list): the paper entries, then the proto stubs. */
export function listMaterials(
  filter?: string,
  palette: ShaderPalette = LEGACY_SHADER_PALETTE,
): MaterialCatalogEntry[] {
  const paperEntries: MaterialCatalogEntry[] = Object.values(MATERIALS).map((entry) => {
    const { id, family, label, doc, available, credit, license, uniforms, presets } =
      entryWithPalette(entry, palette);
    return { id, family, label, doc, available, credit, license, uniforms, presets };
  });
  const all = [...paperEntries, ...PROTO_MATERIALS];
  return filter === undefined ? all : all.filter((entry) => entry.id === filter);
}

/** The uniform spec of an entry by name. */
export function uniformSpec(entry: MaterialEntry, name: string): MaterialUniformSpec | undefined {
  return entry.uniforms.find((spec) => spec.name === name);
}
