// The inspector's control generation (SPEC 6.5): the controls for a slide or a block come from
// the Zod schema's inspector annotations, never from a hand-written form per block. The rules of
// SPEC 6.5 are applied to the annotation and the field's type together: a z.enum (or a literal
// set) with four or fewer options becomes a Seg, more a select; a number with a snap becomes a
// stepper through the set, and so does a numeric snap set with more options than a Seg holds
// (the key widths); a boolean a check row; a Text a textarea in the inline markup; an Icon
// the sprite picker; an AssetId the asset picker. Every control carries the accessible label
// `<block id>: <property label>` and the locale-independent data-control id `block.<id>.<path>`
// the window API matches (SPEC 6.5, 7.4). Pure: no React, so it is unit tested in Node.
import type { z } from 'zod';

import type { Inspector, InspectorGroup } from '@turboslide/schema/annotate';
import { readInspector } from '@turboslide/schema/annotate';
import type { Block } from '@turboslide/schema/blocks';
import { BLOCK_SCHEMAS } from '@turboslide/schema/blocks';
import { CATALOG, SLIDE_KIND_CATALOG, expandPaths } from '@turboslide/schema/catalog';
import type { Slide } from '@turboslide/schema/deck';
import { SLIDE_SCHEMAS } from '@turboslide/schema/deck';
import { getAt } from '@turboslide/schema/pointer';

/** How a control is drawn (InspectorControl.tsx switches on it). */
export type ControlKind =
  | 'seg'
  | 'select'
  | 'stepper'
  | 'number'
  | 'check'
  | 'text'
  | 'textarea'
  | 'icon'
  | 'asset'
  | 'json'
  | 'readonly';

export type ControlOption = string | number;

export type ControlSpec = {
  /** the data-control id: `block.list.size`, `slide.layout.ratio` */
  control: string;
  /** the accessible label: `list: Size`, `layout: Ratio` */
  label: string;
  /** JSON pointer relative to the target object: `/size`, `/items/0/key` */
  path: string;
  kind: ControlKind;
  /** the annotation as written on the schema */
  inspector: Inspector;
  group: InspectorGroup;
  /** a seg's, select's or stepper's values */
  options?: ReadonlyArray<ControlOption>;
  /** the current value at `path`, undefined when the field is absent */
  value: unknown;
  /** the field may be deleted (an absent value removes it, SPEC 4.2 slide.set) */
  optional: boolean;
  /** true for a field in the four-rule markup (the catalog's text paths), which gets the copy lint */
  text: boolean;
  /** the field's schema without its optional wrapper, for validation before a write */
  schema: z.ZodType;
};

/** An array of objects on the target, so the inspector can add and remove items. */
export type ArraySpec = {
  control: string;
  label: string;
  path: string;
  length: number;
  /** a valid blank element, appended by Add */
  blank: () => unknown;
  minItems: number;
};

export type ControlTarget = {
  /** the label prefix: the block id, `slide` or `layout` */
  noun: string;
  /** the data-control prefix: `block.list`, `slide` */
  control: string;
};

export type GenerateOptions = {
  /** values for a select whose annotation carries no snap, by pointer (`/sectionId`) */
  optionsAt?: Readonly<Record<string, ReadonlyArray<ControlOption>>>;
  /** the target's Text pointers (the catalog's text paths, expanded) */
  textPaths?: ReadonlyArray<string>;
};

export type Generated = { controls: ControlSpec[]; arrays: ArraySpec[] };

/** Segs hold this many options at most; more become a select (SPEC 6.5). */
export const SEG_MAX = 4;

type Def = { type: string };

function defOf(schema: z.ZodType): Def {
  return schema.def;
}

