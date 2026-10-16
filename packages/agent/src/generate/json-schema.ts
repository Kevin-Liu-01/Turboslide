// Shared JSON Schema helpers for the generators: one way to turn a Zod schema into JSON Schema
// (draft 2020-12, the inspector annotations kept as title, description and x-inspector), and a
// reader that summarizes a schema's properties for the docs tables.
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

/* One conversion per schema: the CLI, llms-full, the skill and docs references each read every
   action's input, and z.toJSONSchema was three quarters of a generateAll run. */
const converted = new WeakMap<z.ZodType, Readonly<JsonSchema>>();

/** The JSON Schema of a Zod schema, converted once and shared; callers read it and never write. */
export function toJsonSchema(schema: z.ZodType): Readonly<JsonSchema> {
  let json = converted.get(schema);
  if (json === undefined) {
    json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
    converted.set(schema, json);
  }
  return json;
}

export type PropertySummary = {
  name: string;
  type: string;
  required: boolean;
  title?: string;
  description?: string;
  enumValues?: ReadonlyArray<string | number | boolean>;
};

function asRecord(value: unknown): JsonSchema | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonSchema)
    : undefined;
}

/** An object schema with named properties: a member a union can name by its fields. */
function shapedObject(node: JsonSchema): boolean {
  const properties = asRecord(node.properties);
  return properties !== undefined && Object.keys(properties).length > 0;
}

/** The one value a property schema allows (`const`, or an enum of one), or undefined. */
function constOf(node: JsonSchema | undefined): unknown {
  if (node === undefined) return undefined;
  if (node.const !== undefined) return node.const;
  return Array.isArray(node.enum) && node.enum.length === 1 ? node.enum[0] : undefined;
}

/**
 * The property that tells a union's object members apart: one every member has with a single
 * value of its own (`kind` of a slide, `op` of a mutation, `type` of a layout), or undefined.
 */
function discriminatorOf(members: readonly JsonSchema[]): string | undefined {
  const first = asRecord(members[0]?.properties) ?? {};
  return Object.keys(first).find((key) => {
    const values = members.map((member) => constOf(asRecord(asRecord(member.properties)?.[key])));
    if (values.some((value) => value === undefined)) return false;
    return new Set(values.map((value) => JSON.stringify(value))).size === values.length;
  });
}

/**
 * The labels of a union's members, each named rather than read as 'object' (the post-deploy
 * review: "object | object | object" told the reader nothing): an object member by its title;
 * the object members of a discriminated union as one label naming each member's value of the
 * discriminator (`{ kind: "content" | "opener" }`); any other object member by its required keys
 * (`{ principalId }`); every other member by its own label.
 */
function unionLabels(members: readonly JsonSchema[], defs: JsonSchema): string[] {
  const objects = members.filter(shapedObject);
  const titled = objects.every((member) => typeof member.title === 'string');
  const key = objects.length >= 2 && !titled ? discriminatorOf(objects) : undefined;
  const labels: string[] = [];
  let grouped = false;
  for (const member of members) {
    if (!shapedObject(member)) {
      labels.push(typeLabel(member, defs));
      continue;
    }
    if (typeof member.title === 'string') {
      labels.push(member.title);
      continue;
    }
    if (key !== undefined) {
      if (grouped) continue;
      grouped = true;
      const values = objects.map((each) =>
        JSON.stringify(constOf(asRecord(asRecord(each.properties)?.[key]))),
      );
      labels.push(`{ ${key}: ${values.join(' | ')} }`);
      continue;
    }
    const required = (member.required as string[] | undefined) ?? [];
    const keys = required.length > 0 ? required : Object.keys(asRecord(member.properties) ?? {});
    labels.push(`{ ${keys.join(', ')} }`);
  }
  return labels;
}

/** A label with a union at its top level (outside braces), which an array's [] would misread. */
function topLevelUnion(label: string): boolean {
  let depth = 0;
  for (let at = 0; at < label.length; at += 1) {
    const char = label[at];
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') depth -= 1;
    else if (char === '|' && depth === 0) return true;
  }
  return false;
}

/**
 * A short type label for a JSON Schema node: 'string', 'integer', 'string[]', '"a" | "b"',
 * '{ kind: "content" | "opener" }', '{ principalId } | { email }', 'object'.
 */
export function typeLabel(node: JsonSchema | undefined, defs: JsonSchema = {}): string {
  if (node === undefined) return 'unknown';
  const ref = node.$ref;
  if (typeof ref === 'string') return ref.split('/').pop() ?? 'ref';
  if (Array.isArray(node.enum)) return node.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (node.const !== undefined) return JSON.stringify(node.const);
  const union = (node.anyOf ?? node.oneOf) as unknown[] | undefined;
  if (Array.isArray(union)) {
    const members = union.map(asRecord).filter((member) => member !== undefined);
    return unionLabels(members, defs).join(' | ');
  }
  const type = node.type;
  if (type === 'array') {
    const items = asRecord(node.items);
    const prefix = node.prefixItems as unknown[] | undefined;
    if (Array.isArray(prefix))
      return `[${prefix.map((member) => typeLabel(asRecord(member), defs)).join(', ')}]`;
    const label = typeLabel(items, defs);
    return topLevelUnion(label) ? `(${label})[]` : `${label}[]`;
  }
  if (type === 'object') {
    const properties = asRecord(node.properties);
    if (properties !== undefined && Object.keys(properties).length > 0) return 'object';
    return 'record';
  }
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return type.join(' | ');
  return 'unknown';
}

/** The properties of an object schema, in declaration order, with the annotation fields. */
export function summarizeProperties(schema: JsonSchema): PropertySummary[] {
  const properties = asRecord(schema.properties) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const defs = asRecord(schema.$defs) ?? {};
  return Object.entries(properties).map(([name, value]) => {
    const node = asRecord(value) ?? {};
    const summary: PropertySummary = {
      name,
      type: typeLabel(node, defs),
      required: required.has(name),
    };
    if (typeof node.title === 'string') summary.title = node.title;
    if (typeof node.description === 'string') summary.description = node.description;
    if (Array.isArray(node.enum))
      summary.enumValues = node.enum as ReadonlyArray<string | number | boolean>;
    return summary;
  });
}

/** Stable JSON: two-space indent, trailing newline (SPEC 4.1's canonical form). */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * A markdown table from a header and rows; pipes in cells are escaped and columns are padded to
 * their widest cell, the form prettier writes, so the generated files pass prettier --check.
 */
export function markdownTable(
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  const escape = (cell: string): string => cell.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const table = [header, ...rows].map((cells) => cells.map(escape));
  const widths = header.map((_, column) =>
    Math.max(3, ...table.map((cells) => (cells[column] ?? '').length)),
  );
  const line = (cells: ReadonlyArray<string>): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 3)).join(' | ')} |`;
  const rule = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  const [head, ...body] = table;
  return [line(head ?? []), rule, ...body.map(line)].join('\n');
}
