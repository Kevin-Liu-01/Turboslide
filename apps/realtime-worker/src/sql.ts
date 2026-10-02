// The object's SQLite (docs/CLOUDFLARE.md 3.6.2 `src/sql.ts`): the schema, the statements and
// the cursor accounting. Three tables: `meta` (one row: `head`, `covered`, `revision`, the two
// checkpoint times, the month list, the seed and stale flags, the persisted counters),
// `entries_<yyyymm>` (one row per admitted entry, `UNIQUE (client_id, op_id)` for the dedupe of
// 3.4 item 4, made on demand when a month's first entry lands and dropped as a table once
// `covered` is above its last seq and the retention is behind it, so no hot path deletes rows)
// and `doc` (the live document as one row per slide and one for the manifest, chunked at 900 KB
// when a row would pass 1.5 MB; the rows live while the deck has a socket or an uncommitted
// entry). Every statement runs through `Sql.exec`, which consumes the cursor at once (the sqlite
// page's rule: fully consume cursors before the next await) and sums `rowsRead` and `rowsWritten`
// off it for the cost rows (W1 finding 15). Statements stay under 100 KB and 100 bound
// parameters (W1 section 2): a batch insert is one statement per entry.
import type { Entry } from '@turboslide/realtime/channel';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';

/** A `doc` row's body above this is chunked into parts of `DOC_CHUNK_BYTES` (3.6.2). */
export const DOC_CHUNK_AT_BYTES = 1.5 * 1024 * 1024;
export const DOC_CHUNK_BYTES = 900 * 1024;

export const META_DDL = `CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  head INTEGER NOT NULL,
  covered INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  last_checkpoint_at INTEGER,
  first_uncommitted_at INTEGER,
  months TEXT NOT NULL,
  seeded INTEGER NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  counters TEXT NOT NULL DEFAULT '{}',
  doc_seq INTEGER NOT NULL DEFAULT 0
)`;

export const DOC_DDL = `CREATE TABLE IF NOT EXISTS doc (
  key TEXT NOT NULL,
  part INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (key, part)
)`;

/** The month partition of a time, `yyyymm` in UTC. */
export function monthOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH = /^[0-9]{6}$/;

/** `entries_<yyyymm>`; a TypeError on anything but six digits, so no text reaches a table name. */
export function entriesTable(month: string): string {
  if (!MONTH.test(month)) throw new TypeError(`${JSON.stringify(month)} is not a month (yyyymm)`);
  return `entries_${month}`;
}

