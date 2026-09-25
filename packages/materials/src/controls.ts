// The eleven common controls of the Shader section (docs/FEATURES.md 5.2, 5.3; audit-shaders 5),
// ported from Glyphfield's one settings record (`glyphfield/src/lib/liveMaterials.ts`
// `LiveMaterialSettings`, `agentCatalog.ts` `AGENT_SHADER_LIBRARY.controls` for the published
// ranges, `paperShaderControls.ts` `paperControlOverrides` for the mapping onto each Paper family;
// MIT, copyright 2026 Kevin Liu, THIRD_PARTY_NOTICES.md). Glyphfield's three colours come from the
// brand kit's palette here (presets.ts, 5.7) and its three rotation axes are one axis for a flat
// shader, so eleven controls remain: Strength, Detail, Frequency, Amplitude, Density, Brightness,
// Grain, Rotation, Center X, Center Y and Speed.
//
// One mapping per catalog entry, computed from the entry's own uniform names in Glyphfield's
// manner: Strength scales intensity, contrast, bloom and glow; Detail scales iterations, octaves,
// counts and steps as integers; Frequency scales frequency, repetition, noise scale, gaps and
// stroke; Amplitude scales amplitude, radius, size, thickness, distortion and swirl; Density
// scales density, proportion, softness and noise; Brightness and Grain map to brightness,
// grainMixer and grainOverlay (Brightness scales the entry's colour uniforms when it has no
// brightness uniform, so the control moves every shader); Rotation and Center add to u_rotation,
// u_offsetX and u_offsetY; Speed sets the mount's speed and is no uniform. A control at its
// default moves nothing (the factor is 1), so a preset keeps its authored uniforms until a control
// moves, and every mapped value is clamped to the uniform's published range. Browser safe.
import type {
  MaterialControlName,
  MaterialControls,
  MaterialUniformSpec,
  MaterialUniformValue,
  MaterialUniforms,
} from '@turboslide/schema/blocks/material';
import { MATERIAL_CONTROL_NAMES } from '@turboslide/schema/blocks/material';

import type { MaterialEntry } from './catalog.ts';
import { isColorString, splitColors } from './recipe.ts';

export type ShaderControlSpec = {
  name: MaterialControlName;
  /** The word the seller reads. */
  label: string;
  /** The one sentence of the tooltip (docs/FEATURES.md 5.3). */
  sentence: string;
  /** The group the Shader section draws it in (Glyphfield's names). */
  group: 'Form' | 'Light and texture' | 'Orientation' | 'Motion';
  default: number;
  min: number;
  max: number;
  step: number;
};

/** The eleven controls in the Shader section's order, with Glyphfield's published ranges (`agentCatalog.ts`). */
export const SHADER_CONTROLS: ReadonlyArray<ShaderControlSpec> = [
  {
    name: 'strength',
    label: 'Strength',
    sentence: 'how strong the effect is',
    group: 'Form',
    default: 0.3,
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    name: 'detail',
    label: 'Detail',
    sentence: 'how fine the pattern is',
    group: 'Form',
    default: 3.2,
    min: 0.5,
    max: 8,
    step: 0.1,
  },
  {
    name: 'frequency',
    label: 'Frequency',
    sentence: 'how many repeats fit across the box',
    group: 'Form',
    default: 5.5,
    min: 0.2,
    max: 10,
    step: 0.1,
  },
  {
    name: 'amplitude',
    label: 'Amplitude',
    sentence: 'how far the pattern moves from rest',
    group: 'Form',
    default: 3.2,
    min: 0,
    max: 8,
    step: 0.1,
  },
  {
    name: 'density',
    label: 'Density',
    sentence: 'how much of the box the pattern fills',
    group: 'Form',
    default: 0.8,
    min: 0.1,
    max: 2,
    step: 0.05,
  },
  {
    name: 'brightness',
    label: 'Brightness',
    sentence: 'how light the whole shader is',
    group: 'Light and texture',
    default: 1,
    min: 0.1,
    max: 2,
    step: 0.05,
  },
  {
    name: 'grain',
    label: 'Grain',
    sentence: 'how much film grain is mixed in',
    group: 'Light and texture',
    default: 0,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    name: 'rotation',
    label: 'Rotation',
    sentence: 'the angle of the pattern',
    group: 'Orientation',
    default: 0,
    min: 0,
    max: 360,
    step: 1,
  },
  {
    name: 'centerX',
    label: 'Center X',
    sentence: "where the pattern's middle sits",
    group: 'Orientation',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'centerY',
    label: 'Center Y',
    sentence: "where the pattern's middle sits",
    group: 'Orientation',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    name: 'speed',
    label: 'Speed',
    sentence: 'how fast it plays in the show',
    group: 'Motion',
    default: 1,
    min: 0,
    max: 2,
    step: 0.05,
  },
];

