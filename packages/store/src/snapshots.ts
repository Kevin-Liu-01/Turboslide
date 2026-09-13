// Immutable per revision documents on the Blob backend (gslides-parity SPEC-2 8.2, 0.32, 0.40).
// Every committed write stores the whole DeckDocument as canonical JSON under
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