export function entriesDdl(table: string): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (
      seq INTEGER PRIMARY KEY,
      rev INTEGER NOT NULL,
      kind TEXT NOT NULL,
      client_id TEXT NOT NULL,
      op_id TEXT NOT NULL,
      author TEXT NOT NULL,
      mutations TEXT,
      comment TEXT,
      at TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      note TEXT,
      covers TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_op ON ${table} (client_id, op_id)`,
  ];
}

export type EntryRow = {
  seq: number;
  rev: number;
  kind: string;
  client_id: string;
  op_id: string;
  author: string;
  mutations: string | null;
  comment: string | null;
  at: string;
  at_ms: number;
  note: string | null;
  covers: string | null;
};

export const ENTRY_COLUMNS =
  'seq, rev, kind, client_id, op_id, author, mutations, comment, at, at_ms, note, covers';

export function entryOfRow(row: EntryRow): Entry {
  const entry: Entry = {
    seq: row.seq,
    rev: row.rev,
    kind: row.kind === 'comment' ? 'comment' : 'edit',
    author: JSON.parse(row.author) as Entry['author'],
    clientId: row.client_id,
    opId: row.op_id,
    at: row.at,
  };
  if (row.mutations !== null) entry.mutations = JSON.parse(row.mutations) as Entry['mutations'];
  if (row.comment !== null) entry.comment = JSON.parse(row.comment) as Entry['comment'];
  if (row.note !== null) entry.note = row.note;
  if (row.covers !== null) entry.covers = JSON.parse(row.covers) as string[];
  return entry;
}

/** The bound values of an entry, in `ENTRY_COLUMNS` order. */
export function rowOfEntry(entry: Entry): (string | number | null)[] {
  return [
    entry.seq,
    entry.rev,
    entry.kind,
    entry.clientId,
    entry.opId,
    JSON.stringify(entry.author),
    entry.mutations === undefined ? null : JSON.stringify(entry.mutations),
    entry.comment === undefined ? null : JSON.stringify(entry.comment),
    entry.at,
    Number.isFinite(Date.parse(entry.at)) ? Date.parse(entry.at) : Date.now(),
    entry.note ?? null,
    entry.covers === undefined ? null : JSON.stringify(entry.covers),
  ];
}

export type MetaRow = {
  id: number;
  head: number;
  covered: number;
  revision: number;
  last_checkpoint_at: number | null;
  first_uncommitted_at: number | null;
  months: string;
  seeded: number;
  stale: number;
  counters: string;
  doc_seq: number;
};

/** The object's facts as the one `meta` row holds them, in memory. */
export type Meta = {
  head: number;
  covered: number;
  revision: number;
  lastCheckpointAt: number | null;
  firstUncommittedAt: number | null;
  /** the month partitions that hold entries, oldest first */
  months: string[];
  /** the doc rows and the head were seeded from the store once */
  seeded: boolean;
  /** a manifest written outside the object (`/external`): the doc rows are not the store's any more */
  stale: boolean;
  /**
   * the seq the `doc` rows reflect: a wake applies the entries above it (the retained log holds
   * them), so the rows are rewritten every DOC_REFRESH_ENTRIES entries and at the last close
   * instead of at every checkpoint, which keeps `cost.do.rows-written` near the design's count
   */
  docSeq: number;
};

export function metaOfRow(row: MetaRow): Meta {
  let months: string[] = [];
  try {
    const parsed = JSON.parse(row.months) as unknown;
    if (Array.isArray(parsed)) months = parsed.filter((m): m is string => typeof m === 'string');
  } catch {
    months = [];
  }
  return {
    head: row.head,
    covered: row.covered,
    revision: row.revision,
    lastCheckpointAt: row.last_checkpoint_at,
    firstUncommittedAt: row.first_uncommitted_at,
    months,
    seeded: row.seeded === 1,
    stale: row.stale === 1,
    docSeq: typeof row.doc_seq === 'number' ? row.doc_seq : 0,
  };
}

/** The counters the cost rows read (docs/CLOUDFLARE.md 2.2; build/r1.md R1-R5d). */
export type Counters = {
  requests: number;
  messages: number;
  opsFrames: number;
  presenceFrames: number;
  alarms: number;
  checkpoints: number;
  seeds: number;
  upgradesRefused: number;
  rowsRead: number;
  rowsWritten: number;
  wakes: number;
};

export function zeroCounters(): Counters {
  return {
    requests: 0,
    messages: 0,
    opsFrames: 0,
    presenceFrames: 0,
    alarms: 0,
    checkpoints: 0,
    seeds: 0,
    upgradesRefused: 0,
    rowsRead: 0,
    rowsWritten: 0,
    wakes: 0,
  };
}

export function addCounters(into: Counters, from: Counters): Counters {
  const out = { ...into };
  for (const key of Object.keys(from) as (keyof Counters)[])
    out[key] = (into[key] ?? 0) + from[key];
  return out;
}

export function countersOf(text: string): Counters {
  try {
    const parsed = JSON.parse(text) as Partial<Counters>;
    const out = zeroCounters();
    for (const key of Object.keys(out) as (keyof Counters)[]) {
      const value = parsed[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return zeroCounters();
  }
}

/** Splits a body into parts of at most `DOC_CHUNK_BYTES` characters when it passes the chunk threshold. */
export function chunkBody(body: string): string[] {
  if (body.length <= DOC_CHUNK_AT_BYTES) return [body];
  const parts: string[] = [];
  for (let at = 0; at < body.length; at += DOC_CHUNK_BYTES)
    parts.push(body.slice(at, at + DOC_CHUNK_BYTES));
  return parts;
}

/** The `doc` rows of a document: the manifest under `manifest` (always), each slide under `slide:<id>` (the named ones, else every slide). */
export function docRowsOf(
  document: DeckDocument,
  slideIds?: Iterable<string>,
): Map<string, string> {
  const out = new Map<string, string>();
  const ids = slideIds === undefined ? Object.keys(document.slides) : [...slideIds];
  out.set('manifest', JSON.stringify({ deck: document.deck }));
  for (const id of ids) {
    const slide = document.slides[id];
    if (slide !== undefined) out.set(`slide:${id}`, JSON.stringify(slide));
  }
  return out;
}

/** A document from its rows (`key`, `part`, `body` in key and part order); null when the manifest is absent. */
export function documentOfRows(
  rows: readonly { key: string; part: number; body: string }[],
): DeckDocument | null {
  const bodies = new Map<string, string[]>();
  for (const row of rows) {
    const parts = bodies.get(row.key) ?? [];
    parts[row.part] = row.body;
    bodies.set(row.key, parts);
  }
  const manifest = bodies.get('manifest');
  if (manifest === undefined) return null;
  const deck = (JSON.parse(manifest.join('')) as { deck: DeckDocument['deck'] }).deck;
  const slides: Record<string, Slide> = {};
  for (const [key, parts] of bodies) {
    if (!key.startsWith('slide:')) continue;
    slides[key.slice('slide:'.length)] = JSON.parse(parts.join('')) as Slide;
  }
  return { deck, slides };
}

/**
 * The storage behind one object: every statement through `exec`, consumed at once, its row
 * counts summed into `counters` (the wake's) for `GET /rooms/:id/counters`.
 */
export class Sql {
  readonly counters: Counters;
  private readonly sql: SqlStorage;

  constructor(sql: SqlStorage, counters: Counters) {
    this.sql = sql;
    this.counters = counters;
  }

  /** Runs one statement and answers its rows; the cursor is consumed before anything else runs. */
  exec<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): T[] {
    const cursor = this.sql.exec<T>(query, ...bindings);
    const rows = cursor.toArray();
    this.counters.rowsRead += cursor.rowsRead;
    this.counters.rowsWritten += cursor.rowsWritten;
    return rows;
  }

  /** Runs one statement for its effect and answers the rows it wrote. */
  run(query: string, ...bindings: SqlStorageValue[]): number {
    const cursor = this.sql.exec(query, ...bindings);
    cursor.toArray();
    this.counters.rowsRead += cursor.rowsRead;
    this.counters.rowsWritten += cursor.rowsWritten;
    return cursor.rowsWritten;
  }

  /** The object's SQLite size in bytes (the `setup.do.memory` and storage readings). */
  get databaseSize(): number {
    return this.sql.databaseSize;
  }
}
