// JSON Schema completion for the source drawer (SPEC 6.6): the slide schema from
// @turboslide/schema, turned into JSON Schema by Zod the way the contracts generator does it, is
// walked against the JSON path under the cursor to offer property names and values. The schema
// side is pure and unit tested in Node (schemasAt, propertyCompletions, valueCompletions); the
// editor side (jsonPathAt, schemaCompletionSource, rangeOfPointer) reads CodeMirror's syntax
// tree for the JSON grammar of @codemirror/lang-json.
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { z } from 'zod';

import { slideSchema } from '@turboslide/schema/deck';
import { getAt, parsePointer } from '@turboslide/schema/pointer';

export type JsonSchema = Record<string, unknown>;
export type PathSegment = string | number;

/** A node of the syntax tree, named through @codemirror/language so @lezer/common stays indirect. */
type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];

let slideRoot: JsonSchema | undefined;

/** The slide schema as JSON Schema draft 2020-12, generated once (the generator's own options). */
export function slideJsonSchema(): JsonSchema {
  slideRoot ??= z.toJSONSchema(slideSchema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema;
  return slideRoot;
}

function asSchema(value: unknown): JsonSchema | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonSchema)
    : undefined;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** Follows a local `$ref` (`#/$defs/name`) to its definition; other nodes come back unchanged. */
export function resolveRef(root: JsonSchema, node: JsonSchema): JsonSchema {
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#')) return node;
  const target = getAt(root, ref.slice(1));
  return asSchema(target) ?? node;
}

/** The literal values a schema node admits, or undefined when it is not a literal type. */
function literalsOf(node: JsonSchema): unknown[] | undefined {
  if ('const' in node) return [node.const];
  if (Array.isArray(node.enum)) return node.enum;
  return undefined;
}

/**
 * Flattens unions and references into the concrete object or primitive nodes at one level, and
 * drops the branches a present literal value contradicts (the `kind` of a slide, the `type` of a
 * block or a layout). When every branch is contradicted, all are kept: the document is mid-edit.
 */
export function expand(
  root: JsonSchema,
  nodes: ReadonlyArray<JsonSchema>,
  value: unknown,
): JsonSchema[] {
  const out: JsonSchema[] = [];
  const visit = (node: JsonSchema): void => {
    const resolved = resolveRef(root, node);
    const union = [resolved.oneOf, resolved.anyOf, resolved.allOf].find(Array.isArray);
    if (Array.isArray(union)) {
      for (const member of union) {
        const schema = asSchema(member);
        if (schema) visit(schema);
      }
      return;
    }
    out.push(resolved);
  };
  for (const node of nodes) visit(node);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  const record = value as Record<string, unknown>;
  const kept = out.filter((node) => {
    const properties = asSchema(node.properties);
    if (!properties) return true;
    for (const [key, present] of Object.entries(record)) {
      if (!isPrimitive(present)) continue;
      const property = asSchema(properties[key]);
      if (!property) continue;
      const literals = literalsOf(resolveRef(root, property));
      if (literals !== undefined && !literals.includes(present)) return false;
    }
    return true;
  });
  return kept.length > 0 ? kept : out;
}

/** The schema nodes that describe the value at a path in a document, in the document's terms. */
export function schemasAt(
  root: JsonSchema,
  path: ReadonlyArray<PathSegment>,
  value: unknown,
): JsonSchema[] {
  let nodes: JsonSchema[] = expand(root, [root], value);
  let current: unknown = value;
  for (const segment of path) {
    const next: JsonSchema[] = [];
    for (const node of nodes) {
      if (typeof segment === 'string') {
        const properties = asSchema(node.properties);
        const property = asSchema(properties?.[segment]);
        if (property) {
          next.push(property);
          continue;
        }
        const additional = asSchema(node.additionalProperties);
        if (additional) next.push(additional);
        const patterns = asSchema(node.patternProperties);
        for (const [pattern, schema] of Object.entries(patterns ?? {})) {
          const match = asSchema(schema);
          if (match && new RegExp(pattern).test(segment)) next.push(match);
        }
      } else {
        const prefix = Array.isArray(node.prefixItems)
          ? asSchema(node.prefixItems[segment])
          : undefined;
        if (prefix) {
          next.push(prefix);
          continue;
        }
        const items = asSchema(node.items);
        if (items) next.push(items);
      }
    }
    current =
      current !== null && typeof current === 'object'
        ? (current as Record<string, unknown>)[String(segment)]
        : undefined;
    nodes = expand(root, next, current);
    if (nodes.length === 0) return [];
  }
  return nodes;
}

