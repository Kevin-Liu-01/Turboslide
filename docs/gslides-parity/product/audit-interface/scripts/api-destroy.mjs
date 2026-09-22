// Trashes and deletes forever a scratch deck whose anonymous owner context is gone, through the
// HTTP transport with the agent bearer of ~/.config/turboslide/hosts.json (the bootstrap bearer acts
// as the admin under shadow authorization). The token is read and sent, never printed.
//   node api-destroy.mjs <deckId>
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = 'https://turboslide.vercel.app';
const id = process.argv[2];
if (!id) throw new Error('usage: node api-destroy.mjs <deckId>');
const hosts = JSON.parse(readFileSync(`${homedir()}/.config/turboslide/hosts.json`, 'utf8'));
const token = hosts.hosts?.[BASE]?.token;
if (!token) throw new Error('no bearer for the production host in hosts.json');

const call = async (action, input) => {
  const res = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-turboslide-author': 'audit-cleanup',
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  console.log(
    action,
    res.status,
    JSON.stringify(body).replace(new RegExp(token, 'g'), '<token>').slice(0, 240),
  );
  return { status: res.status, body };
};

const info = await call('deck.info', {});
const rev = info.body?.revision ?? 0;
if (info.status === 200) {
  const t = await call('deck.trash', { id, baseRevision: rev });
  const rev2 = t.body?.revision ?? rev;
  await call('deck.remove', { id, baseRevision: rev2, confirm: true });
}
for (let i = 0; i < 8; i += 1) {
  const r = await fetch(`${BASE}/edit/${id}`, { redirect: 'manual' });
  console.log('GET /edit', r.status);
  if (r.status === 404) break;
  await new Promise((f) => setTimeout(f, 2000));
}
