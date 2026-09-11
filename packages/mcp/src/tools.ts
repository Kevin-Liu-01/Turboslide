// The MCP tool list derived from the action table (SPEC 7.1, 7.3): one tool named deck_<action>
// per action whose transports include mcp and whose handler the dispatcher has, with the input and
// output JSON Schema produced from the Zod definitions through z.toJSONSchema. The committed
// packages/agent/generated/mcp-tools.json is the same derivation without the implementation
// filter; this module is what a running server serves, so a client never sees a tool that would
// answer NotImplementedError. Tool results carry the action output as JSON text, as
// structuredContent, and for the render actions the images as image content.
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ActionId, ActionSpec } from '@turboslide/schema/actions';
import { actionsOn } from '@turboslide/schema/actions';
import { ConflictError, NotImplementedError, errorStatus } from '@turboslide/schema/errors';
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

/** Actions whose output names image files the tool returns as image content (SPEC 7.3). */
export const IMAGE_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  'render.slide',
  'render.sheet',
  'diff.run',
]);

/** Actions that remove or overwrite document state; the destructiveHint a client confirms on. */
export const DESTRUCTIVE_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  'slide.remove',
  'block.remove',
  'version.restore',
  'asset.dither',
  'fix.run',
]);

export type ToolEntry = {
  /** The tool name, deck_<action>. */
  name: string;
  /** The action the tool dispatches. */
  action: ActionId;
  /** Actions that share the tool name and are reached through a discriminating field (view.* on deck_set_view, M3). */
  alsoServes: ActionId[];
  spec: ActionSpec;
  /** The MCP tool definition served on tools/list. */
  tool: Tool;
  /** True for the render actions: image content follows the JSON text. */
  returnsImages: boolean;
  /** How the action output becomes structuredContent, which MCP requires to be a JSON object. */
  shape: 'object' | 'items' | 'value';
};

/**
 * Zod to JSON Schema for the tool list, with the `$schema` marker dropped so the schema is plain.
 * The target is draft-07, the target the SDK's own McpServer uses for zod v4 and the dialect its
 * default Ajv validator speaks: a draft 2020-12 tuple (`prefixItems` plus `items: false`) fails
 * client-side output validation there because Ajv reads `items: false` alone (measured on the
 * render records' boxes). The committed mcp-tools.json keeps draft 2020-12 for readers.
 */
export function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _dropped, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-7',
    io,
    unrepresentable: 'any',
  });
  return rest;
}

type ObjectSchema = Tool['inputSchema'];

/**
 * Every action input is a Zod strictObject, so its JSON Schema is `type: object` with
 * `additionalProperties: false`; the SDK's tool schema type fixes only that literal.
 */
function asObjectSchema(schema: JsonSchema): ObjectSchema {
  const { type: _type, ...rest } = schema;
  return { type: 'object', ...rest };
}

/** The structuredContent shape for an output schema: an object as is, an array under `items`, anything else under `value`. */
export function outputShape(outputSchema: JsonSchema): ToolEntry['shape'] {
  if (outputSchema.type === 'object') return 'object';
  if (outputSchema.type === 'array') return 'items';
  return 'value';
}

/**
 * The outputSchema for a shape. A wrapped schema keeps the inner schema's `definitions` (or
 * `$defs`) at the root, because zod writes recursive definitions (Block inside composite) there
 * and the `#/definitions/...` references inside the inner schema resolve from the document root.
 */
function wrappedOutputSchema(outputSchema: JsonSchema, shape: ToolEntry['shape']): JsonSchema {
  if (shape === 'object') return outputSchema;
  const { definitions, $defs, ...inner } = outputSchema;
  const defs = {
    ...(definitions === undefined ? {} : { definitions }),
    ...($defs === undefined ? {} : { $defs }),
  };
  if (shape === 'items') {
    return {
      type: 'object',
      properties: { items: inner, count: { type: 'integer', minimum: 0 } },
      required: ['items', 'count'],
      additionalProperties: false,
      ...defs,
    };
  }
  return {
    type: 'object',
    properties: { value: inner },
    required: ['value'],
    additionalProperties: false,
    ...defs,
  };
}

function describe(spec: ActionSpec, shape: ToolEntry['shape'], returnsImages: boolean): string {
  const parts = [spec.doc];
  if (spec.mutates)
    parts.push(
      'Requires the baseRevision the caller read; a stale one is refused with 409 and the current document.',
    );
  if (shape === 'items')
    parts.push('structuredContent is { items, count }; the text content is the raw list.');
  if (returnsImages) parts.push('Returns the images as image content beside the JSON.');
  return parts.join(' ');
}

/** The outputSchema a tool declares for an action: the output schema, wrapped for a non-object output. */
export function outputSchemaFor(spec: ActionSpec): JsonSchema {
  const outputSchema = toJsonSchema(spec.output, 'output');
  return wrappedOutputSchema(outputSchema, outputShape(outputSchema));
}