/** A short type label for a property: `string`, `number`, `object`, `"h1" | "h2"`, `array`. */
export function typeLabel(root: JsonSchema, node: JsonSchema): string {
  const resolved = resolveRef(root, node);
  const literals = literalsOf(resolved);
  if (literals !== undefined) return literals.map((value) => JSON.stringify(value)).join(' | ');
  const union = [resolved.oneOf, resolved.anyOf].find(Array.isArray);
  if (Array.isArray(union)) {
    const parts = union.map((member) => {
      const schema = asSchema(member);
      return schema ? typeLabel(root, schema) : 'unknown';
    });
    return [...new Set(parts)].join(' | ');
  }
  const type = resolved.type;
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return type.join(' | ');
  return 'unknown';
}

export type PropertyCompletion = {
  label: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
};

/** The properties an object at a path may carry, merged across the branches the value admits. */
export function propertyCompletions(
  root: JsonSchema,
  path: ReadonlyArray<PathSegment>,
  value: unknown,
): PropertyCompletion[] {
  const seen = new Map<string, PropertyCompletion>();
  for (const node of schemasAt(root, path, value)) {
    const properties = asSchema(node.properties);
    if (!properties) continue;
    const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    for (const [key, raw] of Object.entries(properties)) {
      const property = asSchema(raw);
      if (!property || seen.has(key)) continue;
      const resolved = resolveRef(root, property);
      seen.set(key, {
        label: key,
        type: typeLabel(root, resolved),
        ...(typeof resolved.title === 'string' ? { title: resolved.title } : {}),
        ...(typeof resolved.description === 'string' ? { description: resolved.description } : {}),
        required: required.has(key),
      });
    }
  }
  return [...seen.values()];
}

export type ValueCompletion = { label: string; value: unknown; detail?: string };

