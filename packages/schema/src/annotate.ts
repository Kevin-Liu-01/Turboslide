// Inspector annotations on Zod schemas (SPEC 4.2: "the inspector's control metadata (label,
// control, snap, group annotations per property)"). The annotation is stored in Zod's global
// registry as `title` plus an `x-inspector` extension, so it survives into the JSON Schema that
// the MCP tool list and openapi.json are generated from, and the M3 inspector reads it back with
// readInspector().
import { z } from 'zod';

export type InspectorControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
  | 'asset'
  | 'icon'
  | 'color'
  | 'json'
  | 'readonly';

export type InspectorGroup = 'Slide' | 'Layout' | 'Block' | 'Text' | 'Asset' | 'Advanced';

export type Inspector = {
  /** Accessible label; the control reads `<block id>: <label>` (SPEC 6.5). */
  label: string;
  control: InspectorControl;
  /** The values a select or a snapping number offers. */
  snap?: ReadonlyArray<string | number>;
  group?: InspectorGroup;
  /** One sentence for the inspector's help text and the JSON Schema description. */
  help?: string;
};

export const INSPECTOR_KEY = 'x-inspector';

/** Attaches an inspector annotation and returns the annotated schema. */
export function annotate<T extends z.ZodType>(schema: T, inspector: Inspector): T {
  const meta: Record<string, unknown> = { title: inspector.label, [INSPECTOR_KEY]: inspector };
  if (inspector.help !== undefined) meta.description = inspector.help;
  return schema.meta(meta);
}

/** Reads the annotation back from any schema, or undefined. */
export function readInspector(schema: z.ZodType): Inspector | undefined {
  const meta = z.globalRegistry.get(schema);
  const inspector: unknown = meta?.[INSPECTOR_KEY];
  return isInspector(inspector) ? inspector : undefined;
}

function isInspector(value: unknown): value is Inspector {
  return typeof value === 'object' && value !== null && 'label' in value && 'control' in value;
}

/** The annotations of every property of an object schema, keyed by property name. */
export function inspectorsOf(schema: z.ZodObject): Record<string, Inspector> {
  const out: Record<string, Inspector> = {};
  for (const [key, property] of Object.entries(schema.shape)) {
    const inspector = readInspector(property as z.ZodType);
    if (inspector !== undefined) out[key] = inspector;
  }
  return out;
}
