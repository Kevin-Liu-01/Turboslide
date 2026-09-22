// Read only counts of the production Blob store (the sync audit): the deck folders, the files
// per folder of a sample of decks by kind (versions, snapshots, slides, state), the export job
// records. Prints counts and folder kinds only, never a token, a URL or a deck's contents. The
// token comes from the environment of the subshell that runs this (BLOB_READ_WRITE_TOKEN).
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/packages/store/package.json');
const { list } = require('@vercel/blob');

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.log('no store credentials in the environment');
  process.exit(0);
}
let calls = 0;
const listAll = async (prefix, mode) => {
  const out = [];
  let cursor;
  do {
    calls += 1;
    const page = await list({ token, prefix, limit: 1000, mode, ...(cursor ? { cursor } : {}) });
    if (mode === 'folded') out.push(...(page.folders ?? []));
    else
      out.push(
        ...page.blobs.map((b) => ({
          pathname: b.pathname,
          size: b.size,
          uploadedAt: b.uploadedAt,
        })),
      );
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
};

const folders = await listAll('decks/', 'folded');
console.log(`deck folders under decks/: ${folders.length}`);
// which folders hold a manifest: head by listing the exact pathname (one list call each, sampled)
const sample = folders.slice(0, folders.length);
let withManifest = 0;
const kinds = {
  versions: 0,
  snapshots: 0,
  slides: 0,
  state: 0,
  comments: 0,
  assets: 0,
  thumbs: 0,
  manifest: 0,
  leases: 0,
  access: 0,
  other: 0,
};
let totalFiles = 0;
let totalBytes = 0;
const perDeck = [];
for (const folder of sample) {
  const files = await listAll(folder, 'expanded');
  const row = {
    versions: 0,
    snapshots: 0,
    slides: 0,
    state: 0,
    comments: 0,
    assets: 0,
    thumbs: 0,
    manifest: 0,
    leases: 0,
    access: 0,
    other: 0,
    bytes: 0,
  };
  for (const f of files) {
    const rel = f.pathname.slice(folder.length);
    totalFiles += 1;
    totalBytes += f.size ?? 0;
    row.bytes += f.size ?? 0;
    const kind =
      rel === 'deck.json'
        ? 'manifest'
        : rel === 'leases.json'
          ? 'leases'
          : rel === 'access.json'
            ? 'access'
            : rel.startsWith('versions/')
              ? 'versions'
              : rel.startsWith('snapshots/')
                ? 'snapshots'
                : rel.startsWith('slides/')
                  ? 'slides'
                  : rel.startsWith('.turboslide/')
                    ? 'state'
                    : rel.startsWith('comments/')
                      ? 'comments'
                      : rel.startsWith('assets/')
                        ? 'assets'
                        : rel.startsWith('.thumbs/')
                          ? 'thumbs'
                          : 'other';
    row[kind] += 1;
    kinds[kind] += 1;
  }
  if (row.manifest > 0) withManifest += 1;
  perDeck.push(row);
}
console.log(
  `folders with a manifest: ${withManifest} of ${sample.length}; files under decks/: ${totalFiles}; bytes: ${totalBytes}`,
);
console.log(`files by kind: ${JSON.stringify(kinds)}`);
const live = perDeck.filter((r) => r.manifest > 0);
const phantoms = perDeck.filter((r) => r.manifest === 0);
const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);
const stats = (values) => {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 'none';
  return `n ${s.length} min ${s[0]} p50 ${s[Math.floor(s.length / 2)]} p90 ${s[Math.floor(s.length * 0.9)]} max ${s[s.length - 1]} sum ${s.reduce((a, b) => a + b, 0)}`;
};
console.log(`live decks: versions ${stats(live.map((r) => r.versions))}`);
console.log(`live decks: snapshots ${stats(live.map((r) => r.snapshots))}`);
console.log(`live decks: slides ${stats(live.map((r) => r.slides))}`);
console.log(`live decks: state files ${stats(live.map((r) => r.state))}`);
console.log(`live decks: bytes ${stats(live.map((r) => r.bytes))}`);
console.log(
  `folders without a manifest (leftovers): ${phantoms.length}; their files by kind: versions ${sum(phantoms, 'versions')} snapshots ${sum(phantoms, 'snapshots')} slides ${sum(phantoms, 'slides')} state ${sum(phantoms, 'state')} thumbs ${sum(phantoms, 'thumbs')} assets ${sum(phantoms, 'assets')} other ${sum(phantoms, 'other')}; bytes ${sum(phantoms, 'bytes')}`,
);
const jobs = await listAll('exports/.jobs/', 'expanded');
console.log(`export job records: ${jobs.length}`);
const top = await listAll('', 'folded');
console.log(
  `top level folders: ${top.length} (${top.map((f) => f.replace(/\/$/, '')).join(', ')})`,
);
console.log(`list calls made by this script: ${calls}`);
