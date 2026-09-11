// The GT palette presets (SPEC 5.4 "brand palette presets"; MILESTONES M5 item 3). Every entry
// gets three presets built from its palette roles: `ink-paper` (the ink ground with paper
// figures, the dark twin's look), `paper-ink` (the inverse) and `brand-blue` (the accent on
// light from the Color slide, the ground of the Blog and content opener). The two materials the
// deck uses carry their recorded recipes as named presets besides: the liquid metal `diamond`
// and `sphere` of the Prototemplate and Glyphfield opener (OPENERS.md, variant lm-gem-c5) and
// the gem smoke `brand-blue` and `fire` of the two color openers, plus Paper's own defaults for
// reference. Colors are hex strings in the recipe (Asset.source.uniforms takes strings); a
// colors list is one comma-separated string.
import type { MaterialPreset, MaterialUniforms } from '@turboslide/schema/blocks/material';

/** The deck's tokens (packages/theme tokens.ts) the presets draw from. */
export const GT_PALETTE = {
  ink: '#070707',
  paper: '#ffffff',
  /** The ink of the dark theme, the paper of the dark twin. */
  paperInk: '#f2f2f0',
  titanium: '#8a8f98',
  ink2: '#3a3d44',
  /** The accent on light (the Color slide), the ground of the Blog opener (OPENERS.md). */
  blue: '#2f5ce0',
  /** The smoke highlight over the blue ground (OPENERS.md, Blog and content). */
  blueLight: '#86a8ff',
  transparent: '#00000000',
} as const;

/** Which uniforms of an entry play the ground, the figure, the color list and the inner fill. */
export type PaletteRoles = {
  back?: string;
  front?: string;
  colors?: string;
  inner?: string;
};

function palette(
  roles: PaletteRoles,
  values: { back: string; front: string; colors: string; inner: string },
): MaterialUniforms {
  const out: MaterialUniforms = {};
  if (roles.back !== undefined) out[roles.back] = values.back;
  if (roles.front !== undefined) out[roles.front] = values.front;
  if (roles.colors !== undefined) out[roles.colors] = values.colors;
  if (roles.inner !== undefined) out[roles.inner] = values.inner;
  return out;
}

/** The three GT presets of an entry from its palette roles. */
export function palettePresets(roles: PaletteRoles): MaterialPreset[] {
  const { ink, paper, paperInk, titanium, ink2, blue, blueLight, transparent } = GT_PALETTE;
  return [
    {
      name: 'ink-paper',
      label: 'Ink and paper',
      doc: 'The ink ground with paper figures: the look of the dark twin, the ground the opener plate sits on.',
      uniforms: palette(roles, {
        back: ink,
        front: paperInk,
        colors: `${paperInk},${titanium}`,
        inner: transparent,
      }),
    },
    {
      name: 'paper-ink',
      label: 'Paper and ink',
      doc: 'The paper ground with ink figures: the light twin’s look.',
      uniforms: palette(roles, {
        back: paper,
        front: ink,
        colors: `${ink},${ink2}`,
        inner: transparent,
      }),
    },
    {
      name: 'brand-blue',
      label: 'Brand blue',
      doc: 'White figures over the accent blue (#2f5ce0), the polarity of the GT open-source cover and the Blog opener.',
      uniforms: palette(roles, {
        back: blue,
        front: paper,
        colors: `${paper},${blueLight}`,
        inner: transparent,
      }),
    },
  ];
}

/** The recorded liquid metal recipe of the Prototemplate and Glyphfield opener (OPENERS.md, lm-gem-c5). */
const LIQUID_METAL_DECK: MaterialUniforms = {
  u_colorBack: '#000000',
  u_colorTint: '#ffffff',
  u_softness: 0.05,
  u_shiftRed: 0,
  u_shiftBlue: 0,
  u_contour: 0.6,
  u_repetition: 3,
  u_distortion: 0.07,
  u_angle: 70,
  u_offsetX: 0,
  u_offsetY: 0,
  u_scale: 0.5,
};

/** The gem smoke geometry the two color openers share (OPENERS.md: the Default preset, shape metaballs). */
const GEM_SMOKE_DECK: MaterialUniforms = {
  u_outerGlow: 0.55,
  u_innerGlow: 1,
  u_innerDistortion: 0.8,
  u_outerDistortion: 0.6,
  u_offset: 0,
  u_angle: 0,
  u_size: 0.8,
  u_shape: 4,
  u_scale: 0.6,
};

