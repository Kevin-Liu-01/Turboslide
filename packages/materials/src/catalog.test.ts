// The catalog, the presets, recipe resolution and the recipe key (SPEC 5.4; MILESTONES M5 item 3).
// The key test reproduces the two digests deck.json records for the imported material openers
// (opener-prototemplate, opener-blog), so a key computed here is the importer's key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { materialCatalogEntrySchema } from '@turboslide/schema/blocks/material';
import type { Asset } from '@turboslide/schema/assets';

import { MATERIALS, MATERIAL_IDS, listMaterials, requireMaterial } from './catalog.ts';
import { fragmentShaderFor, toShaderUniforms, toVec4, toVec4List } from './paper.ts';
import { GT_PALETTE } from './presets.ts';
import { PROTO_MATERIALS } from './proto.ts';
import { checkUniform, materialSlug, resolveRecipe, validateUniforms } from './recipe.ts';
import { recipeKey } from './recipe-key.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');

describe('the catalog', () => {
  test('every entry parses as the schema entry, has a shader and every preset validates', () => {
    expect(MATERIAL_IDS.length).toBeGreaterThanOrEqual(17);
    for (const entry of Object.values(MATERIALS)) {
      expect(materialCatalogEntrySchema.safeParse(listMaterials(entry.id)[0]).success).toBe(true);
      expect(fragmentShaderFor(entry)).toMatch(/^#version 300 es/);
      const names = new Set(entry.uniforms.map((spec) => spec.name));
      expect(names.size).toBe(entry.uniforms.length);
      for (const spec of entry.uniforms)
        expect(checkUniform(spec, spec.default), `${entry.id} ${spec.name}`).toBeUndefined();
      for (const preset of entry.presets) {
        const issues = validateUniforms(entry, preset.uniforms).filter(
          (i) => i.code !== 'unknown_uniform',
        );
        expect(issues, `${entry.id} ${preset.name}`).toEqual([]);
        const resolved = resolveRecipe(entry, { preset: preset.name });
        expect(Object.keys(resolved.uniforms).slice(0, entry.uniforms.length)).toEqual(
          entry.uniforms.map((spec) => spec.name),
        );
        const shader = toShaderUniforms(entry, resolved.uniforms);
        for (const spec of entry.uniforms)
          expect(shader[spec.name], `${entry.id} ${preset.name} ${spec.name}`).toBeDefined();
      }
      expect(entry.presets.map((p) => p.name)).toEqual(
        expect.arrayContaining(['ink-paper', 'paper-ink', 'brand-blue']),
      );
    }
  });

  test('lists the proto engines as unavailable and refuses to capture them', () => {
    const listed = listMaterials();
    expect(listed.filter((entry) => entry.family === 'proto')).toHaveLength(PROTO_MATERIALS.length);
    expect(listed.every((entry) => entry.family === 'paper' || entry.available === false)).toBe(
      true,
    );
    expect(() => requireMaterial('proto:singularity')).toThrow(/open question 9/);
    expect(() => requireMaterial('paper:nothing')).toThrow(RangeError);
    expect(listMaterials('paper:gem-smoke')).toHaveLength(1);
  });

  test('the deck presets carry the recorded recipes', () => {
    const diamond = requireMaterial('paper:liquid-metal').presets.find((p) => p.name === 'diamond');
    expect(diamond?.uniforms).toMatchObject({
      u_shape: 3,
      u_scale: 0.5,
      u_contour: 0.6,
      u_repetition: 3,
    });
    const blue = requireMaterial('paper:gem-smoke').presets.find((p) => p.name === 'brand-blue');
    expect(blue?.uniforms).toMatchObject({
      u_colorBack: GT_PALETTE.blue,
      u_colors: '#ffffff,#86a8ff',
      u_shape: 4,
    });
    const fire = requireMaterial('paper:gem-smoke').presets.find((p) => p.name === 'fire');
    expect(fire?.uniforms).toMatchObject({
      u_colors: '#fe5b16,#f7ff61,#ffffff',
      u_colorBack: '#000000',
    });
  });
});

describe('recipe resolution', () => {
  const entry = requireMaterial('paper:liquid-metal');

  test('layers defaults, preset and overrides in schema order', () => {
    const resolved = resolveRecipe(entry, { preset: 'diamond', uniforms: { u_scale: 0.7 } });
    expect(resolved.uniforms.u_scale).toBe(0.7);
    expect(resolved.uniforms.u_shape).toBe(3);
    expect(resolved.uniforms.u_fit).toBe('contain');
    expect(resolved.warnings).toEqual([]);
    expect(resolveRecipe(entry, {}).uniforms.u_colorBack).toBe('#aaaaac');
  });

  test('warns on an unknown uniform and a value outside its range, throws on a type mismatch', () => {
    const resolved = resolveRecipe(entry, { uniforms: { u_extra: 1, u_scale: 9 } });
    expect(resolved.warnings.map((w) => w.code).sort()).toEqual(['range', 'unknown_uniform']);
    expect(resolved.uniforms.u_extra).toBe(1);
    expect(() => resolveRecipe(entry, { uniforms: { u_scale: 'big' } })).toThrow(TypeError);
    expect(() => resolveRecipe(entry, { uniforms: { u_shape: 'hexagon' } })).toThrow(TypeError);
    expect(() => resolveRecipe(entry, { preset: 'nope' })).toThrow(RangeError);
  });

  test('converts colors, color lists and enum names for the shader', () => {
    expect(toVec4('#2f5ce0')).toEqual([47 / 255, 92 / 255, 224 / 255, 1]);
    expect(toVec4('#00000000')[3]).toBe(0);
    expect(toVec4List('#ffffff,#86a8ff')).toHaveLength(2);
    const smoke = requireMaterial('paper:gem-smoke');
    const shader = toShaderUniforms(smoke, resolveRecipe(smoke, { preset: 'brand-blue' }).uniforms);
    expect(shader.u_colorsCount).toBe(2);
    expect(shader.u_shape).toBe(4);
    expect(shader.u_fit).toBe(1);
    expect(shader.u_isImage).toBe(false);
    expect(materialSlug('paper:liquid-metal')).toBe('liquid-metal');
  });
});

describe('the recipe key', () => {
  test('reproduces the digests deck.json records for the imported material openers', () => {
    const deck = JSON.parse(readFileSync(join(REPO, 'decks/gt-brand/deck.json'), 'utf8')) as {
      assets: Record<string, Asset>;
    };
    for (const id of ['opener-prototemplate', 'opener-blog', 'opener-developer-experience']) {
      const asset = deck.assets[id];
      if (asset === undefined || asset.source.kind !== 'material')
        throw new Error(`${id} is not a material asset`);
      expect(recipeKey(asset.source), id).toBe(asset.source.recipeKey);
    }
  });

  test('changes with the anchor and the backend', () => {
    const base = {
      materialId: 'paper:liquid-metal',
      uniforms: { u_shape: 3 },
      size: [3200, 1800] as [3200, 1800],
      timeMs: 5500,
      backend: 'angle-metal' as const,
    };
    expect(recipeKey(base)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(recipeKey({ ...base, timeMs: 4000 })).not.toBe(recipeKey(base));
    expect(recipeKey({ ...base, backend: 'swiftshader' })).not.toBe(recipeKey(base));
  });
});
