// The glyph:* entries (PLAN wave 3.1 and 3.2; the HTML slides design 3.3): Glyphfield's three house
// gradients, its thirteen curated originals, Holo cloth and the glyph field, under Glyphfield's
// names in sentence case. Each entry takes the same uniforms: the eleven controls the prelude reads
// (`glyph/shaders.ts`) and three colours, so the Shader section's controls and the kit's roles map
// one to one (the kit's ground to u_colorA, the list's second colour to u_colorB and the figure to
// u_colorC). The defaults are Glyphfield's tuned looks (`shaderLab.ts` MATERIAL_TUNING and
// `liveMaterials.ts` LIVE_MATERIAL_LOOK_PRESETS, else DEFAULT_LIVE_MATERIAL_SETTINGS), and each
// entry's tuned speed becomes its `timeScale` through Glyphfield's motion rate. The upstream
// studios and references stay in THIRD_PARTY_NOTICES.md; no entry names one. Browser safe.
import type { MaterialUniformSpec } from '@turboslide/schema/blocks/material';

import type { GlyphEntry, ShaderCategory } from '../catalog.ts';
import type { PaletteRoles } from '../presets.ts';
import { presetsFor } from '../presets.ts';

const GLYPH_LICENSE = 'MIT, Copyright 2026 Kevin Liu (Glyphfield; THIRD_PARTY_NOTICES.md)';

/** The kit's ground, the list's second colour and the figure (presets.ts `mid`). */
const GLYPH_PALETTE: PaletteRoles = { back: 'u_colorA', mid: 'u_colorB', front: 'u_colorC' };

/** Glyphfield's look settings: the eleven controls in the prelude's units, plus its speed. */
type Tuning = {
  strength: number;
  detail: number;
  frequency: number;
  amplitude: number;
  density: number;
  brightness: number;
  grain: number;
  rotation: number;
  speed: number;
};

/** Glyphfield's DEFAULT_LIVE_MATERIAL_SETTINGS, the base under every tuned look. */
const BASE: Tuning = {
  strength: 0.3,
  detail: 3.2,
  frequency: 5.5,
  amplitude: 3.2,
  density: 0.8,
  brightness: 0.8,
  grain: 32,
  rotation: 70,
  speed: 0.3,
};

/** Glyphfield's `liveMaterialMotionRate`: a speed setting as a clock rate, at most 3. */
function glyphMotionRate(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.min(3, Math.sqrt(Math.min(1.5, speed)) * 2.1);
}

function float(
  name: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step: number,
  help: string,
): MaterialUniformSpec {
  return { name, label, kind: 'float', default: def, min, max, step, help };
}

function uniformsOf(tuning: Tuning, rotates: boolean): MaterialUniformSpec[] {
  return [
    { name: 'u_colorA', label: 'Ground', kind: 'color', default: '#070707' },
    { name: 'u_colorB', label: 'Middle', kind: 'color', default: '#8a8f98' },
    { name: 'u_colorC', label: 'Highlight', kind: 'color', default: '#f2f2f0' },
    float('u_strength', 'Strength', tuning.strength, 0, 2, 0.01, 'How strong the effect is.'),
    float('u_detail', 'Detail', tuning.detail, 0.5, 8, 0.1, 'How fine the pattern is.'),
    float('u_frequency', 'Frequency', tuning.frequency, 0.2, 10, 0.1, 'Repeats across the box.'),
    float('u_amplitude', 'Amplitude', tuning.amplitude, 0, 8, 0.1, 'How far the form moves.'),
    float('u_density', 'Density', tuning.density, 0.1, 2, 0.05, 'How much of the box it fills.'),
    float('u_brightness', 'Brightness', tuning.brightness, 0.1, 2, 0.05, 'How light it is.'),
    float('u_grain', 'Grain', tuning.grain, 0, 100, 1, 'Film grain, 0 to 100.'),
    ...(rotates ? [float('u_rotation', 'Rotation', tuning.rotation, 0, 360, 1, 'Degrees.')] : []),
    float('u_scale', 'Scale', 1, 0.1, 4, 0.01, 'Zoom of the pattern.'),
  ];
}

type Spec = {
  slug: string;
  label: string;
  doc: string;
  category: ShaderCategory;
  featuredPreset: 'ink-paper' | 'brand-blue';
  tuning?: Partial<Tuning>;
};

function glyph(spec: Spec): GlyphEntry {
  const tuning = { ...BASE, ...spec.tuning };
  const id = `glyph:${spec.slug}`;
  const field = spec.slug === 'glyph-field';
  return {
    id,
    engine: 'glyph',
    family: 'glyph',
    shader: spec.slug as GlyphEntry['shader'],
    timeScale: glyphMotionRate(tuning.speed),
    label: spec.label,
    doc: spec.doc,
    available: true,
    credit: `Material: ${spec.label.toLowerCase()}, Glyphfield`,
    license: GLYPH_LICENSE,
    uniforms: uniformsOf(tuning, !field),
    presets: presetsFor(id, GLYPH_PALETTE),
    sizing: 'pattern',
    noiseTexture: false,
    imageMask: false,
    imageSource: false,
    palette: GLYPH_PALETTE,
    category: spec.category,
    still: false,
    featuredPreset: spec.featuredPreset,
  };
}