/** Strips optional, nullable, default and lazy wrappers; reports whether one was optional. */
export function unwrap(schema: z.ZodType): { inner: z.ZodType; optional: boolean } {
  let inner = schema;
  let optional = false;
  for (;;) {
    const type = defOf(inner).type;
    if (type === 'optional' || type === 'nullable' || type === 'default') {
      optional = optional || type === 'optional' || type === 'nullable';
      inner = (inner as z.ZodOptional).unwrap() as z.ZodType;
      continue;
    }
    if (type === 'lazy') {
      inner = (inner as z.ZodLazy).unwrap() as z.ZodType;
      continue;
    }
    return { inner, optional };
  }
}

/** The values a literal set or an enum accepts, or undefined for any other type. */
export function literalValues(schema: z.ZodType): ControlOption[] | undefined {
  const type = defOf(schema).type;
  if (type === 'enum') {
    return (schema as z.ZodEnum).options.filter(
      (value): value is ControlOption => typeof value === 'string' || typeof value === 'number',
    );
  }
  if (type === 'literal') {
    return [...(schema as z.ZodLiteral).values].filter(
      (value): value is ControlOption => typeof value === 'string' || typeof value === 'number',
    );
  }
  if (type === 'union') {
    const parts = (schema as z.ZodUnion).options.map((option) =>
      literalValues(option as z.ZodType),
    );
    if (parts.every((part) => part !== undefined)) return parts.flat();
  }
  return undefined;
}

function isObject(schema: z.ZodType): schema is z.ZodObject {
  return defOf(schema).type === 'object';
}

function isArray(schema: z.ZodType): schema is z.ZodArray {
  return defOf(schema).type === 'array';
}

function isUnion(schema: z.ZodType): schema is z.ZodUnion {
  return defOf(schema).type === 'union';
}

/** An object whose `name` is annotated as an icon: the Icon composite (name plus tone). */
function isIconObject(schema: z.ZodType): schema is z.ZodObject {
  if (!isObject(schema)) return false;
  const name = schema.shape.name;
  return name !== undefined && readInspector(name as z.ZodType)?.control === 'icon';
}

/** A valid blank value for a schema: required fields filled with their first or emptiest value. */
export function blankOf(schema: z.ZodType): unknown {
  const { inner, optional } = unwrap(schema);
  if (optional) return undefined;
  const values = literalValues(inner);
  if (values !== undefined) return values[0];
  switch (defOf(inner).type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array': {
      const array = inner as z.ZodArray;
      const min = minLength(array);
      const element = array.element as z.ZodType;
      return Array.from({ length: min }, () => blankOf(element));
    }
    case 'tuple':
      return ((inner as z.ZodTuple).def.items as z.ZodType[]).map((item) => blankOf(item));
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries((inner as z.ZodObject).shape)) {
        const value = blankOf(field as z.ZodType);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    case 'union': {
      const first = (inner as z.ZodUnion).options[0];
      return first === undefined ? undefined : blankOf(first as z.ZodType);
    }
    case 'record':
      return {};
    default:
      return undefined;
  }
}

/** The `.min(n)` of an array schema, read from its checks; 0 when none. */
function minLength(schema: z.ZodArray): number {
  const checks = (
    schema.def as { checks?: ReadonlyArray<{ _zod: { def: { check: string; minimum?: number } } }> }
  ).checks;
  for (const check of checks ?? []) {
    const def = check._zod.def;
    if (def.check === 'min_length' && typeof def.minimum === 'number') return def.minimum;
  }
  return 0;
}

