// The catalog, the presets, recipe resolution and the recipe key (SPEC 5.4; MILESTONES M5 item 3).
// The key test reproduces the two digests deck.json records for the imported material openers
// (opener-prototemplate, opener-blog), so a key computed here is the importer's key.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { materialCatalogEntrySchema } from '@turboslide/schema/blocks/material';
import type { Asset } from '@turboslide/schema/assets';

import {
  FEATURED_MATERIAL_IDS,
  GALLERY_MATERIAL_IDS,
  MATERIALS,
  MATERIAL_IDS,
  listMaterials,
  requireMaterial,
} from './catalog.ts';
import type { MaterialEntry, PaperEntry } from './catalog.ts';
import { glyphFrameOf, glyphProgramSpec } from './engine.ts';
import {
  fragmentShaderFor,
  mipmapsFor,
  textureSources,
  toShaderUniforms,
  toVec4,
  toVec4List,
} from './paper.ts';
import { GT_PALETTE } from './presets.ts';
import { shaderPreviewFile } from './previews.ts';
import { PROTO_MATERIALS } from './proto.ts';
import { checkUniform, materialSlug, resolveRecipe, validateUniforms } from './recipe.ts';
import { recipeKey } from './recipe-key.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');

const isPaper = (entry: MaterialEntry): entry is PaperEntry => entry.engine === 'paper';
const PAPER_ENTRIES: PaperEntry[] = Object.values(MATERIALS).filter(isPaper);
/** A Paper entry by id; throws for a glyph entry. */
function paperEntry(id: string): PaperEntry {
  const entry = requireMaterial(id);
  if (!isPaper(entry)) throw new TypeError(`${id} is not a Paper entry`);
  return entry;
}