export const SHADER_CONTROL_BY_NAME: Readonly<Record<MaterialControlName, ShaderControlSpec>> =
  Object.fromEntries(SHADER_CONTROLS.map((spec) => [spec.name, spec])) as Record<
    MaterialControlName,
    ShaderControlSpec
  >;

/** Every control at its default: the record a fresh block reads. */
export const DEFAULT_CONTROLS: Readonly<Required<MaterialControls>> = Object.fromEntries(
  SHADER_CONTROLS.map((spec) => [spec.name, spec.default]),
) as Required<MaterialControls>;

/** The block's controls with every absent one at its default. */
export function controlsWithDefaults(
  controls: MaterialControls | undefined,
): Required<MaterialControls> {
  const out = { ...DEFAULT_CONTROLS };
  if (controls === undefined) return out;
  for (const name of MATERIAL_CONTROL_NAMES) {
    const value = controls[name];
    if (typeof value === 'number' && Number.isFinite(value)) out[name] = clampControl(name, value);
  }
  return out;
}

/** A control value inside its published range, snapped to its step. */
export function clampControl(name: MaterialControlName, value: number): number {
  const spec = SHADER_CONTROL_BY_NAME[name];
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const decimals = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;
  return Number(clamped.toFixed(decimals));
}

/** True when the record moves nothing: every control absent or at its default. */
export function controlsAtDefault(controls: MaterialControls | undefined): boolean {
  if (controls === undefined) return true;
  return MATERIAL_CONTROL_NAMES.every(
    (name) => controls[name] === undefined || controls[name] === DEFAULT_CONTROLS[name],
  );
}

// ---------------------------------------------------------------------------------------------
// The mapping onto the uniforms

/** Glyphfield's scaling groups, by the Paper uniform's name without its `u_` prefix. */
const STRENGTH_KEYS = [
  'intensity',
  'contrast',
  'bloom',
  'outerGlow',
  'innerGlow',
  'highlights',
  'glow',
  'midIntensity',
] as const;
const DETAIL_KEYS = [
  'noiseIterations',
  'octaveCount',
  'foldCount',
  'count',
  'bandCount',
  'stepsPerColor',
  'layering',
  'edges',
] as const;
const FREQUENCY_KEYS = [
  'frequency',
  'noiseFrequency',
  'noiseScale',
  'repetition',
  'spots',
  'gapX',
  'gapY',
  'strokeWidth',
  'distortionFreq',
  'spacing',
] as const;
const AMPLITUDE_KEYS = [
  'amplitude',
  'waves',
  'waveX',
  'waveY',
  'thickness',
  'radius',
  'size',
  'distortion',
  /* liquid metal's distortion along the shape's edge (the fix round of ship two): its only other
     amplitude key, u_distortion, moves the box under a tenth of a percent at rest, so Amplitude
     read as no change on the featured entry (shaders.panel.slider-live-undo) */
  'contour',
  'swirl',
  'stretch',
  'dotSize',
  'midSize',
] as const;
const DENSITY_KEYS = [
  'density',
  'proportion',
  'spreading',
  'softness',
  'spotty',
  'smoke',
  'noise',
  'roughness',
  'fiber',
  'crumples',
  'folds',
  'mixing',
] as const;
const GRAIN_KEYS = ['grainMixer', 'grainOverlay'] as const;

