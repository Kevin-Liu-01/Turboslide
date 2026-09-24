// The palette presets (SPEC 5.4 "brand palette presets"; MILESTONES M5 item 3; the features
// round's ship two, docs/FEATURES.md 5.7). Every entry gets six palette presets, one per role of
// the brand kit taken as the ground: `paper-ink` (the Background ground with Text figures, "Ink on
// paper", the light twin's look), `ink-paper` (the Text ground with light figures, "Paper on ink",
// the dark twin's look), `brand-blue` (the Primary ground, "Primary", the polarity of the Blog and
// content opener), `accent`, `caption` and `hint`. The colours are computed from the deck's kit at
// render time (`shaderPaletteOf`): Background to the catalog's `back` role, Text to `front`,
// Primary and Accent to `colors`, Captions to `inner`, and a `brand.set /colors/*` re keys every
// frame (recipe-key.ts). A deck without a kit record reads `LEGACY_SHADER_PALETTE`, the deck's
// tokens exactly as the M5 presets hard coded them (`GT_PALETTE`), so every pixel production
// draws today holds on such a deck. The two materials the brand deck uses carry their recorded
// recipes as named presets besides: the liquid metal `diamond` and `sphere` of the Prototemplate
// and Glyphfield opener (OPENERS.md, variant lm-gem-c5) and the gem smoke `brand-blue` and `fire`
// of the two color openers, plus Paper's own defaults for reference. Presets read in sentence case
// by role, never by General Translation's colours (audit-shaders 13). Colors are hex strings in the
// recipe; a colors list is one comma-separated string. Browser safe.
import type { MaterialPreset, MaterialUniforms } from '@turboslide/schema/blocks/material';
import type { BrandKit, KitAppearance, KitColor } from '@turboslide/schema/brand';
import type { Deck } from '@turboslide/schema/deck';
import { deckAppearance } from '@turboslide/schema/deck';

/** The deck's tokens (packages/theme tokens.ts) the legacy presets draw from. */
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

/**
 * The six kit colours a shader draws from (docs/FEATURES.md 5.7), plus `figure`, the light colour
 * the figures take on a dark ground: the dark theme's paper on the legacy palette, the kit's
 * Background on a kit. The seven values are what the frame key hashes.
 */
export type ShaderPalette = Readonly<Record<KitColor, string>> & { readonly figure: string };

/** The palette of a deck without a kit record: today's pixels exactly (GT_PALETTE). */
export const LEGACY_SHADER_PALETTE: ShaderPalette = {
  text: GT_PALETTE.ink,
  background: GT_PALETTE.paper,
  caption: GT_PALETTE.ink2,
  hint: GT_PALETTE.titanium,
  primary: GT_PALETTE.blue,
  accent: GT_PALETTE.blueLight,
  figure: GT_PALETTE.paperInk,
};

/**
 * The palette a deck's kit gives a shader: the role's hex where the kit sets one, the legacy value
 * where it is silent, in the appearance named (the deck's, else light). A kit that sets any colour
 * moves the figure colour to its Background, so a dark ground on a kit shows the kit's paper.
 */
export function shaderPaletteOf(
  kit: BrandKit | undefined,
  appearance: KitAppearance = 'light',
): ShaderPalette {
  const colors = kit?.colors?.[appearance];
  if (colors === undefined || Object.keys(colors).length === 0) return LEGACY_SHADER_PALETTE;
  const pick = (role: KitColor): string =>
    (colors[role] ?? LEGACY_SHADER_PALETTE[role]).toLowerCase();
  const background = pick('background');
  return {
    text: pick('text'),
    background,
    caption: pick('caption'),
    hint: pick('hint'),
    primary: pick('primary'),
    accent: pick('accent'),
    figure: background,
  };
}

/** The deck's shader palette (5.7): the kit's colours in the appearance the deck opens in. */
export function shaderPaletteOfDeck(deck: Pick<Deck, 'brand' | 'defaults'>): ShaderPalette {
  return shaderPaletteOf(deck.brand, deckAppearance(deck as Deck));
}

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

/** The kit role each palette preset takes as its ground, in the tiles' order (the M5 three first). */
export const PALETTE_PRESET_GROUNDS: ReadonlyArray<{
  name: string;
  role: KitColor;
  label: string;
  doc: string;
}> = [
  {
    name: 'ink-paper',
    role: 'text',
    label: 'Paper on ink',
    doc: 'The kit’s Text colour as the ground with light figures: the look of the dark twin, the ground the opener plate sits on.',
  },
  {
    name: 'paper-ink',
    role: 'background',
    label: 'Ink on paper',
    doc: 'The kit’s Background as the ground with Text figures: the light twin’s look.',
  },
  {
    name: 'brand-blue',
    role: 'primary',
    label: 'Primary',
    doc: 'The kit’s Primary as the ground with light figures: the polarity of the GT open source cover and the Blog opener.',
  },
  {
    name: 'accent',
    role: 'accent',
    label: 'Accent',
    doc: 'The kit’s Accent as the ground with light figures.',
  },
  {
    name: 'caption',
    role: 'caption',
    label: 'Captions',
    doc: 'The kit’s Captions colour as the ground with light figures.',
  },
  {
    name: 'hint',
    role: 'hint',
    label: 'Hints',
    doc: 'The kit’s Hints colour as the ground with Text figures.',
  },
];

