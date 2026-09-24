// The eleven common controls (docs/FEATURES.md 5.2, 7.3): every catalog entry maps them onto
// uniforms inside their ranges; a preset's authored uniforms hold until a control moves; the
// record stores the controls and the resolved uniforms both (shaderBlockOf, shaderSetMutations);
// the kit palette feeds the presets and the frame key follows it (5.5, 5.7).
import { describe, expect, test } from 'vitest';

import { MATERIAL_CONTROL_NAMES } from '@turboslide/schema/blocks/material';
import type { MaterialControls } from '@turboslide/schema/blocks/material';
import { workedDocument } from '@turboslide/schema/fixtures';

import { shaderBlockOf, shaderSetMutations } from './actions.ts';
import { MATERIALS, entryWithPalette, requireMaterial } from './catalog.ts';
import {
  DEFAULT_CONTROLS,
  SHADER_CONTROLS,
  SHADER_CONTROL_BY_NAME,
  applyControls,
  controlApplies,
  controlMapOf,
  controlsAtDefault,
  scaleHexColor,
  uniformsWithControls,
} from './controls.ts';
import {
  LEGACY_SHADER_PALETTE,
  PALETTE_PRESET_GROUNDS,
  paletteValuesOf,
  shaderPaletteOf,
} from './presets.ts';
import { checkUniform, resolveRecipe } from './recipe.ts';
import { frameAssetId, frameKeyOf, frameSizeFor, materialAspectOf } from './recipe-key.ts';

const MOVED: Required<MaterialControls> = {
  strength: 1.6,
  detail: 7,
  frequency: 9,
  amplitude: 7.5,
  density: 1.9,
  brightness: 1.8,
  grain: 80,
  rotation: 200,
  centerX: 0.9,
  centerY: 0.1,
  speed: 1.5,
};

describe('the eleven controls', () => {
  test('are the eleven names in the section’s order with Glyphfield’s ranges and a sentence each', () => {
    expect(SHADER_CONTROLS.map((spec) => spec.name)).toEqual([...MATERIAL_CONTROL_NAMES]);
    for (const spec of SHADER_CONTROLS) {
      expect(spec.min).toBeLessThan(spec.max);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(spec.sentence.length).toBeGreaterThan(8);
      expect(spec.sentence).toMatch(/^[a-z]/);
    }
    expect(SHADER_CONTROL_BY_NAME.strength.sentence).toBe('how strong the effect is');
    expect(SHADER_CONTROL_BY_NAME.speed.sentence).toBe('how fast it plays in the show');
  });

  test('every catalog entry maps the controls onto uniforms inside their ranges', () => {
    for (const entry of Object.values(MATERIALS)) {
      const map = controlMapOf(entry);
      const names = new Set(entry.uniforms.map((spec) => spec.name));
      for (const name of MATERIAL_CONTROL_NAMES)
        for (const key of map[name])
          expect(names.has(key), `${entry.id} ${name} ${key}`).toBe(true);
      // Brightness reaches every entry: through u_brightness or through its colours
      expect(controlApplies(entry, 'brightness'), entry.id).toBe(true);
      expect(controlApplies(entry, 'speed')).toBe(true);
      for (const preset of entry.presets) {
        const base = resolveRecipe(entry, { preset: preset.name }).uniforms;
        for (const controls of [MOVED, { ...DEFAULT_CONTROLS, strength: 0, grain: 100 }]) {
          const moved = applyControls(entry, base, controls);
          for (const [key, value] of Object.entries(moved)) {
            const spec = entry.uniforms.find((candidate) => candidate.name === key);
            expect(spec, `${entry.id} ${key}`).toBeDefined();
            if (spec === undefined) continue;
            expect(checkUniform(spec, value), `${entry.id} ${preset.name} ${key}`).toBeUndefined();
          }
        }
      }
    }
  });

  test('a preset’s authored uniforms hold until a control moves', () => {
    const entry = requireMaterial('paper:liquid-metal');
    const base = resolveRecipe(entry, { preset: 'diamond' }).uniforms;
    expect(applyControls(entry, base, undefined)).toEqual({});
    expect(applyControls(entry, base, { ...DEFAULT_CONTROLS })).toEqual({});
    expect(uniformsWithControls(entry, base, { speed: 2 })).toEqual(base);
    expect(controlsAtDefault({ strength: 0.3, speed: 1 })).toBe(true);
    expect(controlsAtDefault({ strength: 0.31 })).toBe(false);
    const moved = applyControls(entry, base, { frequency: 9 });
    expect(Object.keys(moved).sort()).toEqual(['u_repetition']);
    expect(moved.u_repetition as number).toBeGreaterThan(base.u_repetition as number);
    const rotated = applyControls(entry, base, { rotation: 90, centerX: 1 });
    expect(rotated.u_rotation).toBe(90);
    expect(rotated.u_offsetX).toBe(1);
    // an integer group rounds and a colour scales for Brightness where no u_brightness exists
    const ring = requireMaterial('paper:smoke-ring');
    const ringBase = resolveRecipe(ring, { preset: 'ink-paper' }).uniforms;
    const detailed = applyControls(ring, ringBase, { detail: 0.5 });
    expect(Number.isInteger(detailed.u_noiseIterations)).toBe(true);
    const lit = applyControls(ring, ringBase, { brightness: 0.5 });
    expect(lit.u_colorBack).toBe(scaleHexColor(ringBase.u_colorBack as string, 0.5));
    expect(scaleHexColor('#ffffff', 0.5)).toBe('#808080');
    expect(scaleHexColor('#00000000', 2)).toBe('#00000000');
  });

  test('the record stores the controls and the resolved uniforms both', () => {
    const entry = requireMaterial('paper:liquid-metal');
    const block = shaderBlockOf('shader', entry, { controls: { strength: 1.5, speed: 1 } });
    expect(block.preset).toBe('diamond');
    expect(block.controls).toEqual({ strength: 1.5, speed: 1 });
    expect(block.motion).toEqual({ play: 'show' });
    expect(block.alt).toBe('The liquid metal shader');
    // liquid metal maps no strength key, so the uniforms stay the preset's; a mapped control writes them
    expect(block.uniforms).toBeUndefined();
    const bright = shaderBlockOf('shader', entry, { controls: { brightness: 0.5 } });
    expect(bright.uniforms).toMatchObject({ u_colorTint: '#808080' });
    const document = workedDocument();
    const slideId = Object.keys(document.slides)[0] ?? '';
    const mutations = shaderSetMutations(document.deck, slideId, bright, '/controls/frequency', 9);
    expect(mutations.map((m) => (m.op === 'block.set' ? m.path : m.op))).toEqual([
      '/controls',
      '/uniforms',
    ]);
    const controls = mutations[0];
    const uniforms = mutations[1];
    if (controls?.op !== 'block.set' || uniforms?.op !== 'block.set') throw new Error('shape');
    expect(controls.value).toEqual({ brightness: 0.5, frequency: 9 });
    expect(uniforms.value).toMatchObject({ u_colorTint: '#808080' });
    expect((uniforms.value as Record<string, unknown>).u_repetition).toBeDefined();
    const preset = shaderSetMutations(document.deck, slideId, bright, '/preset', 'sphere');
    expect(preset).toHaveLength(3);
    expect(preset.map((m) => (m.op === 'block.set' ? m.path : m.op))).toEqual([
      '/preset',
      '/controls',
      '/uniforms',
    ]);
    expect(() => shaderBlockOf('x', entry, { preset: 'nope' })).toThrow(RangeError);
  });
});