/** Presets beyond the three palette presets, per material id. */
export const EXTRA_PRESETS: Readonly<Record<string, MaterialPreset[]>> = {
  'paper:liquid-metal': [
    {
      name: 'diamond',
      label: 'Diamond',
      doc: 'The Prototemplate and Glyphfield opener: white chrome on black, the rotated square with two contour bands (OPENERS.md, lm-gem-c5).',
      uniforms: { ...LIQUID_METAL_DECK, u_shape: 3 },
    },
    {
      name: 'sphere',
      label: 'Sphere',
      doc: 'The same recipe on the circle, the round ten runner-up with a crisp rim.',
      uniforms: { ...LIQUID_METAL_DECK, u_shape: 1 },
    },
    {
      name: 'chrome',
      label: 'Chrome (Paper default)',
      doc: 'Paper’s Default preset: grey ground, red and blue dispersion, the diamond.',
      uniforms: {
        u_colorBack: '#aaaaac',
        u_colorTint: '#ffffff',
        u_distortion: 0.07,
        u_repetition: 2,
        u_shiftRed: 0.3,
        u_shiftBlue: 0.3,
        u_contour: 0.4,
        u_softness: 0.1,
        u_angle: 70,
        u_shape: 3,
        u_scale: 0.6,
      },
    },
    {
      name: 'noir',
      label: 'Noir (Paper)',
      doc: 'Paper’s Noir preset: black ground, grey tint, soft bands, no dispersion.',
      uniforms: {
        u_colorBack: '#000000',
        u_colorTint: '#606060',
        u_softness: 0.45,
        u_repetition: 1.5,
        u_shiftRed: 0,
        u_shiftBlue: 0,
        u_distortion: 0,
        u_contour: 0,
        u_angle: 90,
        u_shape: 3,
        u_scale: 0.6,
      },
    },
  ],
  'paper:gem-smoke': [
    {
      name: 'brand-blue',
      label: 'Brand blue',
      doc: 'The Blog and content opener: white smoke over the accent blue, the Default geometry on the metaballs shape (OPENERS.md).',
      uniforms: {
        ...GEM_SMOKE_DECK,
        u_colorBack: GT_PALETTE.blue,
        u_colors: `${GT_PALETTE.paper},${GT_PALETTE.blueLight}`,
        u_colorInner: GT_PALETTE.transparent,
      },
    },
    {
      name: 'fire',
      label: 'Fire',
      doc: 'The Developer experience opener: Paper’s Fire colors on the ink ground, the inner fill transparent (OPENERS.md).',
      uniforms: {
        ...GEM_SMOKE_DECK,
        u_colorBack: '#000000',
        u_colors: '#fe5b16,#f7ff61,#ffffff',
        u_colorInner: GT_PALETTE.transparent,
        u_outerGlow: 1,
        u_innerGlow: 0.65,
        u_innerDistortion: 0.6,
        u_outerDistortion: 0.8,
      },
    },
    {
      name: 'default',
      label: 'Default (Paper)',
      doc: 'Paper’s Default preset: dark smoke over warm paper on the diamond shape.',
      uniforms: {
        ...GEM_SMOKE_DECK,
        u_colorBack: '#f0efea',
        u_colorInner: '#fafaf5',
        u_colors: '#333333,#e7e6df',
        u_shape: 3,
      },
    },
  ],
};

/** The palette presets, then the entry's own; an own preset replaces a palette preset of the same name. */
export function presetsFor(materialId: string, roles: PaletteRoles): MaterialPreset[] {
  const own = EXTRA_PRESETS[materialId] ?? [];
  const ownNames = new Set(own.map((preset) => preset.name));
  const base = palettePresets(roles).filter((preset) => !ownNames.has(preset.name));
  // a replaced palette preset keeps its place at the front so the inspector's list reads the same
  const replaced = palettePresets(roles)
    .map((preset) => own.find((candidate) => candidate.name === preset.name))
    .filter((preset): preset is MaterialPreset => preset !== undefined);
  const rest = own.filter((preset) => !replaced.includes(preset));
  return [...replaced, ...base, ...rest];
}