/** The palette preset whose ground is a kit role, or the role's preset name. */
export function palettePresetOfRole(role: KitColor): string {
  return PALETTE_PRESET_GROUNDS.find((row) => row.role === role)?.name ?? 'ink-paper';
}

/** The kit role a palette preset takes as its ground; undefined for an entry's own preset. */
export function groundRoleOfPreset(name: string | undefined): KitColor | undefined {
  return PALETTE_PRESET_GROUNDS.find((row) => row.name === name)?.role;
}

/** The colour values of one palette preset over a shader palette (5.7): the ground, the figure, the two colours and the inner fill. */
export function paletteValuesOf(
  name: string,
  values: ShaderPalette = LEGACY_SHADER_PALETTE,
): { back: string; front: string; colors: string; inner: string } | undefined {
  const inner = GT_PALETTE.transparent;
  switch (name) {
    case 'paper-ink':
      return {
        back: values.background,
        front: values.text,
        colors: `${values.text},${values.caption}`,
        inner,
      };
    case 'ink-paper':
      return {
        back: values.text,
        front: values.figure,
        colors: `${values.figure},${values.hint}`,
        inner,
      };
    case 'brand-blue':
      return {
        back: values.primary,
        front: values.background,
        colors: `${values.background},${values.accent}`,
        inner,
      };
    case 'accent':
      return {
        back: values.accent,
        front: values.background,
        colors: `${values.background},${values.primary}`,
        inner,
      };
    case 'caption':
      return {
        back: values.caption,
        front: values.figure,
        colors: `${values.figure},${values.hint}`,
        inner,
      };
    case 'hint':
      return {
        back: values.hint,
        front: values.text,
        colors: `${values.text},${values.background}`,
        inner,
      };
    default:
      return undefined;
  }
}

/** The six palette presets of an entry from its palette roles, over a shader palette (the legacy one by default). */
export function palettePresets(
  roles: PaletteRoles,
  values: ShaderPalette = LEGACY_SHADER_PALETTE,
): MaterialPreset[] {
  return PALETTE_PRESET_GROUNDS.map((row) => {
    const colours = paletteValuesOf(row.name, values);
    return {
      name: row.name,
      label: row.label,
      doc: row.doc,
      uniforms: palette(
        roles,
        colours ?? {
          back: values.background,
          front: values.text,
          colors: values.text,
          inner: GT_PALETTE.transparent,
        },
      ),
    };
  });
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

/** Presets beyond the palette presets, per material id; the labels are the seller's (sentence case, no ids). */
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
      label: 'Chrome',
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
      label: 'Noir',
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
      label: 'Primary',
      doc: 'The Blog and content opener: light smoke over the Primary ground, the Default geometry on the metaballs shape (OPENERS.md).',
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
      label: 'Warm paper',
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

/**
 * A recorded preset whose palette uniforms follow the kit (docs/FEATURES.md 5.7): the gem smoke
 * `brand-blue` keeps its geometry and takes the Primary ground and the Background and Accent
 * smoke from the palette handed in, so a kit change re colours the opener's recipe too.
 */
function withKit(
  materialId: string,
  preset: MaterialPreset,
  values: ShaderPalette,
): MaterialPreset {
  if (materialId === 'paper:gem-smoke' && preset.name === 'brand-blue') {
    const colours = paletteValuesOf('brand-blue', values);
    if (colours === undefined) return preset;
    return {
      ...preset,
      uniforms: { ...preset.uniforms, u_colorBack: colours.back, u_colors: colours.colors },
    };
  }
  return preset;
}

/**
 * The palette presets, then the entry's own; an own preset replaces a palette preset of the same
 * name and keeps its place at the front so the tiles read the same. `values` is the deck's shader
 * palette (5.7); the legacy palette without one.
 */
export function presetsFor(
  materialId: string,
  roles: PaletteRoles,
  values: ShaderPalette = LEGACY_SHADER_PALETTE,
): MaterialPreset[] {
  const own = (EXTRA_PRESETS[materialId] ?? []).map((preset) =>
    withKit(materialId, preset, values),
  );
  const ownNames = new Set(own.map((preset) => preset.name));
  const base = palettePresets(roles, values).filter((preset) => !ownNames.has(preset.name));
  const replaced = palettePresets(roles, values)
    .map((preset) => own.find((candidate) => candidate.name === preset.name))
    .filter((preset): preset is MaterialPreset => preset !== undefined);
  const rest = own.filter((preset) => !replaced.includes(preset));
  return [...replaced, ...base, ...rest];
}
