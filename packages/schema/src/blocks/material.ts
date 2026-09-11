// The `material` block (SPEC 5.3: "materials mount on [data-type="material"][data-live]"; SPEC 5.4
// "Materials are assets with a recipe"; MILESTONES M5 item 3). A material block is a recipe first:
// the catalog id, a palette preset, uniform overrides, the frame anchor, the two-tone toggle and
// the plate its metrics are screened against. `material.capture` turns the recipe into a frozen
// frame asset (source.kind 'material' with the recipe key) and writes its id into `asset`, which
// is what every surface outside the editor shows; the editor mounts the live shader over it for
// preview (packages/viewer MaterialMount). The block lives in content slots as a figure; the
// picture of an opener or a mood slide references a material asset directly.
//
// This module imports only ids, text and annotate so blocks.ts can import it without a cycle;
// the plate sides repeat deck.ts PLATE_SIDES by value for the same reason.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { AssetId, BlockId } from '../ids.ts';
import { blockIdSchema, slugSchema } from '../ids.ts';
import type { Text } from '../text.ts';
import { textSchema } from '../text.ts';

/** The uniform value forms a recipe records (Asset.source.uniforms, SPEC 4.2). */
export type MaterialUniformValue = number | number[] | string;
export type MaterialUniforms = Record<string, MaterialUniformValue>;

/** deck.ts PLATE_SIDES, repeated by value (this module sits below deck.ts). */
export const MATERIAL_PLATE_SIDES = ['lower-left', 'lower-right', 'upper-left'] as const;
export type MaterialPlateSide = (typeof MATERIAL_PLATE_SIDES)[number];

/** Frame anchors the deck's openers were sampled at (OPENERS.md: about 4, 5.5 and 7 seconds). */
export const MATERIAL_ANCHORS = [4000, 5500, 7000] as const;

export type MaterialBlock = {
  id: BlockId;
  ext?: Record<string, unknown>;
  type: 'material';
  /** The catalog id: `paper:liquid-metal`, `paper:gem-smoke`. */
  materialId: string;
  /** A palette preset of the catalog entry, applied under `uniforms`. */
  preset?: string;
  /** Uniform overrides in the recipe's `u_*` names, the form Asset.source.uniforms records. */
  uniforms?: MaterialUniforms;
  /** The frame time in ms the capture freezes (the time anchor of the frame contract). */
  anchor?: number;
  /** Capture the frame as a two-tone twin pair through the deck's screen (SPEC 5.4). */
  twoTone?: boolean;
  /** The plate rectangle the two-tone metrics are screened against (PLATE_BOXES). */
  plate?: MaterialPlateSide;
  /** The frozen frame asset the block shows; absent until the recipe is captured. */
  asset?: AssetId;
  /** The figure's height in sheet px; the width is the slot's and the frame keeps 16:9 inside it. */
  height?: number;
  caption?: Text;
  captionSize?: 16 | 15;
  alt: string;
};

export const materialUniformValueSchema = z.union([
  z.number(),
  z.array(z.number()),
  z.string(),
]) satisfies z.ZodType<MaterialUniformValue>;

export const materialUniformsSchema = z.record(
  z.string(),
  materialUniformValueSchema,
) satisfies z.ZodType<MaterialUniforms>;

export const materialBlockSchema = z.strictObject({
  id: annotate(blockIdSchema, { label: 'Id', control: 'readonly', group: 'Advanced' }),
  ext: z.record(z.string(), z.unknown()).optional(),
  type: z.literal('material'),
  materialId: annotate(z.string().min(1), {
    label: 'Material',
    control: 'select',
    group: 'Block',
    help: 'A catalog id from `turboslide material list` (paper:liquid-metal, paper:gem-smoke).',
  }),
  preset: annotate(z.string().min(1).optional(), {
    label: 'Preset',
    control: 'select',
    group: 'Block',
    help: 'A palette preset of the material (ink-paper, paper-ink, brand-blue, fire); uniforms override it.',
  }),
  uniforms: annotate(materialUniformsSchema.optional(), {
    label: 'Uniforms',
    control: 'json',
    group: 'Block',
    help: 'Uniform overrides in the recipe’s u_* names; the Material section edits them one by one.',
  }),
  anchor: annotate(z.number().nonnegative().optional(), {
    label: 'Anchor (ms)',
    control: 'number',
    snap: MATERIAL_ANCHORS,
    group: 'Block',
    help: 'The frame time the capture freezes; the deck sampled its openers at about 4, 5.5 and 7 s.',
  }),
  twoTone: annotate(z.boolean().optional(), {
    label: 'Two-tone',
    control: 'toggle',
    group: 'Block',
    help: 'Capture through the deck’s 8 by 8 Bayer screen as a light and dark twin pair (SPEC 5.4).',
  }),
  plate: annotate(z.enum(MATERIAL_PLATE_SIDES).optional(), {
    label: 'Plate',
    control: 'select',
    snap: MATERIAL_PLATE_SIDES,
    group: 'Block',
    help: 'The plate rectangle the two-tone metrics are screened against (OPENERS.md:105, 176).',
  }),
  asset: annotate(slugSchema.optional(), { label: 'Frame', control: 'asset', group: 'Asset' }),
  height: annotate(z.number().positive().optional(), {
    label: 'Height',
    control: 'number',
    group: 'Layout',
  }),
  caption: annotate(textSchema.optional(), {
    label: 'Caption',
    control: 'textarea',
    group: 'Text',
  }),
  captionSize: annotate(z.literal([16, 15]).optional(), {
    label: 'Caption size',
    control: 'select',
    snap: [16, 15],
    group: 'Block',
  }),
  alt: annotate(z.string().min(1), { label: 'Alt text', control: 'text', group: 'Text' }),
}) satisfies z.ZodType<MaterialBlock>;

