#!/usr/bin/env node
// Sizes the Blob store behind the personal production deployment, read only: pages the store's
// listing (GET <api>/?limit=1000&cursor=..., the same call @vercel/blob's list() makes, an
// advanced operation per page) and aggregates objects and bytes by prefix. Nothing but counts and
// bytes is printed; no pathname, URL or token reaches stdout or the JSON file. The token is read
// from BLOB_READ_WRITE_TOKEN in the environment (sourced in a subshell by the caller).
//
//   ( set -a; . .turboslide/vercel-dev.env; set +a; node blob-sizing.mjs --out <file> ) | grep -v -i token
import { writeFileSync } from 'node:fs';

const API = 'https://vercel.com/api/blob';
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const OUT = outIndex >= 0 ? argv[outIndex + 1] : null;

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (token === undefined || token === '') {
  console.error('BLOB_READ_WRITE_TOKEN is not in the environment; nothing listed');
  process.exit(2);
}

const started = Date.now();
let cursor = null;
let pages = 0;
let objects = 0;
let bytes = 0;
/** by first path segment */
const prefixes = new Map();
/** under decks/<id>/: by the kind of file */
const deckKinds = new Map();
/** per deck id: objects and bytes (kept in memory only; the JSON carries the distribution) */
const decks = new Map();
/** under exports/: records vs produced files */
const exportsKinds = new Map();
let oldest = null;
let newest = null;
const sizeBuckets = new Map();

function add(map, key, size) {
  const row = map.get(key) ?? { objects: 0, bytes: 0 };
  row.objects += 1;
  row.bytes += size;
  map.set(key, row);
}

function bucket(size) {
  if (size < 1024) return '<1 KB';
  if (size < 16 * 1024) return '1 to 16 KB';
  if (size < 256 * 1024) return '16 to 256 KB';
  if (size < 1024 * 1024) return '256 KB to 1 MB';
  if (size < 8 * 1024 * 1024) return '1 to 8 MB';
  return '>8 MB';
}

function deckKind(rest) {
  if (rest === 'deck.json') return 'deck.json';
  if (rest === 'leases.json') return 'leases.json';
  if (rest === 'access.json') return 'access.json';
  if (rest.startsWith('slides/')) return 'slides/';
  if (rest.startsWith('versions/')) return 'versions/';
  if (rest.startsWith('snapshots/')) return 'snapshots/';
  if (rest.startsWith('assets/')) return 'assets/';
  if (rest.startsWith('.thumbs/')) return '.thumbs/';
  if (rest.startsWith('comments/')) return 'comments/';
  if (rest.startsWith('.turboslide/')) return '.turboslide/';
  return 'other sidecar';
}

for (;;) {
  const url = new URL(API);
  url.searchParams.set('limit', '1000');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' },
  });
  if (!res.ok) {
    console.error(`listing answered ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  pages += 1;
  for (const blob of body.blobs ?? []) {
    const size = typeof blob.size === 'number' ? blob.size : 0;
    const path = String(blob.pathname ?? '');
    objects += 1;
    bytes += size;
    add(sizeBuckets, bucket(size), size);
    const at = blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : null;
    if (at !== null) {
      oldest = oldest === null ? at : Math.min(oldest, at);
      newest = newest === null ? at : Math.max(newest, at);
    }
    const slash = path.indexOf('/');
    const first = slash < 0 ? path : path.slice(0, slash);
    add(prefixes, `${first}/`, size);
    if (first === 'decks') {
      const rest = path.slice(slash + 1);
      const s2 = rest.indexOf('/');
      const deckId = s2 < 0 ? rest : rest.slice(0, s2);
      const inside = s2 < 0 ? '' : rest.slice(s2 + 1);
      add(deckKinds, deckKind(inside), size);
      const row = decks.get(deckId) ?? { objects: 0, bytes: 0, snapshots: 0, thumbs: 0, slides: 0, versions: 0 };
      row.objects += 1;
      row.bytes += size;
      if (inside.startsWith('snapshots/')) row.snapshots += 1;
      if (inside.startsWith('.thumbs/')) row.thumbs += 1;
      if (inside.startsWith('slides/')) row.slides += 1;
      if (inside.startsWith('versions/')) row.versions += 1;
      decks.set(deckId, row);
    } else if (first === 'exports') {
      const rest = path.slice(slash + 1);
      add(exportsKinds, rest.startsWith('.jobs/') ? '.jobs/ records' : 'produced files', size);
    }
  }
  if (!body.hasMore || !body.cursor) break;
  cursor = body.cursor;
}

const sorted = (map) =>
  [...map.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .map(([key, row]) => ({ key, objects: row.objects, bytes: row.bytes, mib: +(row.bytes / 1048576).toFixed(2) }));

const deckRows = [...decks.values()].sort((a, b) => b.bytes - a.bytes);
const quantile = (arr, q) => (arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)))]);
const bytesSorted = deckRows.map((d) => d.bytes).sort((a, b) => a - b);
const objectsSorted = deckRows.map((d) => d.objects).sort((a, b) => a - b);

const summary = {
  listedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  pages,
  objects,
  bytes,
  gib: +(bytes / 1073741824).toFixed(3),
  oldestUploadedAt: oldest === null ? null : new Date(oldest).toISOString(),
  newestUploadedAt: newest === null ? null : new Date(newest).toISOString(),
  byPrefix: sorted(prefixes),
  decksByKind: sorted(deckKinds),
  exportsByKind: sorted(exportsKinds),
  sizeBuckets: sorted(sizeBuckets),
  decks: {
    count: deckRows.length,
    withThumbs: deckRows.filter((d) => d.thumbs > 0).length,
    withSnapshots: deckRows.filter((d) => d.snapshots > 0).length,
    bytesMedian: quantile(bytesSorted, 0.5),
    bytesP90: quantile(bytesSorted, 0.9),
    bytesMax: bytesSorted.at(-1) ?? 0,
    objectsMedian: quantile(objectsSorted, 0.5),
    objectsP90: quantile(objectsSorted, 0.9),
    objectsMax: objectsSorted.at(-1) ?? 0,
    snapshotsTotal: deckRows.reduce((n, d) => n + d.snapshots, 0),
    thumbsTotal: deckRows.reduce((n, d) => n + d.thumbs, 0),
    slidesTotal: deckRows.reduce((n, d) => n + d.slides, 0),
    versionsTotal: deckRows.reduce((n, d) => n + d.versions, 0),
    largestFive: deckRows.slice(0, 5).map((d) => ({ objects: d.objects, bytes: d.bytes, snapshots: d.snapshots, thumbs: d.thumbs, slides: d.slides })),
  },
};

if (OUT) writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
