// Migrations by schemaVersion (SPEC 4.4). Every slide file and the manifest carry schemaVersion,
// so one slide can be read, validated and migrated alone. A migration takes a raw document at
// version n and returns it at version n + 1; validateDeck runs the chain before parsing and
// reports a `migrated` issue at severity 1 so the writer knows the file will change on save.
// Version 0 is the unversioned form (no schemaVersion field); the only migration today stamps it.
//
// RELIABILITY-19 (hardening HR-O#5): a rollback reads what the release after it wrote. A field a
// release adds raises the minor (deck.ts SCHEMA_MINOR) and is stamped as `schemaMinor` on the
// files that release writes. `parseTolerant` reads such a file by keeping the fields this release
// does not know and writing them back where they stood, so the bytes round trip; a file of this
// release's own minor keeps the strict schema, so a typo is still an `unknown_field`. A file of a
// newer major (a renamed or removed field) is refused with `upgrade_pending`. The mutations a
// version record holds carry slides, so they take the same chain (`migrateMutations`).
import type { z } from 'zod';

import type { Slide } from './deck.ts';
import { SCHEMA_MINOR, SCHEMA_VERSION, slideSchema } from './deck.ts';
import { joinPointer } from './pointer.ts';

export type MigrationTarget = 'deck' | 'slide';

export type Migration = {
  from: number;
  to: number;
  /** One sentence for the issue message and the docs. */
  note: string;
  deck: (raw: Record<string, unknown>) => Record<string, unknown>;
  slide: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export const CURRENT_SCHEMA_VERSION: number = SCHEMA_VERSION;
export const CURRENT_SCHEMA_MINOR: number = SCHEMA_MINOR;

const stamp = (raw: Record<string, unknown>): Record<string, unknown> => {
  const { schemaVersion: _dropped, ...rest } = raw;
  return { schemaVersion: 1, ...rest };
};

export const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    from: 0,
    to: 1,
    note: 'stamps schemaVersion 1 on a file written before the field existed',
    deck: stamp,
    slide: stamp,
  },
];

export type MigrationResult = {
  value: Record<string, unknown>;
  /** The versions the document passed through: [] when it was already current. */
  applied: number[];
  /** Set when the document claims a version newer than this package knows. */
  ahead?: number;
};