/** Glyphfield's `controlFactor`: 1 at the default, bounded per group. */
export function controlFactor(
  value: number,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, 0.4 + (value / defaultValue) * 0.6));
}

/** Glyphfield's `scaleNumericControls`: a zero value moves off zero by the factor's excess over one. */
function scaled(original: number, factor: number, zeroSpan: number, integer: boolean): number {
  const value =
    original === 0 ? Math.max(0, (factor - 1) * zeroSpan) : Math.max(0, original * factor);
  return integer ? Math.max(1, Math.round(value)) : value;
}

function clampToSpec(spec: MaterialUniformSpec, value: number): number {
  let out = value;
  if (spec.min !== undefined) out = Math.max(spec.min, out);
  if (spec.max !== undefined) out = Math.min(spec.max, out);
  if (spec.kind === 'int') out = Math.round(out);
  return Number(out.toFixed(4));
}

function numberOf(value: MaterialUniformValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The uniform names of an entry a control moves, by control. */
export type ControlMap = Readonly<Record<MaterialControlName, ReadonlyArray<string>>>;

function keysOf(entry: MaterialEntry, group: ReadonlyArray<string>): string[] {
  const names = new Set(entry.uniforms.map((spec) => spec.name));
  return group.map((key) => `u_${key}`).filter((name) => names.has(name));
}

/**
 * The mapping of the eleven controls onto one entry's uniforms (docs/FEATURES.md 5.2). Brightness
 * names the entry's colour uniforms when it has no `u_brightness`, so the control has an effect on
 * every shader; Speed maps to no uniform (the mount's speed).
 */
export function controlMapOf(entry: MaterialEntry): ControlMap {
  const names = new Set(entry.uniforms.map((spec) => spec.name));
  const colours = entry.uniforms
    .filter((spec) => spec.kind === 'color' || spec.kind === 'colors')
    .map((spec) => spec.name);
  return {
    strength: keysOf(entry, STRENGTH_KEYS),
    detail: keysOf(entry, DETAIL_KEYS),
    frequency: keysOf(entry, FREQUENCY_KEYS),
    amplitude: keysOf(entry, AMPLITUDE_KEYS),
    density: keysOf(entry, DENSITY_KEYS),
    brightness: names.has('u_brightness') ? ['u_brightness'] : colours,
    grain: keysOf(entry, GRAIN_KEYS),
    rotation: names.has('u_rotation') ? ['u_rotation'] : [],
    centerX: names.has('u_offsetX') ? ['u_offsetX'] : [],
    centerY: names.has('u_offsetY') ? ['u_offsetY'] : [],
    speed: [],
  };
}

/** True when moving the control changes something for this entry (Speed always: the mount reads it). */
export function controlApplies(entry: MaterialEntry, name: MaterialControlName): boolean {
  return name === 'speed' || controlMapOf(entry)[name].length > 0;
}

/** A hex colour lightened or darkened by a factor: each channel scaled and clamped, the alpha kept. */
export function scaleHexColor(hex: string, factor: number): string {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (match === null) return hex;
  const rgb = match[1] ?? '000000';
  const alpha = match[2] ?? '';
  let out = '#';
  for (let i = 0; i < 3; i += 1) {
    const channel = parseInt(rgb.slice(i * 2, i * 2 + 2), 16);
    const next = Math.min(255, Math.max(0, Math.round(channel * factor)));
    out += next.toString(16).padStart(2, '0');
  }
  return `${out}${alpha}`.toLowerCase();
}

function scaleColourUniform(value: MaterialUniformValue, factor: number): MaterialUniformValue {
  if (typeof value === 'string') {
    const parts = splitColors(value);
    if (parts.length > 1) return parts.map((part) => scaleHexColor(part, factor)).join(',');
    return isColorString(value) ? scaleHexColor(value, factor) : value;
  }
  if (Array.isArray(value)) {
    return value.map((n, i) => (i % 4 === 3 ? n : Math.min(1, Math.max(0, n * factor))));
  }
  return value;
}

/**
 * The uniforms the controls move over a base record (the preset's authored uniforms with the
 * defaults under them): the mapped keys alone, every value inside its spec's range. A record with
 * every control at its default is the empty record, so `{ ...base, ...applyControls(...) }` is
 * the base itself and a preset's look holds until a control moves.
 */
export function applyControls(
  entry: MaterialEntry,
  base: MaterialUniforms,
  controls: MaterialControls | undefined,
): MaterialUniforms {
  const values = controlsWithDefaults(controls);
  const map = controlMapOf(entry);
  const specs = new Map(entry.uniforms.map((spec) => [spec.name, spec]));
  const out: MaterialUniforms = {};
  const scaleGroup = (
    name: MaterialControlName,
    factor: number,
    zeroSpan: number,
    integer = false,
  ) => {
    if (values[name] === DEFAULT_CONTROLS[name]) return;
    for (const key of map[name]) {
      const spec = specs.get(key);
      if (spec === undefined) continue;
      const original = numberOf(base[key], typeof spec.default === 'number' ? spec.default : 0);
      out[key] = clampToSpec(
        spec,
        scaled(original, factor, zeroSpan, integer || spec.kind === 'int'),
      );
    }
  };
  scaleGroup('strength', controlFactor(values.strength, 0.3, 0.35, 3.4), 0.35);
  scaleGroup('detail', controlFactor(values.detail, 3.2, 0.35, 2.5), 2, true);
  scaleGroup('frequency', controlFactor(values.frequency, 5.5, 0.3, 2.3), 1.5);
  scaleGroup('amplitude', controlFactor(values.amplitude, 3.2, 0.3, 2.4), 0.3);
  scaleGroup('density', controlFactor(values.density, 0.8, 0.35, 2.2), 0.25);

  if (values.brightness !== DEFAULT_CONTROLS.brightness) {
    for (const key of map.brightness) {
      const spec = specs.get(key);
      if (spec === undefined) continue;
      if (key === 'u_brightness') {
        const original = numberOf(base[key], typeof spec.default === 'number' ? spec.default : 1);
        out[key] = clampToSpec(spec, original * values.brightness);
      } else {
        out[key] = scaleColourUniform(base[key] ?? spec.default, values.brightness);
      }
    }
  }
  if (values.grain !== DEFAULT_CONTROLS.grain) {
    const amount = Math.min(1, Math.max(0, values.grain / 100));
    for (const key of map.grain) {
      const spec = specs.get(key);
      if (spec !== undefined) out[key] = clampToSpec(spec, amount);
    }
  }
  if (values.rotation !== DEFAULT_CONTROLS.rotation) {
    for (const key of map.rotation) {
      const spec = specs.get(key);
      if (spec === undefined) continue;
      const original = numberOf(base[key], 0);
      out[key] = clampToSpec(spec, (((original + values.rotation) % 360) + 360) % 360);
    }
  }
  const centre = (name: 'centerX' | 'centerY') => {
    if (values[name] === DEFAULT_CONTROLS[name]) return;
    for (const key of map[name]) {
      const spec = specs.get(key);
      if (spec === undefined) continue;
      const original = numberOf(base[key], 0);
      out[key] = clampToSpec(spec, original + (values[name] * 2 - 1));
    }
  };
  centre('centerX');
  centre('centerY');
  return out;
}

/** The uniform record a block stores beside its controls: the base with the mapped keys over it. */
export function uniformsWithControls(
  entry: MaterialEntry,
  base: MaterialUniforms,
  controls: MaterialControls | undefined,
): MaterialUniforms {
  return { ...base, ...applyControls(entry, base, controls) };
}

/** The playback speed the editor's mount and the show read (the Speed control; 1 when absent). */
export function speedOf(controls: MaterialControls | undefined): number {
  return controlsWithDefaults(controls).speed;
}
