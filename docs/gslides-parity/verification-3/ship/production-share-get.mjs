#!/usr/bin/env node
// MILESTONES-3 "Ship step" item 4: "a production share.get on a deck written after the deploy
// reports its record". With the bearer in TURBOSLIDE_TOKEN (run through
// verification-2/ship/run-with-token.mjs, never printed): deck.copy one slide of gt-brand into a
// scratch deck, share.get on it, share.createLink as viewer, share.get again, then deck.trash and
// deck.remove. Prints the records with the token of the link masked.
const BASE = (process.argv[2] ?? 'https://turboslide.vercel.app').replace(/\/$/, '');
const token = process.env.TURBOSLIDE_TOKEN;
if (!token) {
  console.error('TURBOSLIDE_TOKEN missing');
  process.exit(2);
}
const id = `ship-share-${Date.now().toString(36)}`;
async function act(action, input, deck = id) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deck)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ms: Date.now() - t0, body };
}
const mask = (s) =>
  s.replace(/\/s\/[A-Za-z0-9_-]+/g, '/s/<token>').replace(/"token":"[^"]+"/g, '"token":"<masked>"');
const show = (label, r) =>
  console.log(`${label}: ${r.status} in ${r.ms} ms ${mask(JSON.stringify(r.body)).slice(0, 700)}`);
const info = await act('deck.info', {}, 'gt-brand');
show('deck.info gt-brand', info);
const copy = await act(
  'deck.copy',
  { id: 'gt-brand', newId: id, name: 'Ship share.get', baseRevision: info.body?.revision ?? 31 },
  'gt-brand',
);
show('deck.copy', copy);
if (copy.status !== 200) process.exit(1);
show('share.get after the copy', await act('share.get', { id }));
const link = await act('share.createLink', { id, role: 'viewer', baseRevision: 0 });
show('share.createLink viewer', link);
show('share.get after the link', await act('share.get', { id }));
const info2 = await act('deck.info', { id });
show(
  'deck.trash',
  await act('deck.trash', {
    id,
    baseRevision: info2.body?.revision ?? info2.body?.deck?.revision ?? 0,
  }),
);
const info3 = await act('deck.info', { id });
show(
  'deck.remove',
  await act('deck.remove', {
    id,
    confirm: true,
    baseRevision: info3.body?.revision ?? info3.body?.deck?.revision ?? 0,
  }),
);