function readVersion(raw: Record<string, unknown>): number {
  const value = raw.schemaVersion;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** The minor a file was written at: its `schemaMinor` when that is an integer above 0, else 0. */
export function readMinor(raw: Record<string, unknown>): number {
  const value = raw.schemaMinor;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Runs the migration chain on a raw manifest or slide up to the current version. */
export function migrate(raw: Record<string, unknown>, target: MigrationTarget): MigrationResult {
  let value = raw;
  let version = readVersion(raw);
  const applied: number[] = [];
  if (version > CURRENT_SCHEMA_VERSION) return { value, applied, ahead: version };
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((migration) => migration.from === version);
    if (step === undefined) break;
    value = step[target](value);
    version = step.to;
    applied.push(version);
  }
  return { value, applied };
}

/**
 * The documents chain over a list of raw mutations, as a version record stores them: the slide
 * of a `slide.insert` or a `slide.replace` is migrated like a slide file, so a record written
 * before a migration replays after it. Every other entry, and a value that is not a list, comes
 * back as it is for the schema to judge. The input is never changed in place.
 */
export function migrateMutations(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((mutation: unknown) => {
    if (!isRecord(mutation) || !isRecord(mutation.slide)) return mutation;
    if (mutation.op !== 'slide.insert' && mutation.op !== 'slide.replace') return mutation;
    const migrated = migrate(mutation.slide, 'slide');
    return migrated.applied.length === 0 ? mutation : { ...mutation, slide: migrated.value };
  });
}

/**
 * The slide a `slide.insert` or a `slide.replace` carries, read the way a slide file is: the
 * chain first, then the schema, keeping the fields of a newer minor. The reducer's one parse of a
 * slide, so the undo of a removal and the restore of a version replay a slide a newer release
 * wrote after a rollback.
 */
export function parseMutationSlide(raw: unknown): TolerantParse<Slide> {
  return parseTolerant(slideSchema, isRecord(raw) ? migrate(raw, 'slide').value : raw);
}

/** A field kept from a newer minor: where it was, as a JSON pointer, and the minor that wrote it. */
export type KeptField = { pointer: string; minor: number };

export type TolerantParse<T> =
  { success: true; data: T; kept: KeptField[] } | { success: false; error: z.ZodError };

type Path = ReadonlyArray<string | number>;
type Unknown = { path: Path; keys: string[]; minor: number };

function childOf(value: unknown, segment: string | number): unknown {
  if (Array.isArray(value)) return typeof segment === 'number' ? value[segment] : undefined;
  return isRecord(value) ? value[String(segment)] : undefined;
}

function at(value: unknown, path: Path): unknown {
  let node = value;
  for (const segment of path) node = childOf(node, segment);
  return node;
}

/**
 * The minor that governs the object at `path`: the `schemaMinor` of the nearest object on the
 * way down from the root that carries one (a slide inside a record's mutation answers for itself).
 */
function minorAt(root: unknown, path: Path): number {
  let node = root;
  let minor = isRecord(node) ? readMinor(node) : 0;
  for (const segment of path) {
    node = childOf(node, segment);
    if (isRecord(node) && 'schemaMinor' in node) minor = readMinor(node);
  }
  return minor;
}

/**
 * The unknown keys of a failed parse when every issue is one and each lies in an object of a
 * minor above this release's, else null (the failure stands as it is).
 */
function newerFields(root: unknown, error: z.ZodError): Unknown[] | null {
  const out: Unknown[] = [];
  for (const issue of error.issues) {
    if (issue.code !== 'unrecognized_keys') return null;
    const path: (string | number)[] = [];
    for (const segment of issue.path) {
      if (typeof segment === 'symbol') return null;
      path.push(segment);
    }
    if (!isRecord(at(root, path))) return null;
    const minor = minorAt(root, path);
    if (minor <= CURRENT_SCHEMA_MINOR) return null;
    out.push({ path, keys: [...issue.keys], minor });
  }
  return out;
}

/**
 * Parses `value` with `schema`; a value of a newer minor whose only faults are fields this
 * release does not know is parsed without them, and the fields are put back on the parsed
 * value in the places and the key order they had, so a canonical file written by the newer
 * release serializes to the same bytes (RELIABILITY-19). Anything else fails as `safeParse` does.
 */
export function parseTolerant<T>(schema: z.ZodType<T>, value: unknown): TolerantParse<T> {
  const first = schema.safeParse(value);
  if (first.success) return { success: true, data: first.data, kept: [] };
  const fields = newerFields(value, first.error);
  if (fields === null || fields.length === 0) return { success: false, error: first.error };
  const stripped = structuredClone(value);
  for (const field of fields) {
    const object = at(stripped, field.path) as Record<string, unknown>;
    for (const key of field.keys) delete object[key];
  }
  const second = schema.safeParse(stripped);
  if (!second.success) return { success: false, error: second.error };
  let data: unknown = second.data;
  const kept: KeptField[] = [];
  // the deepest objects first, so an object rebuilt above them takes the rebuilt child
  const order = [...fields].sort((a, b) => b.path.length - a.path.length);
  for (const field of order) {
    const original = at(value, field.path) as Record<string, unknown>;
    const parsed = at(data, field.path);
    if (!isRecord(parsed)) continue;
    const unknown = new Set(field.keys);
    const rebuilt: Record<string, unknown> = {};
    for (const key of Object.keys(original)) {
      if (unknown.has(key)) rebuilt[key] = structuredClone(original[key]);
      else if (key in parsed) rebuilt[key] = parsed[key];
    }
    for (const key of Object.keys(parsed)) if (!(key in rebuilt)) rebuilt[key] = parsed[key];
    const parentPath = field.path.slice(0, -1);
    const last = field.path.at(-1);
    if (last === undefined) data = rebuilt;
    else {
      const parent = at(data, parentPath);
      if (Array.isArray(parent) && typeof last === 'number') parent[last] = rebuilt;
      else if (isRecord(parent)) parent[String(last)] = rebuilt;
      else continue;
    }
    for (const key of field.keys)
      kept.push({ pointer: joinPointer([...field.path, key]), minor: field.minor });
  }
  kept.sort((a, b) => (a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0));
  return { success: true, data: data as T, kept };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
