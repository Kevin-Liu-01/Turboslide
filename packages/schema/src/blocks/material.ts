// The `material` block (SPEC 5.3: "materials mount on [data-type="material"][data-live]"; SPEC 5.4
// "Materials are assets with a recipe"; MILESTONES M5 item 3). A material block is a recipe first:
// the catalog id, a palette preset, uniform overrides, the frame anchor, the two-tone toggle and
// the plate its metrics are screened against. `material.capture` turns the recipe into a frozen
// frame asset (source.kind 'material' with the recipe key) and writes its id into `asset`, which
// is what every surface outside the editor shows; the editor mounts the live shader over it for
// preview (packages/viewer MaterialMount). The block lives in content slots as a figure; the
// picture of an opener or a mood slide references a material asset directly.
//
// The features round, ship two (docs/FEATURES.md 5.1; audit-shaders 16): three optional fields,
// additive at version 1 with a defined absence. `motion` says whether the show plays the shader
// (absent is off); `controls` holds the eleven common controls of the Shader section (absent means
// the preset's authored uniforms); `palette` records whether the recipe's colours are the brand
// kit's roles or a deck's own (absent is kit). The common controls are stored beside the resolved
// `uniforms`, so a deck an agent wrote with raw uniforms and a deck a seller wrote with sliders
// read alike, and nothing that reads `uniforms` changes. The audit's fourth field, `fit`, is not
// added: the still is rendered at the box's own aspect (5.5), so cover and contain draw the same
// pixels. `migrate` stays the identity and `schemaVersion` stays 1.
//
// This module imports only ids, text and annotate so blocks.ts can import it without a cycle;
// the plate sides repeat deck.ts PLATE_SIDES by value for the same reason.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { AssetId, BlockId } from '../ids.ts';
import { blockIdSchema, slugSchema } from '../ids.ts';
import type { Position } from '../position.ts';
import { positionSchema } from '../position.ts';
import type { BlockLink, Text } from '../text.ts';
import { blockLinkField, textSchema } from '../text.ts';

/** The uniform value forms a recipe records (Asset.source.uniforms, SPEC 4.2). */
export type MaterialUniformValue = number | number[] | string;
export type MaterialUniforms = Record<string, MaterialUniformValue>;

/** deck.ts PLATE_SIDES, repeated by value (this module sits below deck.ts). */
export const MATERIAL_PLATE_SIDES = ['lower-left', 'lower-right', 'upper-left'] as const;
export type MaterialPlateSide = (typeof MATERIAL_PLATE_SIDES)[number];

/** Frame anchors the deck's openers were sampled at (OPENERS.md: about 4, 5.5 and 7 seconds). */
export const MATERIAL_ANCHORS = [4000, 5500, 7000] as const;

/** The two values of `motion.play` (docs/FEATURES.md 5.1, 5.6): the show plays the shader, or never. */
export const MATERIAL_MOTION_PLAYS = ['off', 'show'] as const;
export type MaterialMotionPlay = (typeof MATERIAL_MOTION_PLAYS)[number];

/** The show's motion of a shader (5.6): `play` and the speed the show plays it at (1 when absent). */
export type MaterialMotion = { play: MaterialMotionPlay; speed?: number };

/**
 * The eleven common controls of the Shader section (docs/FEATURES.md 5.2, 5.3; Glyphfield's
 * `LiveMaterialSettings` with the three colours taken by the kit's palette and one rotation axis
 * for a flat shader). Every field is optional: an absent control reads as its default and moves
 * nothing, so a preset keeps its authored uniforms until a control moves. The ranges are the
 * published ones of Glyphfield's `agentCatalog.ts` and live in @turboslide/materials/controls.
 */
export type MaterialControls = {
  strength?: number;
  detail?: number;
  frequency?: number;
  amplitude?: number;
  density?: number;
  brightness?: number;
  grain?: number;
  rotation?: number;
  centerX?: number;
  centerY?: number;
  speed?: number;
};

export const MATERIAL_CONTROL_NAMES = [
  'strength',
  'detail',
  'frequency',
  'amplitude',
  'density',
  'brightness',
  'grain',
  'rotation',
  'centerX',
  'centerY',
  'speed',
] as const satisfies ReadonlyArray<keyof MaterialControls>;
export type MaterialControlName = (typeof MATERIAL_CONTROL_NAMES)[number];

/** Whose colours the recipe draws (5.7): the brand kit's six roles, or a deck that left the kit. */
export const MATERIAL_PALETTES = ['kit', 'custom'] as const;
export type MaterialPalette = (typeof MATERIAL_PALETTES)[number];

export type MaterialBlock = {
  id: BlockId;
  ext?: Record<string, unknown>;
  /** The box on a freeform slide (position.ts), as on every block. */
  pos?: Position;
  /** A whole-object link (gslides-parity SPEC 7.2.7), as on every block. */
  link?: BlockLink;
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
  /** The show's motion (docs/FEATURES.md 5.6); absent is off, so every still surface draws the frame. */
  motion?: MaterialMotion;
  /** The Shader section's common controls (5.2, 5.3); absent means the preset's authored uniforms. */
  controls?: MaterialControls;
  /** Whose colours the recipe draws (5.7); absent is the kit's. */
  palette?: MaterialPalette;
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

const controlNumber = z.number().finite();

export const materialMotionSchema = z.strictObject({
  play: z.enum(MATERIAL_MOTION_PLAYS),
  speed: z.number().min(0).max(2).optional(),
}) satisfies z.ZodType<MaterialMotion>;

export const materialControlsSchema = z.strictObject({
  strength: controlNumber.min(0).max(2).optional(),
  detail: controlNumber.min(0.5).max(8).optional(),
  frequency: controlNumber.min(0.2).max(10).optional(),
  amplitude: controlNumber.min(0).max(8).optional(),
  density: controlNumber.min(0.1).max(2).optional(),
  brightness: controlNumber.min(0.1).max(2).optional(),
  grain: controlNumber.min(0).max(100).optional(),
  rotation: controlNumber.min(0).max(360).optional(),
  centerX: controlNumber.min(0).max(1).optional(),
  centerY: controlNumber.min(0).max(1).optional(),
  speed: controlNumber.min(0).max(2).optional(),
}) satisfies z.ZodType<MaterialControls>;

export const materialBlockSchema = z.strictObject({
  id: annotate(blockIdSchema, { label: 'Id', control: 'readonly', group: 'Advanced' }),
  ext: z.record(z.string(), z.unknown()).optional(),
  pos: positionSchema,
  link: blockLinkField,
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
  motion: annotate(materialMotionSchema.optional(), {
    label: 'Motion',
    control: 'json',
    group: 'Block',
    help: 'Whether the show plays the shader (play: off or show) and at what speed; every still surface draws the frame.',
  }),
  controls: annotate(materialControlsSchema.optional(), {
    label: 'Controls',
    control: 'json',
    group: 'Block',
    help: 'The Shader section’s common controls (strength, detail, frequency, amplitude, density, brightness, grain, rotation, centerX, centerY, speed); the resolved uniforms sit beside them.',
  }),
  palette: annotate(z.enum(MATERIAL_PALETTES).optional(), {
    label: 'Palette',
    control: 'select',
    snap: MATERIAL_PALETTES,
    group: 'Block',
    help: 'kit draws the brand kit’s six roles; custom records a deck that left the kit.',
  }),
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