/** The values a field at a path may take: its literals, booleans, or an empty object or array. */
export function valueCompletions(
  root: JsonSchema,
  path: ReadonlyArray<PathSegment>,
  value: unknown,
): ValueCompletion[] {
  const out = new Map<string, ValueCompletion>();
  const add = (candidate: unknown, detail?: string): void => {
    const label = JSON.stringify(candidate);
    if (!out.has(label)) out.set(label, { label, value: candidate, ...(detail ? { detail } : {}) });
  };
  for (const node of schemasAt(root, path, value)) {
    const literals = literalsOf(node);
    if (literals !== undefined) {
      for (const literal of literals)
        add(literal, typeof node.title === 'string' ? node.title : undefined);
      continue;
    }
    const type = node.type;
    if (type === 'boolean') {
      add(true);
      add(false);
    } else if (type === 'object') add({}, 'object');
    else if (type === 'array') add([], 'array');
    else if (type === 'string') add('', 'string');
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------------------------
// The editor side: the syntax tree of @codemirror/lang-json

const VALUE_NAMES = new Set(['Object', 'Array', 'String', 'Number', 'True', 'False', 'Null', '⚠']);

function textOf(state: EditorState, node: SyntaxNode): string {
  return state.sliceDoc(node.from, node.to);
}

/** The bare key of a property name token: `"key"` becomes `key`; an unfinished `"ke` becomes `ke`. */
function unquote(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw.replace(/^"/, '').replace(/"$/, '');
  }
}

/** The index of a value node among its Array parent's values. */
function indexIn(array: SyntaxNode, child: SyntaxNode): number {
  let index = 0;
  for (let node: SyntaxNode | null = array.firstChild; node !== null; node = node.nextSibling) {
    if (node.from === child.from && node.to === child.to) return index;
    if (VALUE_NAMES.has(node.name)) index += 1;
  }
  return index;
}

/** The JSON path from the document root to a value node (an Object, an Array or a scalar). */
function pathOf(state: EditorState, node: SyntaxNode): PathSegment[] {
  const path: PathSegment[] = [];
  let current: SyntaxNode = node;
  for (;;) {
    const parent = current.parent;
    if (parent === null || parent.name === 'JsonText') break;
    if (parent.name === 'Property') {
      const name = parent.firstChild;
      if (name !== null && name.name === 'PropertyName' && name.from !== current.from) {
        path.unshift(unquote(textOf(state, name)));
      }
      const object = parent.parent;
      if (object === null || object.name === 'JsonText') break;
      current = object;
      continue;
    }
    if (parent.name === 'Array') {
      path.unshift(indexIn(parent, current));
      current = parent;
      continue;
    }
    current = parent;
  }
  return path;
}

/** The value nodes before `pos` among an Array's children: the index a new value would take. */
function indexAt(array: SyntaxNode, pos: number): number {
  let index = 0;
  for (let node: SyntaxNode | null = array.firstChild; node !== null; node = node.nextSibling) {
    if (node.from >= pos) break;
    if (VALUE_NAMES.has(node.name)) index += 1;
  }
  return index;
}

/** The property names an Object already lists, so the completion does not offer them again. */
function keysOf(state: EditorState, object: SyntaxNode): string[] {
  const keys: string[] = [];
  for (let node: SyntaxNode | null = object.firstChild; node !== null; node = node.nextSibling) {
    if (node.name !== 'Property') continue;
    const name = node.firstChild;
    if (name !== null && name.name === 'PropertyName') keys.push(unquote(textOf(state, name)));
  }
  return keys;
}

export type JsonPosition = {
  /** the path of the object (for a name) or of the value slot (for a value) */
  path: PathSegment[];
  kind: 'name' | 'value';
  /** the range the completion replaces */
  from: number;
  to: number;
  /** a name typed inside quotes already, so the completion inserts the bare key */
  quoted: boolean;
  /** the keys the enclosing object already has (name positions) */
  siblings: string[];
};

/** Where the cursor stands in the JSON: a property name slot or a value slot, with its path. */
export function jsonPathAt(state: EditorState, pos: number): JsonPosition | null {
  const tree = syntaxTree(state);
  let node: SyntaxNode = tree.resolveInner(pos, -1);
  if (node.name === 'JsonText') node = tree.resolveInner(pos, 1);

  if (
    node.name === 'PropertyName' ||
    (node.name === 'String' &&
      node.parent?.name === 'Property' &&
      node.parent.firstChild?.from === node.from)
  ) {
    const property = node.parent;
    const object = property?.parent;
    if (!property || !object || object.name !== 'Object') return null;
    const raw = textOf(state, node);
    const quoted = raw.startsWith('"');
    const closed = quoted && raw.length > 1 && raw.endsWith('"');
    return {
      path: pathOf(state, object),
      kind: 'name',
      from: node.from + (quoted ? 1 : 0),
      to: closed ? node.to - 1 : node.to,
      quoted,
      siblings: keysOf(state, object).filter((key) => key !== unquote(raw)),
    };
  }

  if (node.name === 'Object') {
    return {
      path: pathOf(state, node),
      kind: 'name',
      from: pos,
      to: pos,
      quoted: false,
      siblings: keysOf(state, node),
    };
  }

  if (node.name === 'Property') {
    const name = node.firstChild;
    const object = node.parent;
    if (!name || !object) return null;
    if (pos <= name.to) {
      return {
        path: pathOf(state, object),
        kind: 'name',
        from: pos,
        to: pos,
        quoted: false,
        siblings: keysOf(state, object),
      };
    }
    return {
      path: [...pathOf(state, object), unquote(textOf(state, name))],
      kind: 'value',
      from: pos,
      to: pos,
      quoted: false,
      siblings: [],
    };
  }

  if (node.name === 'Array') {
    return {
      path: [...pathOf(state, node), indexAt(node, pos)],
      kind: 'value',
      from: pos,
      to: pos,
      quoted: false,
      siblings: [],
    };
  }

  if (VALUE_NAMES.has(node.name)) {
    const parent = node.parent;
    if (parent && parent.name === 'Object') {
      return {
        path: pathOf(state, parent),
        kind: 'name',
        from: node.from,
        to: node.to,
        quoted: false,
        siblings: keysOf(state, parent),
      };
    }
    return {
      path: pathOf(state, node),
      kind: 'value',
      from: node.from,
      to: node.to,
      quoted: false,
      siblings: [],
    };
  }

  return null;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** A CodeMirror completion source over a JSON Schema: property names in name slots, values in value slots. */
export function schemaCompletionSource(root: JsonSchema = slideJsonSchema()) {
  return (context: CompletionContext): CompletionResult | null => {
    const at = jsonPathAt(context.state, context.pos);
    if (at === null) return null;
    /* the whole document, when it parses, so unions resolve by their discriminators */
    const document = tryParse(context.state.doc.toString());
    if (at.kind === 'name') {
      const options: Completion[] = propertyCompletions(root, at.path, document)
        .filter((property) => !at.siblings.includes(property.label))
        .map((property) => ({
          label: property.label,
          type: 'property',
          detail: property.type,
          ...(property.description ? { info: property.description } : {}),
          apply: at.quoted ? property.label : `"${property.label}": `,
          boost: property.required ? 1 : 0,
        }));
      if (options.length === 0 || (at.from === at.to && !context.explicit && at.quoted))
        return null;
      return { from: at.from, to: at.to, options, validFor: /^[\w-]*$/ };
    }
    const options: Completion[] = valueCompletions(root, at.path, document).map((candidate) => ({
      label: candidate.label,
      type: 'constant',
      ...(candidate.detail ? { detail: candidate.detail } : {}),
      apply: candidate.label,
    }));
    if (options.length === 0) return null;
    return { from: at.from, to: at.to, options, validFor: /^[\w"'-]*$/ };
  };
}

/** The text range of the value a JSON pointer names, so an issue can be marked where it is. */
export function rangeOfPointer(
  state: EditorState,
  pointer: string,
): { from: number; to: number } | null {
  const tree = syntaxTree(state);
  const top: SyntaxNode | null = tree.topNode.firstChild;
  if (top === null) return null;
  let node: SyntaxNode = top;
  let segments: string[];
  try {
    segments = parsePointer(pointer);
  } catch {
    return null;
  }
  for (const segment of segments) {
    if (node.name === 'Object') {
      let found: SyntaxNode | null = null;
      for (
        let child: SyntaxNode | null = node.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (child.name !== 'Property') continue;
        const name = child.firstChild;
        if (name !== null && unquote(textOf(state, name)) === segment) {
          found = child;
          break;
        }
      }
      if (found === null) return { from: node.from, to: node.to };
      /* the property's value is its last value child; the pointer's end lands on the property */
      let value: SyntaxNode | null = null;
      for (
        let child: SyntaxNode | null = found.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (
          VALUE_NAMES.has(child.name) &&
          child.name !== 'PropertyName' &&
          child !== found.firstChild
        )
          value = child;
      }
      node = value ?? found;
      continue;
    }
    if (node.name === 'Array') {
      const index = Number(segment);
      let count = 0;
      let found: SyntaxNode | null = null;
      for (
        let child: SyntaxNode | null = node.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (!VALUE_NAMES.has(child.name)) continue;
        if (count === index) {
          found = child;
          break;
        }
        count += 1;
      }
      if (found === null) return { from: node.from, to: node.to };
      node = found;
      continue;
    }
    return { from: node.from, to: node.to };
  }
  return { from: node.from, to: node.to };
}