const SPECS: ReadonlyArray<Spec> = [
  {
    slug: 'liquid-glass',
    label: 'Liquid glass',
    doc: 'Glass bodies that merge and bend the colours behind them, with coloured edges and soft contact shadows.',
    category: 'metal',
    featuredPreset: 'brand-blue',
  },
  {
    slug: 'caustics',
    label: 'Caustics',
    doc: 'Shifting underwater light: a web of bright lines over a deep pool of colour.',
    category: 'light',
    featuredPreset: 'brand-blue',
  },
  {
    slug: 'iridescent-foil',
    label: 'Iridescent foil',
    doc: 'Crumpled foil whose colour shifts with the angle of each crease, lit from the centre.',
    category: 'metal',
    featuredPreset: 'ink-paper',
  },
  {
    slug: 'nebula',
    label: 'Nebula',
    doc: 'Glowing gas clouds, bright filaments, dark dust lanes and a sparse field of stars.',
    category: 'light',
    featuredPreset: 'brand-blue',
  },
  {
    slug: 'silk-ribbons',
    label: 'Silk ribbons',
    doc: 'Overlapping satin ribbons with soft folds, a sliding sheen and cast shadows.',
    category: 'gradient',
    featuredPreset: 'ink-paper',
  },
  {
    slug: 'spectral-bloom',
    label: 'Spectral bloom',
    doc: 'Soft currents of light that converge into one glowing field, with coloured fringes.',
    category: 'light',
    featuredPreset: 'brand-blue',
    tuning: {
      brightness: 1.04,
      detail: 3.2,
      frequency: 4.2,
      grain: 12,
      speed: 0.26,
      strength: 0.82,
    },
  },
  {
    slug: 'architectural-chrome',
    label: 'Architectural chrome',
    doc: 'Polished chrome shaped by dark reflection cards, narrow strip lights and slow movement.',
    category: 'metal',
    featuredPreset: 'ink-paper',
    tuning: {
      brightness: 0.82,
      detail: 4.8,
      frequency: 4.2,
      grain: 8,
      rotation: 8,
      speed: 0.12,
      strength: 0.46,
    },
  },
  {
    slug: 'radiant-void',
    label: 'Radiant void',
    doc: 'A dark centre ringed by a glowing corona, with fine grain in the light.',
    category: 'light',
    featuredPreset: 'ink-paper',
  },
  {
    slug: 'galactic-rings',
    label: 'Galactic rings',
    doc: 'Concentric rings that ripple outward with split colour edges and a few stars.',
    category: 'light',
    featuredPreset: 'brand-blue',
  },
  {
    slug: 'chrome-glares',
    label: 'Chrome glares',
    doc: 'Folded chrome that catches moving light cards and long glares.',
    category: 'metal',
    featuredPreset: 'ink-paper',
  },
  {
    slug: 'relief-gradient',
    label: 'Relief gradient',
    doc: 'A gradient pressed into soft ridges and lit from one side, like embossed paper.',
    category: 'gradient',
    featuredPreset: 'brand-blue',
  },
  {
    slug: 'orbit-gradient',
    label: 'Orbit gradient',
    doc: 'Soft bodies of colour that orbit the centre and blend like tinted glass.',
    category: 'gradient',
    featuredPreset: 'brand-blue',
  },
  {
    slug: 'soft-register',
    label: 'Soft register',
    doc: 'A two ink print on paper: halftone dots that drift slightly out of register.',
    category: 'graphic',
    featuredPreset: 'ink-paper',
  },
  {
    slug: 'mesh-gradient',
    label: 'Mesh gradient',
    doc: 'Three colours as moving bodies with smooth seams, mixed in a perceptual colour space.',
    category: 'gradient',
    featuredPreset: 'brand-blue',
    tuning: {
      amplitude: 1.8,
      brightness: 0.86,
      density: 0.72,
      detail: 2.2,
      frequency: 3.4,
      grain: 14,
      speed: 0.18,
      strength: 0.28,
    },
  },
  {
    slug: 'grain-gradient',
    label: 'Grain gradient',
    doc: 'A slow gradient whose edges are broken by fine grain, like pigment on paper.',
    category: 'gradient',
    featuredPreset: 'brand-blue',
    tuning: {
      amplitude: 2.6,
      brightness: 0.92,
      density: 0.9,
      detail: 2.8,
      frequency: 3.2,
      grain: 42,
      speed: 0.16,
      strength: 0.34,
    },
  },
  {
    slug: 'dither-gradient',
    label: 'Dither gradient',
    doc: 'A three colour flow resolved through an 8 by 8 ordered dither.',
    category: 'graphic',
    featuredPreset: 'ink-paper',
    tuning: {
      amplitude: 3.4,
      brightness: 0.9,
      density: 1.1,
      detail: 3.6,
      frequency: 5.8,
      grain: 56,
      rotation: 18,
      speed: 0.24,
      strength: 0.62,
    },
  },
  {
    slug: 'holo-cloth',
    label: 'Holo cloth',
    doc: 'A woven holographic textile with moving folds, thread highlights and foil colour.',
    category: 'light',
    featuredPreset: 'ink-paper',
    tuning: {
      amplitude: 5.2,
      brightness: 0.94,
      density: 1.05,
      detail: 6.2,
      frequency: 7.2,
      grain: 24,
      rotation: 12,
      speed: 0.22,
      strength: 0.76,
    },
  },
  {
    slug: 'glyph-field',
    label: 'Glyph field',
    doc: 'A letter built from hundreds of small letters in Inter, turning in depth with a soft glow.',
    category: 'graphic',
    featuredPreset: 'ink-paper',
    tuning: {
      amplitude: 4.8,
      brightness: 0.88,
      density: 1.28,
      detail: 5.2,
      frequency: 4.8,
      grain: 22,
      speed: 0.2,
      strength: 0.58,
    },
  },
];

/** The glyph:* entries by id, in the gallery's order. */
export const GLYPH_MATERIALS: Readonly<Record<string, GlyphEntry>> = Object.fromEntries(
  SPECS.map((spec) => {
    const entry = glyph(spec);
    return [entry.id, entry];
  }),
);