describe('the kit palette', () => {
  test('a deck without a kit reads today’s pixels and a kit’s colours feed the presets by role', () => {
    expect(shaderPaletteOf(undefined)).toBe(LEGACY_SHADER_PALETTE);
    expect(shaderPaletteOf({ colors: { light: {} } })).toBe(LEGACY_SHADER_PALETTE);
    const entry = requireMaterial('paper:gem-smoke');
    const legacy = resolveRecipe(entry, { preset: 'brand-blue' }).uniforms;
    expect(legacy.u_colorBack).toBe('#2f5ce0');
    expect(legacy.u_colors).toBe('#ffffff,#86a8ff');
    const kit = shaderPaletteOf({
      colors: { light: { primary: '#0b3d91', background: '#fffdf5', accent: '#ff7a00' } },
    });
    expect(kit.primary).toBe('#0b3d91');
    expect(kit.figure).toBe('#fffdf5');
    const withKit = entryWithPalette(entry, kit);
    const blue = resolveRecipe(withKit, { preset: 'brand-blue' }).uniforms;
    expect(blue.u_colorBack).toBe('#0b3d91');
    expect(blue.u_colors).toBe('#fffdf5,#ff7a00');
    expect(blue.u_shape).toBe(4);
    // the six palette presets, one ground per kit role, in the Colors row's order
    expect(PALETTE_PRESET_GROUNDS.map((row) => row.role)).toEqual([
      'text',
      'background',
      'primary',
      'accent',
      'caption',
      'hint',
    ]);
    expect(paletteValuesOf('paper-ink', kit)?.back).toBe('#fffdf5');
    expect(paletteValuesOf('hint')?.back).toBe(LEGACY_SHADER_PALETTE.hint);
    for (const material of Object.values(MATERIALS))
      for (const row of PALETTE_PRESET_GROUNDS)
        expect(
          material.presets.some((preset) => preset.name === row.name),
          material.id,
        ).toBe(true);
    // the words are the seller's: sentence case, no id
    for (const material of Object.values(MATERIALS))
      for (const preset of material.presets) expect(preset.label).toMatch(/^[A-Z][^_]*$/);
  });

  test('the frame key follows the kit, the anchor, the recipe and the aspect, and names the asset', () => {
    const block = {
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      pos: { x: 0, y: 0, w: 480, h: 272 },
    };
    const key = frameKeyOf(block);
    expect(key).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(frameKeyOf({ ...block })).toBe(key);
    expect(frameKeyOf({ ...block, anchor: 4000 })).not.toBe(key);
    expect(frameKeyOf({ ...block, uniforms: { u_scale: 0.7 } })).not.toBe(key);
    expect(frameKeyOf({ ...block, pos: { x: 0, y: 0, w: 600, h: 150 } })).not.toBe(key);
    // the same aspect at another pixel size is the same key
    expect(frameKeyOf({ ...block, pos: { x: 40, y: 40, w: 960, h: 544 } })).toBe(key);
    const kit = shaderPaletteOf({ colors: { light: { primary: '#0b3d91' } } });
    expect(frameKeyOf(block, kit)).not.toBe(key);
    expect(frameAssetId(key)).toMatch(/^frame-[0-9a-f]{16}$/);
    expect(materialAspectOf({})).toBeCloseTo(16 / 9);
    expect(frameSizeFor(16 / 9)).toEqual([3200, 1800]);
    expect(frameSizeFor(4)).toEqual([3200, 800]);
    expect(frameSizeFor(9 / 16)).toEqual([1800, 3200]);
  });
});