function pointerJoin(base: string, key: string | number): string {
  return `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function controlId(target: ControlTarget, path: string): string {
  const segments = path.split('/').slice(1);
  return [target.control, ...segments].join('.');
}

function labelFor(target: ControlTarget, label: string, suffix: string): string {
  return `${target.noun}: ${label}${suffix}`;
}

/** The kind SPEC 6.5 assigns to an annotated field, from the annotation and the type together. */
export function kindFor(
  inspector: Inspector,
  inner: z.ZodType,
  options: ReadonlyArray<ControlOption> | undefined,
): ControlKind {
  switch (inspector.control) {
    case 'readonly':
      return 'readonly';
    case 'toggle':
      return 'check';
    case 'icon':
      return 'icon';
    case 'asset':
      return 'asset';
    case 'json':
      return 'json';
    case 'textarea':
      return 'textarea';
    case 'number':
      return inspector.snap !== undefined ? 'stepper' : 'number';
    case 'select': {
      if (options === undefined) return 'select';
      if (options.length <= SEG_MAX) return 'seg';
      /* a numeric snap set past a Seg's size steps through the set (SPEC 6.5: the key widths
         90 to 300), whatever the annotation names */
      const numeric =
        inspector.snap !== undefined && options.every((option) => typeof option === 'number');
      return numeric ? 'stepper' : 'select';
    }
    case 'text':
    case 'color':
      break;
  }
  const type = defOf(inner).type;
  if (type === 'boolean') return 'check';
  if (options !== undefined) return options.length <= SEG_MAX ? 'seg' : 'select';
  if (type === 'number') return inspector.snap !== undefined ? 'stepper' : 'number';
  return 'text';
}

/**
 * Walks a schema against a value and emits one control per annotated field, descending into
 * nested objects, unions (the branch the value's discriminator picks, plus a control for the
 * discriminator itself) and arrays (one control per item, labelled with its number).
 */
function walk(
  schema: z.ZodType,
  value: unknown,
  path: string,
  suffix: string,
  target: ControlTarget,
  options: GenerateOptions,
  out: Generated,
): void {
  const { inner, optional } = unwrap(schema);
  const inspector = readInspector(schema) ?? readInspector(inner);

  if (isIconObject(inner)) {
    const name = inner.shape.name as z.ZodType;
    const nameInspector = readInspector(name);
    out.controls.push({
      control: controlId(target, path),
      label: labelFor(target, nameInspector?.label ?? 'Icon', suffix),
      path,
      kind: 'icon',
      inspector: nameInspector ?? { label: 'Icon', control: 'icon' },
      group: nameInspector?.group ?? 'Block',
      value,
      optional,
      text: false,
      schema: inner,
    });
    return;
  }

  if (inspector !== undefined) {
    const values =
      inspector.snap ??
      options.optionsAt?.[path] ??
      (inspector.control === 'json' ? undefined : literalValues(inner));
    out.controls.push({
      control: controlId(target, path),
      label: labelFor(target, inspector.label, suffix),
      path,
      kind: kindFor(inspector, inner, values),
      inspector,
      group: inspector.group ?? 'Block',
      ...(values !== undefined ? { options: values } : {}),
      value,
      optional,
      text: options.textPaths?.includes(path) ?? false,
      schema: inner,
    });
    return;
  }

  if (isObject(inner)) {
    const record = value as Record<string, unknown> | undefined;
    for (const [key, field] of Object.entries(inner.shape)) {
      walk(field as z.ZodType, record?.[key], pointerJoin(path, key), suffix, target, options, out);
    }
    return;
  }

  if (isUnion(inner)) {
    const branches = inner.options as ReadonlyArray<z.ZodType>;
    const discriminator = (inner.def as { discriminator?: string }).discriminator;
    if (discriminator !== undefined && value !== null && typeof value === 'object') {
      const current = (value as Record<string, unknown>)[discriminator];
      const choices: ControlOption[] = [];
      let picked: z.ZodType | undefined;
      for (const branch of branches) {
        const { inner: branchInner } = unwrap(branch);
        if (!isObject(branchInner)) continue;
        const tag = branchInner.shape[discriminator];
        const tagValues = tag === undefined ? undefined : literalValues(tag as z.ZodType);
        if (tagValues === undefined) continue;
        choices.push(...tagValues);
        if (tagValues.includes(current as ControlOption)) picked = branchInner;
      }
      const tagPath = pointerJoin(path, discriminator);
      out.controls.push({
        control: controlId(target, tagPath),
        label: labelFor(target, capitalize(discriminator), suffix),
        path,
        kind: choices.length <= SEG_MAX ? 'seg' : 'select',
        inspector: { label: capitalize(discriminator), control: 'select', snap: choices },
        group: 'Layout',
        options: choices,
        value: current,
        optional: false,
        text: false,
        schema: inner,
      });
      if (picked !== undefined) walk(picked, value, path, suffix, target, options, out);
    }
    return;
  }

  if (isArray(inner)) {
    const items = Array.isArray(value) ? value : [];
    const element = unwrap(inner.element as z.ZodType).inner;
    const elementInspector = readInspector(inner.element as z.ZodType) ?? readInspector(element);
    if (isObject(element) && !isIconObject(element) && elementInspector === undefined) {
      const name = path.split('/').pop() ?? 'items';
      out.arrays.push({
        control: controlId(target, path),
        label: labelFor(target, capitalize(name), suffix),
        path,
        length: items.length,
        blank: () => blankOf(element),
        minItems: minLength(inner),
      });
    }
    items.forEach((item, index) => {
      walk(
        inner.element as z.ZodType,
        item,
        pointerJoin(path, index),
        ` ${index + 1}`,
        target,
        options,
        out,
      );
    });
  }
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The controls an object schema yields against a value; the root fields are the target's own. */
export function controlsFor(
  schema: z.ZodType,
  value: unknown,
  target: ControlTarget,
  options: GenerateOptions = {},
): Generated {
  const out: Generated = { controls: [], arrays: [] };
  const { inner } = unwrap(schema);
  if (!isObject(inner)) return out;
  const record = value as Record<string, unknown>;
  for (const [key, field] of Object.entries(inner.shape)) {
    walk(field as z.ZodType, record[key], pointerJoin('', key), '', target, options, out);
  }
  return out;
}

/** Fields the inspector never draws as controls: the identity and the escape hatch. */
const BLOCK_SKIP = new Set(['/id', '/type', '/ext']);
const SLIDE_SKIP = new Set(['/id', '/ext']);

/** The controls of a block, labelled `<block id>: <label>` with data-control `block.<id>.<path>`. */
export function blockControls(block: Block): Generated {
  const schema = BLOCK_SCHEMAS[block.type];
  const generated = controlsFor(
    schema,
    block,
    { noun: block.id, control: `block.${block.id}` },
    {
      textPaths: CATALOG[block.type].textPaths.flatMap((template) => expandPaths(block, template)),
    },
  );
  generated.controls = generated.controls.filter((spec) => !BLOCK_SKIP.has(spec.path));
  return generated;
}

/**
 * The controls of a slide's own fields: the Slide group (title override, notes, tags, the
 * section of an opener, the title and statement texts) and the Layout group (layout, plate,
 * picture, mark, measure), labelled `slide: <label>` with data-control `slide.<path>`.
 */
export function slideControls(
  slide: Slide,
  sections: ReadonlyArray<{ id: string; name: string }> = [],
): Generated {
  const schema = SLIDE_SCHEMAS[slide.kind];
  const generated = controlsFor(
    schema,
    slide,
    { noun: 'slide', control: 'slide' },
    {
      optionsAt: { '/sectionId': sections.map((section) => section.id) },
      textPaths: SLIDE_KIND_CATALOG[slide.kind].textPaths.flatMap((template) =>
        expandPaths(slide, template),
      ),
    },
  );
  generated.controls = generated.controls.filter(
    (spec) =>
      !SLIDE_SKIP.has(spec.path) &&
      !spec.path.startsWith('/slots') &&
      !spec.path.startsWith('/plate/blocks'),
  );
  return generated;
}

/** The value a spec reads on its target now (after a write the target is re-read anyway). */
export function valueAt(target: unknown, spec: ControlSpec): unknown {
  return getAt(target, spec.path);
}