describe('the catalog', () => {
  test('every entry parses as the schema entry, has a shader and every preset validates', () => {
    expect(MATERIAL_IDS.length).toBeGreaterThanOrEqual(17);
    for (const entry of Object.values(MATERIALS)) {
      expect(materialCatalogEntrySchema.safeParse(listMaterials(entry.id)[0]).success).toBe(true);
      if (isPaper(entry)) expect(fragmentShaderFor(entry)).toMatch(/^#version 300 es/);
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
    /* the Paper and Glyphfield entries are available; only the proto stubs are not */
    for (const entry of listed) expect(entry.available, entry.id).toBe(entry.family !== 'proto');
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

describe('six more Paper materials (the Glyphfield port, wave 2.2)', () => {
  /* Glyphfield's names (`PAPER_SHADER_FAMILIES` labels) in the catalog's sentence case */
  const SIX: Readonly<Record<string, string>> = {
    'paper:warp': 'Warp',
    'paper:water': 'Water',
    'paper:voronoi': 'Voronoi',
    'paper:color-panels': 'Color panels',
    'paper:pulsing-border': 'Pulsing border',
    'paper:dot-orbit': 'Dot orbit',
  };

  test('are in the catalog and the gallery under Glyphfield’s names, each with its own shader', () => {
    for (const [id, label] of Object.entries(SIX)) {
      const entry = paperEntry(id);
      expect(entry.label).toBe(label);
      expect(entry.available).toBe(true);
      expect(entry.still).toBe(false);
      expect(entry.credit).toBe(`Material: ${label.toLowerCase()}, Paper Shaders`);
      expect(fragmentShaderFor(entry)).toMatch(/^#version 300 es/);
      expect(GALLERY_MATERIAL_IDS).toContain(id);
    }
    expect(new Set(Object.keys(SIX).map((id) => fragmentShaderFor(paperEntry(id)))).size).toBe(6);
    expect(PAPER_ENTRIES).toHaveLength(23);
  });

  test('every uniform of every entry is one the shader or Paper’s sizing reads', () => {
    const SIZING = new Set(['u_fit', 'u_scale', 'u_rotation', 'u_offsetX', 'u_offsetY']);
    for (const entry of PAPER_ENTRIES) {
      const glsl = fragmentShaderFor(entry);
      for (const spec of entry.uniforms) {
        if (SIZING.has(spec.name) || /^u_(origin|world)/.test(spec.name)) continue;
        expect(glsl, `${entry.id} ${spec.name}`).toMatch(
          new RegExp(`uniform [^;]*\\b${spec.name}\\b`),
        );
      }
    }
  });

  test('the noise texture for warp, voronoi, dot orbit and pulsing border; water filters an empty picture', () => {
    const textured = Object.keys(SIX).filter((id) => requireMaterial(id).noiseTexture);
    expect(textured.sort()).toEqual([
      'paper:dot-orbit',
      'paper:pulsing-border',
      'paper:voronoi',
      'paper:warp',
    ]);
    const water = paperEntry('paper:water');
    expect(Object.keys(textureSources(water, 'data:noise'))).toEqual(['u_image']);
    expect(mipmapsFor(water)).toEqual(['u_image']);
    /* water has no u_isImage: sending it made Paper warn on every frame */
    const uniforms = toShaderUniforms(
      water,
      resolveRecipe(water, { preset: 'ink-paper' }).uniforms,
    );
    expect(uniforms).not.toHaveProperty('u_isImage');
    expect(fragmentShaderFor(water)).not.toContain('u_isImage');
    const metal = requireMaterial('paper:liquid-metal');
    expect(toShaderUniforms(metal, resolveRecipe(metal, {}).uniforms).u_isImage).toBe(false);
    expect(Object.keys(textureSources(requireMaterial('paper:warp'), 'data:noise'))).toEqual([
      'u_noiseTexture',
    ]);
  });

  test('warp’s colours run from the kit’s ground to its figures', () => {
    const warp = requireMaterial('paper:warp');
    const ink = resolveRecipe(warp, { preset: 'ink-paper' }).uniforms.u_colors;
    expect(ink).toBe(`${GT_PALETTE.ink},${GT_PALETTE.titanium},${GT_PALETTE.paperInk}`);
    const paper = resolveRecipe(warp, { preset: 'paper-ink' }).uniforms.u_colors;
    expect(paper).toBe(`${GT_PALETTE.paper},${GT_PALETTE.ink2},${GT_PALETTE.ink}`);
  });

  test('every entry has its gallery card and a tile per preset under previews/, in the index', () => {
    const dir = join(REPO, 'packages/materials/previews');
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as {
      entries: { file: string }[];
    };
    const indexed = new Set(index.entries.map((row) => row.file));
    for (const entry of Object.values(MATERIALS))
      for (const file of [
        shaderPreviewFile(entry.id),
        ...entry.presets.map((preset) => shaderPreviewFile(entry.id, preset.name)),
      ]) {
        expect(existsSync(join(dir, file)), file).toBe(true);
        expect(indexed.has(file), file).toBe(true);
      }
  });
});

describe('the gallery order (the Glyphfield port, wave 1.3)', () => {
  const HIDDEN = ['paper:perlin-noise', 'paper:simplex-noise', 'paper:waves'];

  test('leaves out Paper’s three placeholder patterns, which the catalog and saved decks keep', () => {
    for (const id of HIDDEN) {
      expect(GALLERY_MATERIAL_IDS).not.toContain(id);
      expect(MATERIAL_IDS).toContain(id);
      expect(listMaterials(id).map((entry) => entry.id)).toEqual([id]);
      expect(requireMaterial(id).id).toBe(id);
    }
    expect([...GALLERY_MATERIAL_IDS].sort()).toEqual(
      MATERIAL_IDS.filter((id) => !HIDDEN.includes(id)).sort(),
    );
  });

  test('lists the featured six first and the simple patterns, spiral and dot grid, last', () => {
    expect(GALLERY_MATERIAL_IDS.slice(0, 6)).toEqual([...FEATURED_MATERIAL_IDS]);
    expect(GALLERY_MATERIAL_IDS.slice(-2)).toEqual(['paper:spiral', 'paper:dot-grid']);
    expect(new Set(GALLERY_MATERIAL_IDS).size).toBe(GALLERY_MATERIAL_IDS.length);
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

describe('the glyph entries (the Glyphfield port, wave 3)', () => {
  const GLYPH = Object.values(MATERIALS).filter((entry) => entry.engine === 'glyph');
  const CURATED = [
    'Liquid glass',
    'Caustics',
    'Iridescent foil',
    'Nebula',
    'Silk ribbons',
    'Spectral bloom',
    'Architectural chrome',
    'Radiant void',
    'Galactic rings',
    'Chrome glares',
    'Relief gradient',
    'Orbit gradient',
    'Soft register',
  ];

  test('the house gradients, the thirteen originals, Holo cloth and the glyph field, in sentence case', () => {
    expect(GLYPH.map((entry) => entry.label).sort()).toEqual(
      [
        ...CURATED,
        'Mesh gradient',
        'Grain gradient',
        'Dither gradient',
        'Holo cloth',
        'Glyph field',
      ].sort(),
    );
    for (const entry of GLYPH) {
      expect(entry.id).toMatch(/^glyph:[a-z-]+$/);
      expect(listMaterials(entry.id)[0]?.engine).toMatch(/^Glyphfield (WebGL2|Canvas 2D)$/);
      expect(GALLERY_MATERIAL_IDS).toContain(entry.id);
    }
  });

  test('no entry names another studio or reference', () => {
    for (const entry of Object.values(MATERIALS))
      expect(`${entry.label} ${entry.doc} ${entry.credit}`, entry.id).not.toMatch(
        /shaders\.com|evil rabbit|gradientool|grainient|design stud|holocloth|shadergradient/i,
      );
  });

  test('every glyph entry is seekable: its frame is a function of the time alone', () => {
    for (const entry of GLYPH) {
      if (entry.engine !== 'glyph') continue;
      const at = glyphFrameOf(entry, {}, 3200, 1800, 5500);
      expect(at.time).toBeCloseTo(5.5 * entry.timeScale, 6);
      expect(glyphFrameOf(entry, {}, 3200, 1800, 5500)).toEqual(at);
      expect(entry.still).toBe(false);
      const spec = glyphProgramSpec(entry);
      if (spec.kind === 'webgl2')
        expect(spec.fragment).toMatch(/^#version 300 es[\s\S]*void main\(\)/);
      else expect(entry.id).toBe('glyph:glyph-field');
    }
  });
});
