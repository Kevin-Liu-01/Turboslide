// The version log under decks/<id>/versions/ (SPEC 4.1 "versions/<n>.json", 6.7): one file per
// committed write and per named save, numbered from 1. A file is a Version plus baseRevision and
// the inverse mutations, so the document at any entry is rebuilt from the current one by applying
// the inverses of the later entries in reverse order (SPEC 6.7: undo is a forward application of
// the inverse). No snapshot is stored; the chain must be contiguous from the entry to the head.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { DeckDocument } from '@turboslide/schema/deck';
import { schemaMinorSchema } from '@turboslide/schema/deck';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import {
  CURRENT_SCHEMA_MINOR,
  isRecord,
  migrateMutations,
  parseTolerant,
} from '@turboslide/schema/migrations';
import type { Version } from '@turboslide/schema/mutations';
import { mutationSchema, versionSchema } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { validateDocument } from '@turboslide/schema/validate';

import { cachedRecords, fileStamp, forgetFile } from './parse-cache.ts';
import type { VersionRecord, WriteOrigin } from './store.ts';

export const VERSIONS_DIR = 'versions';

/**
 * Whether a committed write's record stores its `origin` (docs/archive/rounds/SYNC.md 3.2, the two deployment
 * landing). The parser below tolerates the field whatever this reads, so deployment N ships with
 * `false` (every instance reads a record that names its origin and writes none), and N plus 1
 * flips it to `true` once N is the deployment an Instant Rollback lands on; a rollback of N plus
 * 1 therefore lands on a reader that parses what N plus 1 wrote, never earlier. The blob store
 * reads it as the default of `BlobStoreOptions.writeOrigin`; the tests pass `true`.
 */
export const RECORD_ORIGIN_WRITES = true;

/** `{ clientId, opIds }` as the record stores it (store.ts WriteOrigin). Strict, both fields plain strings. */
export const writeOriginSchema = z.strictObject({
  clientId: z.string().min(1),
  opIds: z.array(z.string().min(1)),
}) satisfies z.ZodType<WriteOrigin>;

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
  'ops names { fromSeq, toSeq }, two integers in order',
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
  // the write's origin (docs/archive/rounds/SYNC.md 3.2): optional, tolerated one deployment before it is
  // written (RECORD_ORIGIN_WRITES), so a reader on the older deployment never stops on a record
  // the newer one wrote; a record without it parses as before the round
  origin: writeOriginSchema.optional(),
  // the minor of a release that stores a field this one does not know in a record (RELIABILITY-19,
  // hardening HR-O#5): read before any release writes it, so a rollback reads that release's log
  schemaMinor: schemaMinorSchema,
});

/** A parsed record with `ops` narrowed to the range the schema's refinement proved. */
function asRecord(parsed: ReturnType<typeof versionRecordSchema.parse>): VersionRecord {
  const { ops, ...rest } = parsed;
  return isOpsRange(ops) ? { ...rest, ops } : rest;
}

/**
 * How many record numbers are missing from a log: every n between the first record and the last
 * that no record carries (docs/archive/rounds/SYNC.md 3.6, the hole's two rules; `deck.info.counts.holes`). A
 * hole is a number a writer claimed whose commit landed after its record was released, or a
 * record a store lost; the reader's walk continues past it and the tabs above it reload once.
 * Version history's restore range ends at a hole (`assertContiguous`). Pure.
 */
export function logHoles(records: ReadonlyArray<VersionRecord>): number {
  if (records.length === 0) return 0;
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  const seen = new Set<number>();
  for (const record of records) {
    first = Math.min(first, record.n);
    last = Math.max(last, record.n);
    seen.add(record.n);
  }
  return last - first + 1 - seen.size;
}

/**
 * The newest record above `baseRevision` whose origin names one of `opIds` (docs/archive/rounds/SYNC.md 3.2,
 * invariant 3): the first admission of a POST whose answer was lost, found by key rather than by
 * the byte equality of its mutations. Undefined when no record above the base names them, which
 * is every first attempt. Pure; the callers bound the records to the ones above the POST's base.
 */
export function recordNamingOps(
  records: ReadonlyArray<VersionRecord>,
  baseRevision: number,
  opIds: ReadonlyArray<string>,
): VersionRecord | undefined {
  if (opIds.length === 0) return undefined;
  const wanted = new Set(opIds);
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record === undefined || record.revision <= baseRevision || record.origin === undefined)
      continue;
    if (record.origin.opIds.some((id) => wanted.has(id))) return record;
  }
  return undefined;
}

export function versionPath(dir: string, n: number): string {
  return join(dir, VERSIONS_DIR, `${n}.json`);
}

/**
 * A stored record's value through the documents chain (RELIABILITY-19, hardening HR-O#5): the
 * slides its mutations and its inverse carry are migrated like slide files, and a record or a
 * slide of a newer minor keeps the fields this release does not know (`parseTolerant`), so the
 * log of a deck a newer release wrote reads after a rollback. The one parse of a record.
 */
export function safeParseRecord(raw: unknown) {
  const value = isRecord(raw)
    ? {
        ...raw,
        mutations: migrateMutations(raw.mutations),
        ...('inverse' in raw ? { inverse: migrateMutations(raw.inverse) } : {}),
      }
    : raw;
  return parseTolerant(versionRecordSchema, value);
}