/** One tool entry for an action spec. */
export function toolEntry(spec: ActionSpec): ToolEntry {
  if (spec.mcp === undefined) throw new RangeError(`${spec.id} has no MCP tool name`);
  const inputSchema = toJsonSchema(spec.input, 'input');
  const shape = outputShape(toJsonSchema(spec.output, 'output'));
  const returnsImages = IMAGE_ACTIONS.has(spec.id);
  return {
    name: spec.mcp,
    action: spec.id,
    alsoServes: [],
    spec,
    returnsImages,
    shape,
    tool: {
      name: spec.mcp,
      title: spec.label,
      description: describe(spec, shape, returnsImages),
      inputSchema: asObjectSchema(inputSchema),
      outputSchema: asObjectSchema(outputSchemaFor(spec)),
      annotations: {
        title: spec.label,
        readOnlyHint: !spec.mutates,
        destructiveHint: DESTRUCTIVE_ACTIONS.has(spec.id),
        idempotentHint: !spec.mutates,
        openWorldHint: false,
      },
    },
  };
}

/**
 * The tools a server offers: every action on the mcp transport whose implementation exists, in
 * table order, one tool per name. `implemented` is the dispatcher's `has`.
 */
export function deriveTools(implemented: (id: ActionId) => boolean): ToolEntry[] {
  const byName = new Map<string, ToolEntry>();
  for (const spec of actionsOn('mcp')) {
    if (spec.mcp === undefined || !implemented(spec.id)) continue;
    const existing = byName.get(spec.mcp);
    if (existing !== undefined) {
      existing.alsoServes.push(spec.id);
      continue;
    }
    byName.set(spec.mcp, toolEntry(spec));
  }
  return [...byName.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringsAt(value: unknown, key: string): string[] {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field)
    ? field.filter((item): item is string => typeof item === 'string')
    : [];
}

/** The image files an action output names, in output order (render.slide images, render.sheet sheets, diff.run crops). */
export function imagePathsOf(action: ActionId, output: unknown): string[] {
  if (!isRecord(output)) return [];
  switch (action) {
    case 'render.slide':
      return stringsAt(output, 'images');
    case 'render.sheet': {
      const sheets = Array.isArray(output.sheets) ? output.sheets : [];
      return sheets.flatMap((sheet) =>
        isRecord(sheet) && typeof sheet.image === 'string' ? [sheet.image] : [],
      );
    }
    case 'diff.run': {
      const crops = Array.isArray(output.crops) ? output.crops : [];
      return crops.flatMap((crop) => {
        if (!isRecord(crop)) return [];
        const out: string[] = [];
        if (typeof crop.before === 'string') out.push(crop.before);
        if (typeof crop.after === 'string') out.push(crop.after);
        return out;
      });
    }
    default:
      return [];
  }
}

export type ToolImage = { data: string; mimeType: string };

/** structuredContent for an action output, by the tool's shape. */
export function structuredContentOf(
  shape: ToolEntry['shape'],
  output: unknown,
): Record<string, unknown> {
  if (shape === 'object' && isRecord(output)) return output;
  if (shape === 'items') {
    const items = Array.isArray(output) ? output : [];
    return { items, count: items.length };
  }
  return { value: output };
}

/** A successful tool result: the output as JSON text, the images, an optional note, and structuredContent. */
export function toolResult(
  entry: ToolEntry,
  output: unknown,
  images: ReadonlyArray<ToolImage> = [],
  note?: string,
): CallToolResult {
  const content: CallToolResult['content'] = [
    { type: 'text', text: JSON.stringify(output, null, 2) },
  ];
  for (const image of images)
    content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
  if (note !== undefined) content.push({ type: 'text', text: note });
  return { content, structuredContent: structuredContentOf(entry.shape, output) };
}

export type ToolErrorBody = {
  name: string;
  /** The HTTP status the error class maps to on the agent transport (SPEC 7.1). */
  status: number;
  message: string;
  action: ActionId;
  currentRevision?: number;
  /** The current document, so the caller's re-read is free after a 409. */
  current?: unknown;
  holder?: unknown;
  milestone?: string;
};

/** The error body for a failed dispatch, following the error classes of SPEC 7.1. */
export function toolErrorBody(action: ActionId, error: unknown): ToolErrorBody {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const body: ToolErrorBody = { name, status: errorStatus(error), message, action };
  if (error instanceof ConflictError) {
    body.currentRevision = error.currentRevision;
    if (error.current !== undefined) body.current = error.current;
    if (error.holder !== undefined) body.holder = error.holder;
  }
  if (error instanceof NotImplementedError) body.milestone = error.milestone;
  return body;
}

/** A failed tool result: isError with the error body as JSON text; no structuredContent, so output validation is skipped. */
export function toolError(action: ActionId, error: unknown): CallToolResult {
  const body = toolErrorBody(action, error);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: body }, null, 2) }],
  };
}
