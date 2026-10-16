// The named JSON Schemas shared by openapi.json and mcp-tools.json: the document types by name
// (Deck, Slide, Block, …) plus every action's input and output, generated once through a Zod
// registry so nested uses become $ref links instead of inlined copies. An action whose input or
// output is one of the named schemas reuses that name rather than registering a duplicate.
import { z } from 'zod';
import type { ActionId } from '@turboslide/schema/actions';
import { actionsInOrder } from '@turboslide/schema/actions';
import { assetSchema } from '@turboslide/schema/assets';
import { blockSchema, iconSchema } from '@turboslide/schema/blocks';
import {
  deckSchema,
  layoutSchema,
  plateSchema,
  pictureSchema,
  sectionSchema,
  slideSchema,
} from '@turboslide/schema/deck';
import { exportReportSchema } from '@turboslide/schema/export';
import { findingSchema } from '@turboslide/schema/findings';
import {
  authorSchema,
  leaseSchema,
  mutationSchema,
  versionSchema,
  writeSchema,
} from '@turboslide/schema/mutations';
import { renderRecordSchema } from '@turboslide/schema/render';
import type { JsonSchema } from './json-schema.ts';

/** The document types by name; nested uses in any other schema become $ref links to these. */
export const NAMED_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  Deck: deckSchema,
  Section: sectionSchema,
  Slide: slideSchema,
  Layout: layoutSchema,
  Picture: pictureSchema,
  Plate: plateSchema,
  Block: blockSchema,
  Icon: iconSchema,
  Asset: assetSchema,
  Mutation: mutationSchema,
  Write: writeSchema,
  Author: authorSchema,
  Version: versionSchema,
  Lease: leaseSchema,
  Finding: findingSchema,
  RenderRecord: renderRecordSchema,
  ExportReport: exportReportSchema,
};

export function pascal(actionId: string): string {
  return actionId
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export type NamedSchemas = {
  /** Every schema by id, with $ref links using `uri`. */
  schemas: Record<string, JsonSchema>;
  /** The id of an action's input schema (a named schema's id when the input is one). */
  inputId: (id: ActionId) => string;
  /** The id of an action's output schema. */
  outputId: (id: ActionId) => string;
};

/* One registry conversion per reference form: openapi.json and mcp-tools.json each ask for it, and
   a generateAll run spent a third of its time here. The callers read the schemas and never write. */
const generatedByBase = new Map<string, NamedSchemas>();

/** Every named schema with `<refBase><id>` as the reference form (`#/$defs/`, `#/components/schemas/`). */
export function generateNamedSchemas(refBase: string): NamedSchemas {
  let named = generatedByBase.get(refBase);
  if (named === undefined) {
    named = convertNamedSchemas((id) => `${refBase}${id}`);
    generatedByBase.set(refBase, named);
  }
  return named;
}

function convertNamedSchemas(uri: (id: string) => string): NamedSchemas {
  const registry = z.registry<{ id: string }>();
  const byInstance = new Map<z.ZodType, string>();
  for (const [id, schema] of Object.entries(NAMED_SCHEMAS)) {
    registry.add(schema, { id });
    byInstance.set(schema, id);
  }
  const inputs = new Map<ActionId, string>();
  const outputs = new Map<ActionId, string>();
  for (const spec of actionsInOrder()) {
    const inputName = byInstance.get(spec.input) ?? `${pascal(spec.id)}Input`;
    if (!byInstance.has(spec.input)) {
      registry.add(spec.input, { id: inputName });
      byInstance.set(spec.input, inputName);
    }
    inputs.set(spec.id, inputName);
    const outputName = byInstance.get(spec.output) ?? `${pascal(spec.id)}Output`;
    if (!byInstance.has(spec.output)) {
      registry.add(spec.output, { id: outputName });
      byInstance.set(spec.output, outputName);
    }
    outputs.set(spec.id, outputName);
  }
  const generated = z.toJSONSchema(registry, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
    uri,
  }) as { schemas: Record<string, JsonSchema> };
  const schemas: Record<string, JsonSchema> = {};
  for (const [id, schema] of Object.entries(generated.schemas)) {
    const { $schema: _dropped, id: _id, ...rest } = schema;
    schemas[id] = rest;
  }
  return {
    schemas,
    inputId: (id) => inputs.get(id) ?? `${pascal(id)}Input`,
    outputId: (id) => outputs.get(id) ?? `${pascal(id)}Output`,
  };
}
