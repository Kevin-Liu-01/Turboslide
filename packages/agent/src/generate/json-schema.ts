// Shared JSON Schema helpers for the generators: one way to turn a Zod schema into JSON Schema
// (draft 2020-12, the inspector annotations kept as title, description and x-inspector), and a
// reader that summarizes a schema's properties for the docs tables.
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
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

/** A short type label for a JSON Schema node: 'string', 'integer', 'string[]', 'one of …', 'object'. */
export function typeLabel(node: JsonSchema | undefined, defs: JsonSchema = {}): string {
  if (node === undefined) return 'unknown';
  const ref = node.$ref;
  if (typeof ref === 'string') return ref.split('/').pop() ?? 'ref';
  if (Array.isArray(node.enum)) return node.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (node.const !== undefined) return JSON.stringify(node.const);
  const union = (node.anyOf ?? node.oneOf) as unknown[] | undefined;
  if (Array.isArray(union)) {
    return union.map((member) => typeLabel(asRecord(member), defs)).join(' | ');
  }
  const type = node.type;
  if (type === 'array') {
    const items = asRecord(node.items);
    const prefix = node.prefixItems as unknown[] | undefined;
    if (Array.isArray(prefix))
      return `[${prefix.map((member) => typeLabel(asRecord(member), defs)).join(', ')}]`;
    return `${typeLabel(items, defs)}[]`;
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
