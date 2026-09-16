// The version log under decks/<id>/versions/ (SPEC 4.1 "versions/<n>.json", 6.7): one file per
// committed write and per named save, numbered from 1. A file is a Version plus baseRevision and
// the inverse mutations, so the document at any entry is rebuilt from the current one by applying
// the inverses of the later entries in reverse order (SPEC 6.7: undo is a forward application of
// the inverse). No snapshot is stored; the chain must be contiguous from the entry to the head.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import type { Version } from '@turboslide/schema/mutations';
import { mutationSchema, versionSchema } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { validateDocument } from '@turboslide/schema/validate';

import type { VersionRecord } from './store.ts';

export const VERSIONS_DIR = 'versions';

/** The operation stream range a checkpoint coalesced (gslides-parity SPEC-3 2.1, 0.3). */
export type OpsRange = { fromSeq: number; toSeq: number };

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** `{ fromSeq, toSeq }` with two non negative integers in order and nothing else. */
export function isOpsRange(value: unknown): value is OpsRange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !('fromSeq' in value) || !('toSeq' in value)) return false;
  const range = value as { fromSeq: unknown; toSeq: unknown };
  return (
    isNonNegativeInt(range.fromSeq) && isNonNegativeInt(range.toSeq) && range.toSeq >= range.fromSeq
  );
}

// `slide.set`'s `value` is the one optional unknown the schema package exposes; the range check
// above makes it the ops range without this package taking a zod dependency of its own.
type SlideSetOption = (typeof mutationSchema.options)[3];
const slideSet = mutationSchema.options.find(
  (option): option is SlideSetOption => option.shape.op.value === 'slide.set',
);
if (slideSet === undefined) throw new Error('mutationSchema has no slide.set option');
const opsRangeSchema = slideSet.shape.value.refine(
  (value) => value === undefined || isOpsRange(value),
  'ops names { fromSeq, toSeq }, two integers in order (gslides-parity SPEC-3 2.1)',
);

// Built from the schema package's own pieces so this package adds no schema dependency: the
// revision schema doubles as baseRevision and the mutation list as the inverse list. `extend` on
// a strict object stays strict (a test pins it).
export const versionRecordSchema = versionSchema.extend({
  baseRevision: versionSchema.shape.revision,
  inverse: mutationSchema.array(),
  // the Blob snapshot key of gslides-parity SPEC-2 8.2: optional, so every record written before
  // the round and every file or tmp store record still parses
  snapshot: versionSchema.shape.note.regex(/^[0-9a-f]{32}$/).optional(),
  // the operation stream range a checkpoint coalesced (gslides-parity SPEC-3 2.1): optional, so
  // every record written outside the room and before the round still parses
  ops: opsRangeSchema,
  // the writing tab and its batch (gslides-parity SPEC-5-amendments A3 items 5 and 6; B7):
  // optional, so every record written outside the room and before round five still parses
  clientId: versionSchema.shape.note.min(1).max(64).optional(),
  opIds: versionSchema.shape.note.min(1).max(64).array().max(64).optional(),
});

/** A parsed record with `ops` narrowed to the range the schema's refinement proved. */
function asRecord(parsed: ReturnType<typeof versionRecordSchema.parse>): VersionRecord {
  const { ops, ...rest } = parsed;
  return isOpsRange(ops) ? { ...rest, ops } : rest;
}

export function versionPath(dir: string, n: number): string {
  return join(dir, VERSIONS_DIR, `${n}.json`);
}