/** The recipe fields of a block, the part `material.capture` reads. */
export type MaterialRecipe = {
  materialId: string;
  preset?: string;
  uniforms?: MaterialUniforms;
  anchor?: number;
  twoTone?: boolean;
  plate?: MaterialPlateSide;
};

export function materialRecipeOf(block: MaterialBlock): MaterialRecipe {
  return {
    materialId: block.materialId,
    ...(block.preset !== undefined ? { preset: block.preset } : {}),
    ...(block.uniforms !== undefined ? { uniforms: block.uniforms } : {}),
    ...(block.anchor !== undefined ? { anchor: block.anchor } : {}),
    ...(block.twoTone !== undefined ? { twoTone: block.twoTone } : {}),
    ...(block.plate !== undefined ? { plate: block.plate } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// The catalog entry shape (material.list output; @turboslide/materials fills it)

export type MaterialUniformKind = 'float' | 'int' | 'color' | 'colors' | 'enum' | 'bool';

/** One uniform of a catalog entry: the schema the inspector and the CLI validate values against. */
export type MaterialUniformSpec = {
  /** The recipe name, `u_scale`. */
  name: string;
  label: string;
  kind: MaterialUniformKind;
  /** The value the material takes when the recipe and the preset name none. */
  default: MaterialUniformValue;
  min?: number;
  max?: number;
  step?: number;
  /** For `enum`: the named values and the numbers the shader reads. */
  options?: { name: string; value: number }[];
  /** For `colors`: the most entries the shader reads. */
  maxCount?: number;
  help?: string;
};

export type MaterialPreset = {
  name: string;
  label: string;
  doc: string;
  uniforms: MaterialUniforms;
};

export type MaterialFamily = 'paper' | 'proto';

export type MaterialCatalogEntry = {
  /** `paper:liquid-metal`, `proto:event-horizon`. */
  id: string;
  family: MaterialFamily;
  label: string;
  doc: string;
  /** false for the proto:* engines until open question 9 is answered. */
  available: boolean;
  /** The upstream author and license line the credit names. */
  credit: string;
  license: string;
  uniforms: MaterialUniformSpec[];
  presets: MaterialPreset[];
};

export const materialUniformSpecSchema = z.strictObject({
  name: z.string().min(1),
  label: z.string(),
  kind: z.enum(['float', 'int', 'color', 'colors', 'enum', 'bool']),
  default: materialUniformValueSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.strictObject({ name: z.string(), value: z.number() })).optional(),
  maxCount: z.number().int().positive().optional(),
  help: z.string().optional(),
}) satisfies z.ZodType<MaterialUniformSpec>;

export const materialPresetSchema = z.strictObject({
  name: z.string().min(1),
  label: z.string(),
  doc: z.string(),
  uniforms: materialUniformsSchema,
}) satisfies z.ZodType<MaterialPreset>;

export const materialCatalogEntrySchema = z.strictObject({
  id: z.string().min(1),
  family: z.enum(['paper', 'proto']),
  label: z.string(),
  doc: z.string(),
  available: z.boolean(),
  credit: z.string(),
  license: z.string(),
  uniforms: z.array(materialUniformSpecSchema),
  presets: z.array(materialPresetSchema),
}) satisfies z.ZodType<MaterialCatalogEntry>;
