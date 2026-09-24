// B5's request R1 to the integrator (docs/FEATURES.md 5.8, section 6's shared file table): the
// `shader.*` entries of `packages/schema/src/actions.ts`, with `material.list`, `material.capture`
// and `slide.setBackgroundMaterial` kept as they are (the aliases). This file is a patch fragment,
// not a module: the integrator pastes the two hunks below into actions.ts (the ids into ACTION_IDS
// after 'slide.setBackgroundMaterial', the entries into ACTIONS after 'slide.setBackgroundMaterial')
// and adds the two imports, then runs `pnpm generate:contracts`. The handlers are on the tree:
// packages/materials/src/actions.ts `registerShaderActions` (every id) and apps/studio/src/server/
// shader-frames.ts (B7's `shader.frame` over the hosted store, which wins the registration).
// The named unit tests naming the ids for the coverage test: packages/materials/src/
// shader-actions.test.ts.

// ---------------------------------------------------------------------------------------------
// Hunk 1: the imports (beside line 47)
//
//   import {
//     materialCatalogEntrySchema,
//     materialControlsSchema,
//     materialMotionSchema,
//     materialUniformsSchema,
//     MATERIAL_CONTROL_NAMES,
//   } from './blocks/material.ts';
//   import { materialBlockSchema } from './blocks/material.ts';

// ---------------------------------------------------------------------------------------------
// Hunk 2: ACTION_IDS, after 'slide.setBackgroundMaterial' (the end of the list; GS3_ACTION_IDS is
// the slice from 'presence.list', so the six ids join it as the F2 ids joined the logo ids)
//
//   /* the features round, ship two (docs/FEATURES.md 5.8; B5): the shader library, with
//      material.list, material.capture and slide.setBackgroundMaterial kept as aliases */
//   'shader.list',
//   'shader.insert',
//   'shader.set',
//   'shader.frame',
//   'shader.capture',
//   'shader.render',

// ---------------------------------------------------------------------------------------------
// Hunk 3: the entries, after 'slide.setBackgroundMaterial' in ACTIONS

