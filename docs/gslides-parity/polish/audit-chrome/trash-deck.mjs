// Trashes and deletes forever one scratch deck through the actions API with the bearer in the
// environment (run through with-tokens.mjs); prints statuses only.
//   node with-tokens.mjs --host <origin> node trash-deck.mjs <origin> <deckId>
const [origin, id] = process.argv.slice(2);
const token = process.env.TURBOSLIDE_TOKEN ?? '';
if (!origin || !id || !token) { console.error('usage / no token'); process.exit(2); }
const h = { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-turboslide-author': 'agent:polish-chrome-teardown' };
const call = async (action, input) => {
  const r = await fetch(`${origin}/api/actions/${action}?deck=${encodeURIComponent(id)}`, { method: 'POST', headers: h, body: JSON.stringify(input) });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch { b = { text: t.slice(0, 200) }; }
  return { status: r.status, body: b };
};
const info = await call('deck.info', {});
console.log('deck.info', info.status, info.body?.id ?? info.body?.error?.message ?? '', 'revision', info.body?.revision ?? '');
if (info.status === 200) {
  const t = await call('deck.trash', { id, baseRevision: info.body.revision });
  console.log('deck.trash', t.status, t.body?.error?.message ?? 'ok');
  const info2 = await call('deck.info', {});
  const rev = info2.body?.revision ?? t.body?.revision ?? info.body.revision;
  const rm = await call('deck.remove', { id, baseRevision: rev, confirm: true });
  console.log('deck.remove', rm.status, rm.body?.error?.message ?? 'ok');
}
for (const route of ['edit', 'deck']) {
  let status = 0;
  for (let i = 0; i < 12; i += 1) {
    status = (await fetch(`${origin}/${route}/${id}`, { redirect: 'manual' })).status;
    if (status === 404) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`GET /${route}/${id}`, status);
}
