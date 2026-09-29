const BASE = 'https://www.turboslide.com';
const TOKEN = process.env.TURBOSLIDE_TOKEN;
const [deck, mode] = process.argv.slice(2);
const call = async (action, input) => {
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${deck}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-turboslide-author': 'agent:polish-audit-cleanup' }, body: JSON.stringify(input) });
  return { status: r.status, body: await r.text() };
};
const info = await call('deck.info', {});
console.log('info', info.status, info.body.slice(0, 120));
if (mode === 'remove') {
  const rev = JSON.parse(info.body).revision ?? 0;
  const t = await call('deck.trash', { id: deck, baseRevision: rev });
  console.log('trash', t.status, t.body.slice(0, 160));
  const rm = await call('deck.remove', { id: deck, confirm: true, baseRevision: rev + 1 });
  console.log('remove', rm.status, rm.body.slice(0, 200));
  if (rm.status >= 400) {
    const rm2 = await call('deck.remove', { id: deck, confirm: true });
    console.log('remove without baseRevision', rm2.status, rm2.body.slice(0, 200));
  }
}
for (const p of ['/edit/', '/deck/']) {
  const r = await fetch(`${BASE}${p}${deck}`);
  console.log('GET', p + deck, r.status);
}
