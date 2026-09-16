#!/usr/bin/env node
// Removes scratch decks a verifier run left on a hosted store, through the product's own actions
// (deck.info, deck.trash, deck.remove with confirm) and the agent bearer from the environment
// (TURBOSLIDE_TOKEN, never printed): `--id <deckId>` any number of times, or `--prefix <p>` to
// remove every card of /decks whose id starts with the prefix (the decks this lane's runs make:
// e2e-resize-, v5-, and the perf run's deck named by --perf-json <file>). Prints one line per deck.
//   node docs/gslides-parity/verification-5/scripts/remove-scratch-decks.mjs --base <origin> [--id x]... [--prefix e2e-resize-] [--perf-json <path>]
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const values = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const BASE = (values('base')[0] ?? '').replace(/\/$/, '');
if (!BASE) throw new Error('--base is required');
const headers = {
  'content-type': 'application/json',
  ...(process.env.VERCEL_OIDC_TOKEN
    ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
    : {}),
  ...(process.env.TURBOSLIDE_TOKEN
    ? { authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}` }
    : {}),
};
const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
};
const ids = new Set(values('id'));
for (const file of values('perf-json')) {
  if (!existsSync(file)) continue;
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const id = json?.results?.write?.deckId ?? json?.write?.deckId ?? null;
  if (id) ids.add(id);
}
for (const prefix of values('prefix')) {
  const listed = await post('/api/actions/deck.list', {});
  const rows = Array.isArray(listed.json) ? listed.json : (listed.json?.decks ?? []);
  for (const row of rows)
    if (typeof row.id === 'string' && row.id.startsWith(prefix)) ids.add(row.id);
  if (rows.length === 0) {
    const html = await fetch(`${BASE}/decks`, { headers }).then((r) => r.text());
    for (const m of html.matchAll(/data-control="home\.open\.([^"]+)"/g))
      if (m[1].startsWith(prefix)) ids.add(m[1]);
  }
}
const PROTECTED = new Set(['gt-brand', 'gt-brand-mu05h5vq']);
for (const id of ids) {
  if (PROTECTED.has(id) || !/^(v5-|untitled-|smoke-|e2e-)/.test(id)) {
    console.log(`${id}: left alone (not a scratch deck this lane makes)`);
    continue;
  }
  const info = await post(`/api/actions/deck.info?deck=${id}`, {});
  const revision = info.json?.deck?.revision ?? info.json?.revision ?? 1;
  const trashed = await post(`/api/actions/deck.trash?deck=${id}`, { id, baseRevision: revision });
  const after = trashed.json?.revision ?? revision;
  const removed = await post(`/api/actions/deck.remove?deck=${id}`, {
    id,
    confirm: true,
    baseRevision: after,
  });
  console.log(
    `${id}: deck.info ${info.status} (revision ${revision}); deck.trash ${trashed.status}; deck.remove ${removed.status}${removed.status !== 200 ? ` ${removed.text.slice(0, 120)}` : ''}`,
  );
}
if (ids.size === 0) console.log('nothing to remove');
