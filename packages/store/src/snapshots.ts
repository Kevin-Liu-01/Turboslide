// Immutable per revision documents on the Blob backend (gslides-parity SPEC-2 8.2, 0.32, 0.40).
// A committed write stores the whole DeckDocument as canonical JSON (every tenth record since
// hardening PS#4, SNAPSHOT_EVERY_RECORDS) under
// `snapshots/<md5>.json`, where the md5 is the hash of the `deck.json` bytes the writer is about
// to push: Vercel Blob's etag for a body is that md5 in quotes (blob-store.ts quotedMd5, measured
// 2026-09-11), so `head('deck.json')` names the current snapshot with no body read, two writers
// that race from one revision store different bodies under different keys by construction, and a
// version record that carries `snapshot: <md5>` names the document it left behind. This module is
// the arithmetic the store runs (the key, the body, the parse, the retention set); blob-store.ts
// does the reads and writes and the tests run these helpers on their own.
import { createHash } from 'node:crypto';

import type { DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import { validateDeck } from '@turboslide/schema/validate';

import type { VersionRecord } from './store.ts';
import { isNamed } from './versions.ts';

export const SNAPSHOTS_DIR = 'snapshots';

/** How many of the newest version records keep their snapshot; named versions keep theirs always. */
export const SNAPSHOT_KEEP_RECORDS = 50;

/**
 * How long a snapshot no record names is left alone before the prune removes it: another
 * instance stores its snapshot before it pushes `deck.json`, so a snapshot younger than this may
 * be a commit in flight. The prune reads the entry's upload time; an entry without one is pruned
 * when unreferenced.
 */
export const SNAPSHOT_GRACE_MS = 5 * 60_000;

/**
 * The prune runs on every this many records the deck's log gains and once when the deck's last
 * stream on an instance closes, instead of after every commit (docs/archive/rounds/SYNC.md 3.6, 4.4 rank 6;
 * audit-costs item 14): the one `list` of the write path leaves the hot path, and the retention
 * set of SNAPSHOT_KEEP_RECORDS bounds what waits between two prunes at about seventy snapshots.
 * Counted on the record number, which every instance agrees on, so two instances never prune
 * the same twentieth commit twice; a named version takes a number too, and its save is the
 * prune's turn when it lands on one.
 */
export const SNAPSHOT_PRUNE_EVERY = 20;

/** True when the record numbered `n` is one the prune runs after (SNAPSHOT_PRUNE_EVERY). */
export function pruneDue(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n % SNAPSHOT_PRUNE_EVERY === 0;
}

/**
 * A commit stores the snapshot of the document it leaves on every this many records, and its
 * record names it (hardening PS#4, PERF-3 item 2). Before, every commit stored one: 330 KB and one
 * advanced operation of a 432 KB commit on the GT deck. A reader proves the current document by the
 * replay of the records above its own mirror or above the newest stored snapshot a record names
 * (blob-store.ts `pull`), which this count bounds to nine records. Record 1 stores one too: the
 * snapshot the deck was created with is named by no record, and without a named one a fresh
 * mirror would build its base from the slide bodies, which the loser of a commit race may have
 * overwritten. A named version, the deck's last close (`snapshotCurrent`) and a deck over
 * SNAPSHOT_EVERY_COMMIT_BYTES store one whatever the count.
 */
export const SNAPSHOT_EVERY_RECORDS = 10;

/**
 * The snapshot size from which every commit stores its snapshot: the seed route answers the
 * realtime object with the snapshot's URL instead of the document above 4 MB of JSON text (the
 * function's answer cap is 4.5 MB), and it needs the snapshot of the current revision for that.
 * The bound sits 1 MB below the route's, so a document whose text and bytes differ (the route
 * counts UTF-16 units of `JSON.stringify`, this the UTF-8 bytes of the canonical body) is on the
 * every commit side whenever the route may point at its snapshot.
 */
export const SNAPSHOT_EVERY_COMMIT_BYTES = 3 * 1024 * 1024;

/** True when the commit of record `n` stores its snapshot by the count: record 1 and every `every` (SNAPSHOT_EVERY_RECORDS). */
export function snapshotDue(n: number, every: number = SNAPSHOT_EVERY_RECORDS): boolean {
  return Number.isInteger(n) && n > 0 && (n === 1 || n % every === 0);
}

const MD5_HEX = /^[0-9a-f]{32}$/;

/** The md5 of a body in lower case hex: the snapshot key of the `deck.json` bytes it belongs to. */
export function snapshotKey(deckJsonBytes: Uint8Array | string): string {
  return createHash('md5').update(deckJsonBytes).digest('hex');
}

export function isSnapshotKey(value: string): boolean {
  return MD5_HEX.test(value);
}

/** `snapshots/<key>.json`, relative to the deck's prefix. */
export function snapshotPath(key: string): string {
  return `${SNAPSHOTS_DIR}/${key}.json`;
}

/** The key a stored pathname names, or null for any other file. */
export function snapshotKeyOf(relative: string): string | null {
  const match = /^snapshots\/([0-9a-f]{32})\.json$/.exec(relative);
  return match?.[1] ?? null;
}

/** The md5 an etag carries (`"fc8e..."` or `W/"fc8e..."`), or null when the etag is not one. */
export function etagMd5(version: string): string | null {
  const bare = version.replace(/^W\//, '').replace(/^"|"$/g, '');
  return MD5_HEX.test(bare) ? bare : null;
}

/** The snapshot body: the whole document as canonical JSON, so equal documents are equal bytes. */
export function snapshotBody(document: DeckDocument): Uint8Array {
  return new TextEncoder().encode(canonicalJson({ deck: document.deck, slides: document.slides }));
}

/**
 * A stored snapshot back into a normalized document; a TypeError names the first severity 3
 * issue, which a snapshot the store wrote never has (it was validated on the way in).
 */
export function parseSnapshot(bytes: Uint8Array, name = 'snapshot'): DeckDocument {
  const raw = parseJson(new TextDecoder().decode(bytes), name);
  if (typeof raw !== 'object' || raw === null || !('deck' in raw) || !('slides' in raw)) {
    throw new TypeError(`${name} is not a deck snapshot: it wants deck and slides`);
  }
  const { deck, slides } = raw;
  const slideList = typeof slides === 'object' && slides !== null ? Object.values(slides) : [];
  const result = validateDeck({ deck, slides: slideList });
  if (!result.ok || result.deck === null) {
    const first = result.issues.find((row) => row.severity === 3);
    throw new TypeError(
      `${name} does not validate${first === undefined ? '' : `: ${first.file}${first.pointer}: ${first.message}`}`,
    );
  }
  return { deck: result.deck, slides: result.slides };
}

/**
 * The snapshot keys retention keeps: the ones the newest `keep` records name and the ones every
 * named version names (SPEC-2 8.2 "the last 50 records' and every named version's snapshots").
 */
export function retainedSnapshots(
  records: ReadonlyArray<VersionRecord>,
  keep: number = SNAPSHOT_KEEP_RECORDS,
): Set<string> {
  const out = new Set<string>();
  const sorted = [...records].sort((a, b) => a.n - b.n);
  const newest = sorted.slice(Math.max(0, sorted.length - keep));
  for (const record of newest) if (record.snapshot !== undefined) out.add(record.snapshot);
  for (const record of sorted)
    if (isNamed(record) && record.snapshot !== undefined) out.add(record.snapshot);
  return out;
}

export type SnapshotEntry = { pathname: string; uploadedAt?: string };

/**
 * The stored snapshots the prune removes: every one under the deck's prefix whose key no retained
 * record names and whose upload is older than the grace, or has no recorded time. `current` is
 * the key `head('deck.json')` names, kept whatever the records say.
 */
export function prunableSnapshots(
  entries: ReadonlyArray<SnapshotEntry>,
  prefix: string,
  retained: ReadonlySet<string>,
  options: { now: number; graceMs: number; current?: string | null },
): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.pathname.startsWith(prefix)) continue;
    const key = snapshotKeyOf(entry.pathname.slice(prefix.length));
    if (key === null) continue;
    if (retained.has(key) || key === options.current) continue;
    if (entry.uploadedAt !== undefined) {
      const at = Date.parse(entry.uploadedAt);
      if (Number.isFinite(at) && options.now - at < options.graceMs) continue;
    }
    out.push(entry.pathname);
  }
  return out.sort();
}