/* eslint-disable */
// @ts-nocheck
const shaderEntries = {
  'shader.list': action({
    id: 'shader.list',
    label: 'List shaders',
    doc: 'The shader library in the gallery’s order: every entry with its category, its featured preset, its stills (the file names under packages/materials/previews), its uniform schema and its palette presets computed from this deck’s brand kit, plus the eleven common controls with their ranges and sentences and the five category chips; material.list is the alias without the gallery fields.',
    group: 'asset',
    mutates: false,
    transports: A,
    milestone: 'P1',
    input: z.strictObject({ materialId: z.string().optional() }),
    output: z.strictObject({
      shaders: z.array(
        materialCatalogEntrySchema.extend({
          category: z.enum(['fluid', 'light', 'metal', 'gradient', 'graphic']),
          still: z.boolean(),
          featuredPreset: z.string().optional(),
          preview: z.string(),
          presetPreviews: z.record(z.string(), z.string()),
        }),
      ),
      controls: z.array(
        z.strictObject({
          name: z.enum(MATERIAL_CONTROL_NAMES),
          label: z.string(),
          sentence: z.string(),
          group: z.enum(['Form', 'Light and texture', 'Orientation', 'Motion']),
          default: z.number(),
          min: z.number(),
          max: z.number(),
          step: z.number(),
        }),
      ),
      categories: z.array(z.strictObject({ id: z.string(), label: z.string() })),
    }),
    cli: { usage: 'turboslide shader list' },
    mcp: 'deck_shader_list',
    example: {},
  }),
  'shader.insert': action({
    id: 'shader.insert',
    label: 'Insert a shader',
    doc: 'Lands a shader as an object on the named slide: the entry’s featured preset unless one is named (the diamond for liquid metal), the common controls with their resolved uniforms beside them, motion.play show, in the largest free rectangle of the body slot (or at the box named), selected in the editor; a slide that is not a canvas converts first.',
    group: 'block',
    mutates: true,
    transports: A,
    milestone: 'P1',
    input: z.strictObject({
      slideId: slugSchema,
      materialId: z.string().min(1).describe('A catalog id from shader.list (paper:liquid-metal)'),
      preset: z.string().optional().describe('A preset of the entry; its featured one when absent'),
      controls: materialControlsSchema.optional(),
      at: positionObjectSchema
        .optional()
        .describe('The box in sheet px; the free rectangle when absent'),
      alt: z.string().optional(),
      baseRevision,
    }),
    output: z.strictObject({
      revision,
      slideId: slugSchema,
      blockId: blockIdSchema,
      block: materialBlockSchema,
    }),
    cli: {
      usage:
        'turboslide shader insert <slideId> <materialId> --preset <preset> --controls <controls> --at <at>',
    },
    mcp: 'deck_shader_insert',
    example: {
      slideId: 'content-rule',
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      controls: { strength: 0.6 },
      baseRevision: 412,
    },
  }),
  'shader.set': action({
    id: 'shader.set',
    label: 'Set a shader field',
    doc: 'One write on a shader block: /preset writes the preset and clears the control overrides and the uniforms; /controls or /controls/<name> writes the controls and their resolved uniforms together; any other pointer (/anchor, /motion, /uniforms, /twoTone, /plate) is one block.set. One history entry.',
    group: 'block',
    mutates: true,
    transports: A,
    milestone: 'P1',
    input: z.strictObject({
      slideId: slugSchema,
      blockId: blockIdSchema,
      path: z
        .string()
        .regex(
          /^\/(preset|controls(\/[a-zA-Z]+)?|uniforms(\/[a-zA-Z_]+)?|anchor|motion|twoTone|plate|palette|alt|caption|captionSize|height)$/,
        )
        .describe('A JSON pointer under the block'),
      value: z.unknown().optional().describe('Absent removes the field'),
      baseRevision,
    }),
    output: z.strictObject({ revision, block: materialBlockSchema }),
    cli: { usage: 'turboslide shader set <slideId> <blockId> <path> <value>' },
    mcp: 'deck_shader_set',
    example: {
      slideId: 'content-rule',
      blockId: 'shader',
      path: '/controls/strength',
      value: 1.2,
      baseRevision: 412,
    },
  }),
  'shader.frame': action({
    id: 'shader.frame',
    label: 'Store a shader frame',
    doc: 'The client capture’s write (the editor’s own WebGL): stores the PNG under assets/frame-<16 hex of frameKey>@2x.png, writes the block’s /asset and removes the block’s superseded frame in one revision; the key is checked against the block as the document reads now, so a recipe that moved on answers 409; the same bytes under the same id store nothing. The orphan prune runs behind the response.',
    group: 'asset',
    mutates: true,
    transports: A,
    milestone: 'P1',
    input: z.strictObject({
      slideId: slugSchema,
      blockId: blockIdSchema,
      frameKey: z.string().regex(/^sha256:[0-9a-f]{64}$/),
      bytes: z.string().optional().describe('The PNG as base64'),
      upload: z
        .string()
        .optional()
        .describe('A presigned upload’s key instead of bytes (a frame over the body cap)'),
      renderer: z.string().optional().describe('The WebGL renderer string of the client'),
      baseRevision,
    }),
    output: z.strictObject({
      revision,
      assetId: slugSchema,
      existed: z.boolean(),
      removed: z.array(slugSchema),
      size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    }),
    cli: {
      usage: 'turboslide shader frame <slideId> <blockId> --frame-key <frameKey> < frame.png',
    },
    mcp: 'deck_shader_frame',
    example: {
      slideId: 'content-rule',
      blockId: 'shader',
      frameKey: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      bytes: 'iVBORw0KGgo=',
      baseRevision: 412,
    },
  }),
  'shader.capture': action({
    id: 'shader.capture',
    label: 'Capture a shader’s frame',
    doc: 'The hosted job for one shader block, the fallback when the editor has no WebGL and the agent’s route: the recipe rendered at the block’s box aspect with the long side 3200 in the capture browser, then the same write as shader.frame; bounded at 30 s hosted, answering one sentence.',
    group: 'asset',
    mutates: true,
    transports: A,
    milestone: 'P1',
    input: z.strictObject({
      slideId: slugSchema,
      blockId: blockIdSchema,
      backend: z.enum(['angle-metal', 'swiftshader']).optional(),
      baseRevision,
    }),
    output: z.strictObject({
      revision,
      assetId: slugSchema,
      existed: z.boolean(),
      removed: z.array(slugSchema),
      size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    }),
    cli: { usage: 'turboslide shader capture <slideId> <blockId>' },
    mcp: 'deck_shader_capture',
    example: { slideId: 'content-rule', blockId: 'shader', baseRevision: 412 },
  }),
  'shader.render': action({
    id: 'shader.render',
    label: 'Render a shader',
    doc: 'PNG bytes of a recipe for an agent or the CLI, no deck write and no browser of the caller’s: the material, a preset, uniforms or the common controls, the frame time and the pixels (3200 by 1800 unless a size with the long side 3200 is named); the deck’s brand kit colours the presets when the call names a deck.',
    group: 'render',
    mutates: false,
    transports: A,
    milestone: 'P1',
    input: z.strictObject({
      materialId: z.string().min(1),
      preset: z.string().optional(),
      uniforms: materialUniformsSchema.optional(),
      controls: materialControlsSchema.optional(),
      size: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
      timeMs: z.number().nonnegative().optional(),
      backend: z.enum(['angle-metal', 'swiftshader']).optional(),
    }),
    output: z.strictObject({
      png: z.string().describe('The PNG as base64'),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      renderer: z.string(),
      backend: z.enum(['angle-metal', 'swiftshader']),
      ms: z.number().int().nonnegative(),
    }),
    cli: {
      usage: 'turboslide shader render <materialId> --preset <preset> --time <timeMs> --out <file>',
    },
    mcp: 'deck_shader_render',
    example: { materialId: 'paper:liquid-metal', preset: 'diamond', timeMs: 5500 },
  }),
};
