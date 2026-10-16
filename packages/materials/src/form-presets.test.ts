// Paper's authored presets as form presets in the kit's colours (the Glyphfield port, wave 2.3):
// every bound material lists Paper's presets after its palette presets in Glyphfield's order, a
// form preset keeps Paper's shape and draws no colour the kit does not hold, and a kit change
// re colours it while the shape stays.
import { describe, expect, test } from 'vitest';

import { MATERIALS, entryWithPalette, requireMaterial } from './catalog.ts';
import { FORM_PRESETS } from './form-presets.ts';
import {
  GT_PALETTE,
  LEGACY_SHADER_PALETTE,
  PALETTE_PRESET_GROUNDS,
  shaderPaletteOf,
} from './presets.ts';
import type { ShaderPalette } from './presets.ts';
import { isColorString, resolveRecipe, splitColors } from './recipe.ts';

const forms = (id: string): string[] => (FORM_PRESETS[id] ?? []).map((form) => form.name);

/** Every colour a resolved preset draws, one hex per entry of a colour or colours uniform. */
function coloursOf(id: string, palette: ShaderPalette, preset: string): string[] {
  const entry = entryWithPalette(requireMaterial(id), palette);
  const uniforms = resolveRecipe(entry, { preset }).uniforms;
  return entry.uniforms
    .filter((spec) => spec.kind === 'color' || spec.kind === 'colors')
    .flatMap((spec) => splitColors(uniforms[spec.name] ?? ''));
}

describe('form presets', () => {
  test('every bound material lists Paper’s presets in Glyphfield’s order, the favourites first', () => {
    for (const id of Object.keys(MATERIALS)) expect(forms(id).length, id).toBeGreaterThan(0);
    expect(Object.values(FORM_PRESETS).flat()).toHaveLength(71);
    expect(forms('paper:warp')).toEqual(['live-ink', 'cauldron-pot', 'kelp', 'nectar', 'passion']);
    expect(forms('paper:god-rays')).toEqual(['ether', 'warp', 'linear']);
    expect(forms('paper:mesh-gradient')).toEqual(['purple', 'ink', 'beach']);
    expect(forms('paper:static-mesh-gradient')).toEqual(['sunset', '1960s', 'sea']);
    /* the recorded Noir and Fire stay; water keeps the one preset that draws light without a picture */
    expect(forms('paper:liquid-metal')).toEqual(['stripes', 'backdrop']);
    expect(forms('paper:gem-smoke')).toEqual(['fluorescent', 'infrared']);
    expect(forms('paper:water')).toEqual(['slow-motion']);
    for (const entry of Object.values(MATERIALS)) {
      const names = entry.presets.map((preset) => preset.name);
      expect(names.slice(-forms(entry.id).length), entry.id).toEqual(forms(entry.id));
      expect(new Set(names).size, entry.id).toBe(names.length);
    }
  });

  test('a form preset keeps Paper’s shape and carries no colour of its own', () => {
    for (const [id, list] of Object.entries(FORM_PRESETS)) {
      const entry = requireMaterial(id);
      for (const form of list) {
        for (const [name, value] of Object.entries(form.uniforms)) {
          const spec = entry.uniforms.find((candidate) => candidate.name === name);
          expect(spec, `${id} ${form.name} ${name}`).toBeDefined();
          expect(spec?.kind, `${id} ${form.name} ${name}`).not.toMatch(/^colou?rs?$/);
          expect(isColorString(value), `${id} ${form.name} ${name}`).toBe(false);
        }
        const resolved = resolveRecipe(entry, { preset: form.name }).uniforms;
        expect(resolved, `${id} ${form.name}`).toMatchObject(form.uniforms);
      }
    }
    expect(
      requireMaterial('paper:liquid-metal').presets.find((preset) => preset.name === 'stripes')
        ?.doc,
    ).toBe(
      'A form Paper made for this pattern, in your kit’s colours: the kit’s Text colour as the ground with light figures.',
    );
    expect(FORM_PRESETS['paper:warp']?.[1]?.uniforms).toMatchObject({
      u_shape: 'edge',
      u_softness: 1.5,
      u_swirlIterations: 7,
    });
  });

  test('every colour a form preset draws is one of the kit’s, in the legacy palette and on a kit', () => {
    const kit = shaderPaletteOf({
      colors: {
        light: {
          text: '#101820',
          background: '#fffdf5',
          primary: '#0b3d91',
          accent: '#ff7a00',
          caption: '#4a4f57',
          hint: '#9aa0a8',
        },
      },
    });
    for (const palette of [LEGACY_SHADER_PALETTE, kit]) {
      const allowed = new Set([...Object.values(palette), GT_PALETTE.transparent]);
      for (const [id, list] of Object.entries(FORM_PRESETS))
        for (const form of list)
          for (const colour of coloursOf(id, palette, form.name))
            expect(allowed.has(colour), `${id} ${form.name} ${colour}`).toBe(true);
    }
    /* the kit re colours a form preset and its shape holds */
    const legacy = resolveRecipe(requireMaterial('paper:warp'), { preset: 'live-ink' }).uniforms;
    const onKit = resolveRecipe(entryWithPalette(requireMaterial('paper:warp'), kit), {
      preset: 'live-ink',
    }).uniforms;
    expect(legacy.u_colors).toBe(`${GT_PALETTE.ink},${GT_PALETTE.titanium},${GT_PALETTE.paperInk}`);
    expect(onKit.u_colors).toBe('#101820,#9aa0a8,#fffdf5');
    expect(onKit.u_shapeScale).toBe(legacy.u_shapeScale);
    /* the palette presets are untouched: a deck stored before the forms resolves as it did */
    expect(PALETTE_PRESET_GROUNDS.map((row) => row.name)).toEqual(
      requireMaterial('paper:swirl')
        .presets.slice(0, 6)
        .map((preset) => preset.name),
    );
  });

  test('a colour no palette role names takes the ground’s second figure colour', () => {
    const neuro = resolveRecipe(requireMaterial('paper:neuro-noise'), { preset: 'sensation' });
    expect(neuro.uniforms.u_colorMid).toBe(GT_PALETTE.titanium);
    const grid = resolveRecipe(requireMaterial('paper:dot-grid'), { preset: 'triangles' });
    expect(grid.uniforms.u_colorStroke).toBe(GT_PALETTE.ink2);
    /* the palette presets keep the catalog's mid colour, so a stored deck's frame key holds */
    expect(
      resolveRecipe(requireMaterial('paper:neuro-noise'), { preset: 'ink-paper' }).uniforms
        .u_colorMid,
    ).toBe('#47a6ff');
  });
});
