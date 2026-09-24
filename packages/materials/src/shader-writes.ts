// The pure writes of the shader library (docs/FEATURES.md 5.2, 5.3, 5.8), browser safe: the block
// an insert lands (the entry's featured preset, the controls with their resolved uniforms beside
// them, `motion.play: 'show'`, the alt in the seller's words), where it lands (the caller's box,
// the placement helper's rectangle, else the sheet's centre), the material block of a slide, the
// deck's shader palette, and the mutations a Shader section write makes: a preset change writes
// `/preset` and clears the control overrides and the uniforms; a controls change writes
// `/controls` and the resolved `/uniforms` together; any other pointer is one `block.set`. The
// Shader section (packages/chrome inspector/shader.tsx) dispatches these as one `slide.update`
// and the `shader.set` handler (actions.ts) commits them as one write, so one gesture is one
// history entry on every transport.
import type {
  MaterialBlock,
  MaterialControls,
  MaterialUniforms,
} from '@turboslide/schema/blocks/material';
import { materialControlsSchema } from '@turboslide/schema/blocks/material';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';

import { entryWithPalette, featuredPresetOf, requireMaterial } from './catalog.ts';
import type { MaterialEntry } from './catalog.ts';
import { controlMapOf, uniformsWithControls } from './controls.ts';
import { shaderPaletteOfDeck } from './presets.ts';
import { resolveRecipe } from './recipe.ts';

export { shaderPaletteOfDeck };

/** The material block of a slide, or a RangeError naming what is missing. */
export function requireMaterialBlock(
  document: DeckDocument,
  slideId: string,
  blockId: string,
): { slide: Slide; block: MaterialBlock } {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  const found = slideBlocks(slide).find((row) => row.block.id === blockId)?.block;
  if (found === undefined) throw new RangeError(`No block "${blockId}" on slide "${slideId}"`);
  if (found.type !== 'material')
    throw new TypeError(`Block "${blockId}" is a ${found.type}, not a shader`);
  return { slide, block: found };
}

/** The entry a block resolves against on a deck: its palette presets computed from the kit (5.7). */
export function entryForBlock(deck: Deck, block: Pick<MaterialBlock, 'materialId'>): MaterialEntry {
  return entryWithPalette(requireMaterial(block.materialId), shaderPaletteOfDeck(deck));
}

/** The default box of a shader an agent inserts without `at`, in sheet px (editor-shell.ts INSERT_SIZES.material). */
export const SHADER_INSERT_SIZE: readonly [number, number] = [480, 272];

/**
 * The block `shader.insert` and the gallery land (5.2, 5.4; question 5's default): the entry's
 * featured preset, the controls with their resolved uniforms beside them when any moves,
 * `motion.play: 'show'` and the alt in the seller's words.
 */
export function shaderBlockOf(
  id: string,
  entry: MaterialEntry,
  options: { preset?: string; controls?: MaterialControls; alt?: string } = {},
): MaterialBlock {
  const preset = options.preset ?? featuredPresetOf(entry);
  if (preset !== undefined && !entry.presets.some((candidate) => candidate.name === preset))
    throw new RangeError(
      `${entry.id} has no preset "${preset}"; presets: ${entry.presets.map((p) => p.name).join(', ')}`,
    );
  const block: MaterialBlock = {
    id,
    type: 'material',
    materialId: entry.id,
    ...(preset !== undefined ? { preset } : {}),
    motion: { play: 'show' },
    alt: options.alt ?? `The ${entry.label.toLowerCase()} shader`,
  };
  const controls =
    options.controls === undefined ? undefined : materialControlsSchema.parse(options.controls);
  if (controls !== undefined && Object.keys(controls).length > 0) {
    block.controls = controls;
    const base = resolveRecipe(entry, preset === undefined ? {} : { preset }).uniforms;
    const next = uniformsWithControls(entry, base, controls);
    const diff: MaterialUniforms = {};
    for (const [name, value] of Object.entries(next))
      if (JSON.stringify(base[name]) !== JSON.stringify(value)) diff[name] = value;
    if (Object.keys(diff).length > 0) block.uniforms = diff;
  }
  return block;
}

/** The position of an inserted shader: the caller's box, the placement helper's, else the sheet's centre. */
export function shaderInsertPosition(
  deps: { placeInsert?: ((slide: Slide, size: readonly [number, number]) => Position) | undefined },
  slide: Slide,
  at: Position | undefined,
  size: readonly [number, number] = SHADER_INSERT_SIZE,
): Position {
  if (at !== undefined) return at;
  const placed = deps.placeInsert?.(slide, size);
  if (placed !== undefined) return placed;
  const [w, h] = size;
  return { x: Math.round((SHEET_WIDTH - w) / 2), y: Math.round((SHEET_HEIGHT - h) / 2), w, h };
}

/**
 * The mutations a Shader section write makes (5.2, 5.3): a preset change writes `/preset` and
 * clears the control overrides and the uniforms; a controls change writes `/controls` and the
 * resolved `/uniforms` together; any other pointer is one `block.set`. One write, one history
 * entry, whichever transport made it.
 */
export function shaderSetMutations(
  deck: Pick<Deck, 'brand' | 'defaults'>,
  slideId: string,
  block: MaterialBlock,
  path: string,
  value: unknown,
): Mutation[] {
  const set = (pointer: string, next: unknown): Mutation => ({
    op: 'block.set',
    slideId,
    blockId: block.id,
    path: pointer,
    ...(next === undefined ? {} : { value: next }),
  });
  if (path === '/preset') {
    const mutations: Mutation[] = [set('/preset', value)];
    if (block.controls !== undefined) mutations.push(set('/controls', undefined));
    if (block.uniforms !== undefined) mutations.push(set('/uniforms', undefined));
    return mutations;
  }
  if (path === '/controls' || path.startsWith('/controls/')) {
    const entry = entryWithPalette(requireMaterial(block.materialId), shaderPaletteOfDeck(deck));
    let controls: MaterialControls | undefined;
    if (path === '/controls')
      controls = value === undefined ? undefined : materialControlsSchema.parse(value);
    else {
      const name = path.slice('/controls/'.length);
      const next: Record<string, unknown> = { ...(block.controls ?? {}) };
      if (value === undefined) delete next[name];
      else next[name] = value;
      controls = Object.keys(next).length === 0 ? undefined : materialControlsSchema.parse(next);
    }
    const base = resolveRecipe(
      entry,
      block.preset === undefined ? {} : { preset: block.preset },
    ).uniforms;
    // the raw overrides of the Advanced group survive a control move; a key a control maps is the
    // control's alone, computed from the preset's value and never from its own last result
    const mapped = new Set(Object.values(controlMapOf(entry)).flat());
    const raw: MaterialUniforms = {};
    for (const [name, next] of Object.entries(block.uniforms ?? {}))
      if (!mapped.has(name)) raw[name] = next;
    const merged = uniformsWithControls(entry, { ...base, ...raw }, controls);
    const diff: MaterialUniforms = {};
    for (const [name, next] of Object.entries(merged))
      if (JSON.stringify(base[name]) !== JSON.stringify(next)) diff[name] = next;
    return [
      set('/controls', controls),
      set('/uniforms', Object.keys(diff).length === 0 ? undefined : diff),
    ];
  }
  return [set(path, value)];
}
