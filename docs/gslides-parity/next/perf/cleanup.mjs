// Trashes and deletes forever the probe's two scratch decks by id (state/ids.json), through the
// agent surface with the bearer the wrapper puts in TURBOSLIDE_TOKEN (printed nowhere). Never a
// sweep: only the two ids this probe created, never gt-brand.
import { readFileSync, appendFileSync } from 'node:fs';

const DIR = new URL('.', import.meta.url).pathname;
const BASE = 'https://www.turboslide.com';
const token = process.env.TURBOSLIDE_TOKEN;
if (!token) throw new Error('no bearer in the environment');
const ids = JSON.parse(readFileSync(`${DIR}state/ids.json`, 'utf8'));
const decks = [ids.a, ids.b].filter(Boolean);
for (const id of decks) if (id === 'gt-brand' || id.startsWith('u/')) throw new Error(`refusing ${id}`);

async function call(action, deckId, input) {
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-turboslide-author': 'agent:perf-auditor' },
    body: JSON.stringify(input),
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: r.status, body };
}

const revisionOf = (b) => b?.revision ?? b?.deck?.revision ?? b?.result?.revision ?? b?.output?.revision ?? null;
for (const id of decks) {
  const info = await call('deck.info', id, {});
  const rev = revisionOf(info.body);
  const line1 = `${new Date().toISOString()} ${id} deck.info ${info.status} revision ${rev} trashed ${JSON.stringify(info.body?.trashedAt ?? info.body?.deck?.trashedAt ?? null)}`;
  console.log(line1);
  let base = rev;
  if (info.status === 200) {
    const trash = await call('deck.trash', id, { id, baseRevision: base });
    console.log(`${new Date().toISOString()} ${id} deck.trash ${trash.status} ${JSON.stringify(trash.body).slice(0, 200)}`);
    const again = await call('deck.info', id, {});
    base = revisionOf(again.body) ?? base;
    const remove = await call('deck.remove', id, { id, confirm: true, baseRevision: base });
    console.log(`${new Date().toISOString()} ${id} deck.remove ${remove.status} ${JSON.stringify(remove.body).slice(0, 200)}`);
  }
  const after = await call('deck.info', id, {});
  const line = `${new Date().toISOString()} ${id} deck.info after ${after.status} ${JSON.stringify(after.body).slice(0, 160)}`;
  console.log(line);
  appendFileSync(`${DIR}state/cleanup.log`, `${line1}\n${line}\n`);
}