/** One version record from the text of its file; a text that is not a record is a TypeError naming the file. */
export function parseVersionRecord(text: string, file: string): VersionRecord {
  const parsed = safeParseRecord(parseJson(text, file));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TypeError(
      `${file} is not a version record at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  return asRecord(parsed.data);
}

/** The text of a version record's file, as the store writes it. */
export function versionRecordText(record: VersionRecord): string {
  const parsed = safeParseRecord(record);
  if (!parsed.success) throw parsed.error;
  return canonicalJson(parsed.data);
}

/**
 * The `schemaMinor` a write's record carries (RELIABILITY-19; the wave 3b verify's finding 1 of
 * HR-O#5): the highest minor of the manifest and the slides of the documents the write read and
 * made, when it is above this release's, else undefined. A record's mutations and inverse copy
 * blocks, sections and slides out of those files, and a block or a section has no stamp of its
 * own, so without the record's stamp a kept field in them (the block a `block.remove` keeps in
 * its inverse, the sections of a `section.set`) read as an unknown field of this release and the
 * record could not be written. A deck this release wrote stamps no record, so its records stay
 * strict. Pure.
 */
export function recordMinor(...documents: ReadonlyArray<DeckDocument>): number | undefined {
  let minor = 0;
  for (const document of documents) {
    minor = Math.max(minor, document.deck.schemaMinor ?? 0);
    for (const slide of Object.values(document.slides))
      minor = Math.max(minor, slide.schemaMinor ?? 0);
  }
  return minor > CURRENT_SCHEMA_MINOR ? minor : undefined;
}

/** Every entry under versions/, sorted by n; a file that is not a record is a TypeError. */
export function readVersions(dir: string): VersionRecord[] {
  return readVersionsWith(dir, (file) => parseVersionRecord(readFileSync(file, 'utf8'), file));
}

/**
 * `readVersions` through the parse cache (hardening PS#2, PERF-2): a record whose file is
 * unchanged since it was parsed is not parsed again, so a log read costs a directory listing and
 * a stat per record, and a commit parses its own record alone. Each call answers its own copies,
 * so a caller that changes a record changes nothing another caller reads. A Blob mirror reads
 * its log this way (`openFileStore`'s `cache`).
 */
export function readVersionsCached(dir: string): VersionRecord[] {
  return readVersionsWith(dir, (file) => {
    const stamp = fileStamp(file);
    const cached = stamp === null ? undefined : cachedRecords.get(file);
    if (cached !== undefined && cached.stamp === stamp)
      return structuredClone(cached.value as VersionRecord);
    const record = parseVersionRecord(readFileSync(file, 'utf8'), file);
    // the stamp read before the bytes: a write between the two leaves an older stamp, which the
    // next read refuses, never newer bytes under an older stamp
    if (stamp !== null) cachedRecords.set(file, { stamp, value: structuredClone(record) });
    return record;
  });
}

/**
 * Keeps the record a commit just wrote as its file's cached read (hardening PS#2), so the log read
 * after a commit parses nothing and a commit parses its own record once, in `versionRecordText`.
 * `text` is the file's bytes as `versionRecordText` made them: the parse that proved the record
 * emits canonical JSON, which a second parse answers unchanged, so the text's own JSON is the
 * record `readVersionsCached` would parse from the file. Stamped after the write, as the folder's
 * document is (`rememberDeckDir`); the store holds its write lock around both.
 */
export function rememberVersion(path: string, text: string): void {
  const stamp = fileStamp(path);
  if (stamp !== null) cachedRecords.set(path, { stamp, value: JSON.parse(text) as unknown });
}

function readVersionsWith(dir: string, read: (file: string) => VersionRecord): VersionRecord[] {
  const folder = join(dir, VERSIONS_DIR);
  if (!existsSync(folder)) return [];
  const records: VersionRecord[] = [];
  for (const name of readdirSync(folder)) {
    const match = /^(\d+)\.json$/.exec(name);
    if (match === null) continue;
    const file = join(folder, name);
    const record = read(file);
    if (record.n !== Number(match[1])) {
      throw new TypeError(`${file} carries n ${record.n}; the file name says ${match[1]}`);
    }
    records.push(record);
  }
  return records.sort((a, b) => a.n - b.n);
}

/** Writes a record's file; `text` is its `versionRecordText`, when the caller made it first. */
export function writeVersion(
  dir: string,
  record: VersionRecord,
  text: string = versionRecordText(record),
): string {
  const path = versionPath(dir, record.n);
  mkdirSync(join(dir, VERSIONS_DIR), { recursive: true });
  writeFileSync(path, text);
  forgetFile(path);
  return path;
}

export function nextVersionNumber(records: ReadonlyArray<VersionRecord>): number {
  const last = records[records.length - 1];
  return last === undefined ? 1 : last.n + 1;
}

/**
 * How many of the newest records a Blob mirror reads when it holds no record yet (hardening
 * PS#1, PERF-1; question 14 "a log floor of 50 records"): the editor's loader carries the newest
 * 50 (`EDITOR_VERSIONS_KEPT`) and retention keeps the newest 50 snapshots
 * (`SNAPSHOT_KEEP_RECORDS`). Older records are read when a caller asks for the whole log.
 */
export const LOG_FLOOR_RECORDS = 50;

/**
 * The number the newest record of a log carries, read from the document's revision and one
 * record of the log (hardening PS#1). A write's record moves the revision by one and takes the
 * next number, so `n - revision` is the same on every write record of a log, and a named version
 * or a hole adds one to it. From the first record the answer is therefore at or below the newest
 * number on a deck changed through the store alone (the walk above it reads the named versions
 * and holes since), and above it on a deck whose revision moved outside the store. Pure.
 */
export function newestRecordNumber(
  revision: number,
  record: Pick<VersionRecord, 'n' | 'revision'>,
): number {
  return revision + record.n - record.revision;
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