/** Every entry under versions/, sorted by n; a file that is not a record is a TypeError. */
export function readVersions(dir: string): VersionRecord[] {
  const folder = join(dir, VERSIONS_DIR);
  if (!existsSync(folder)) return [];
  const records: VersionRecord[] = [];
  for (const name of readdirSync(folder)) {
    const match = /^(\d+)\.json$/.exec(name);
    if (match === null) continue;
    const file = join(folder, name);
    const parsed = versionRecordSchema.safeParse(parseJson(readFileSync(file, 'utf8'), file));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new TypeError(
        `${file} is not a version record at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
      );
    }
    if (parsed.data.n !== Number(match[1])) {
      throw new TypeError(`${file} carries n ${parsed.data.n}; the file name says ${match[1]}`);
    }
    records.push(asRecord(parsed.data));
  }
  return records.sort((a, b) => a.n - b.n);
}

export function writeVersion(dir: string, record: VersionRecord): string {
  const path = versionPath(dir, record.n);
  mkdirSync(join(dir, VERSIONS_DIR), { recursive: true });
  writeFileSync(path, canonicalJson(versionRecordSchema.parse(record)));
  return path;
}

export function nextVersionNumber(records: ReadonlyArray<VersionRecord>): number {
  const last = records[records.length - 1];
  return last === undefined ? 1 : last.n + 1;
}

/** The Version projection the action table returns (baseRevision and inverse stay on disk). */
export function toVersion(record: VersionRecord): Version {
  return {
    n: record.n,
    revision: record.revision,
    author: record.author,
    note: record.note,
    createdAt: record.createdAt,
    mutations: record.mutations,
  };
}

/** A named version is an entry with a note; write entries carry ''. */
export function isNamed(record: VersionRecord): boolean {
  return record.note !== '';
}

/** The newest named version, optionally the newest one below a revision. */
export function lastNamed(
  records: ReadonlyArray<VersionRecord>,
  belowRevision?: number,
): VersionRecord | undefined {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record === undefined || !isNamed(record)) continue;
    if (belowRevision !== undefined && record.revision >= belowRevision) continue;
    return record;
  }
  return undefined;
}

/** The newest entry that left the deck at a revision, or undefined. */
export function recordAtRevision(
  records: ReadonlyArray<VersionRecord>,
  revision: number,
): VersionRecord | undefined {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record !== undefined && record.revision === revision) return record;
  }
  return undefined;
}

/**
 * Checks that the log reaches the current document from entry `fromIndex`: the head entry left
 * the deck at the current revision and every later entry starts where the previous one ended. A break means the deck was
 * changed outside the store (an import, a hand edit), and history before the break cannot be
 * rebuilt from inverses.
 */
export function assertContiguous(
  records: ReadonlyArray<VersionRecord>,
  currentRevision: number,
  fromIndex: number,
): void {
  const head = records[records.length - 1];
  if (head === undefined) throw new RangeError('The version log is empty');
  if (head.revision !== currentRevision) {
    throw new Error(
      `The version log ends at revision ${head.revision} but the deck is at revision ${currentRevision}; the deck was changed outside the store, so earlier documents cannot be rebuilt`,
    );
  }
  for (let i = Math.max(fromIndex + 1, 1); i < records.length; i += 1) {
    const previous = records[i - 1];
    const record = records[i];
    if (previous === undefined || record === undefined) continue;
    if (record.baseRevision !== previous.revision) {
      throw new Error(
        `The version log breaks between versions ${previous.n} (revision ${previous.revision}) and ${record.n} (from revision ${record.baseRevision}); the deck was changed outside the store there`,
      );
    }
  }
}

/**
 * The document as it was after entry n (0: before the first entry), rebuilt from the current
 * document by applying the inverse of every later entry, newest first. The result is normalized
 * again so it compares equal to what the store held at that time.
 */
export function documentAtVersion(
  current: DeckDocument,
  records: ReadonlyArray<VersionRecord>,
  n: number,
): DeckDocument {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Version numbers start at 0, got ${n}`);
  const index = records.findIndex((record) => record.n === n);
  if (n > 0 && index < 0) throw new RangeError(`No version ${n} in the log`);
  const from = n === 0 ? 0 : index;
  if (records.length === 0) {
    if (n === 0) return current;
    throw new RangeError(`No version ${n} in the log`);
  }
  assertContiguous(records, current.deck.revision, from);
  let document = current;
  for (let i = records.length - 1; i > (n === 0 ? -1 : index); i -= 1) {
    const record = records[i];
    if (record === undefined) continue;
    try {
      document = applyMutations(document, record.inverse).document;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot undo version ${record.n} while rebuilding version ${n}: ${reason}`);
    }
  }
  const target = n === 0 ? records[0] : records[index];
  if (target !== undefined) {
    document.deck.revision = n === 0 ? target.baseRevision : target.revision;
    if (n > 0) document.deck.updatedAt = target.createdAt;
  }
  const validation = validateDocument(document);
  if (!validation.ok || validation.deck === null) {
    const first = validation.issues.find((row) => row.severity === 3);
    throw new Error(
      `Version ${n} does not validate: ${first === undefined ? 'unknown issue' : `${first.file}${first.pointer}: ${first.message}`}`,
    );
  }
  return { deck: validation.deck, slides: validation.slides };
}
