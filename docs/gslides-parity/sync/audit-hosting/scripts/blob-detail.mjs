#!/usr/bin/env node
// A second read only pass over the store listing: the sub kinds under decks/<id>/.turboslide/,
// builds/ and bundles/, and the age distribution of exports/ (counts and bytes only; no
// pathname, URL or token is printed).
const API = 'https://vercel.com/api/blob';
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is not in the environment; nothing listed');
  process.exit(2);
}
const add = (map, key, size) => {
  const row = map.get(key) ?? { objects: 0, bytes: 0 };
  row.objects += 1;
  row.bytes += size;
  map.set(key, row);
};
const turboslideSub = new Map();
const buildsSub = new Map();
const bundlesSub = new Map();
const exportsAge = new Map();
const exportsPerDeck = new Map();
const now = Date.now();
let cursor = null;
for (;;) {
  const url = new URL(API);
  url.searchParams.set('limit', '1000');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' } });
  if (!res.ok) {
    console.error(`listing answered ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  for (const blob of body.blobs ?? []) {
    const size = typeof blob.size === 'number' ? blob.size : 0;
    const parts = String(blob.pathname ?? '').split('/');
    if (parts[0] === 'decks' && parts[2] === '.turboslide') {
      const sub = parts.length > 4 ? `${parts[3]}/` : (parts[3] ?? '').replace(/-[^-]*$/, '-*');
      add(turboslideSub, sub, size);
    } else if (parts[0] === 'builds') {
      add(buildsSub, parts.length > 2 ? `<id>/${parts.slice(2).join('/').replace(/[0-9a-f]{8,}/g, '<hex>')}` : '<file>', size);
    } else if (parts[0] === 'bundles') {
      add(bundlesSub, parts.length > 2 ? '<id>/<file>' : '<file>', size);
    } else if (parts[0] === 'exports') {
      const at = blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : now;
      const days = (now - at) / 86_400_000;
      add(exportsAge, days < 1 ? 'under 1 day' : days < 3 ? '1 to 3 days' : days < 7 ? '3 to 7 days' : 'over 7 days', size);
      add(exportsPerDeck, parts[1] ?? '?', size);
    }
  }
  if (!body.hasMore || !body.cursor) break;
  cursor = body.cursor;
}
const rows = (map) => [...map.entries()].sort((a, b) => b[1].bytes - a[1].bytes).map(([key, r]) => ({ key, objects: r.objects, bytes: r.bytes, mib: +(r.bytes / 1048576).toFixed(2) }));
console.log(JSON.stringify({
  turboslideSub: rows(turboslideSub),
  buildsSub: rows(buildsSub),
  bundlesSub: rows(bundlesSub),
  exportsAge: rows(exportsAge),
  exportsDecks: exportsPerDeck.size,
  exportsPerDeckMax: Math.max(0, ...[...exportsPerDeck.values()].map((r) => r.objects)),
}, null, 2));
