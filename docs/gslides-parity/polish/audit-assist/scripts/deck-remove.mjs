const BASE = 'https://www.turboslide.com';
const TOKEN = process.env.TURBOSLIDE_TOKEN;
const [deck] = process.argv.slice(2);
const call = async (action, input) => {
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${deck}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-turboslide-author': 'agent:polish-audit-cleanup' }, body: JSON.stringify(input) });
  return { status: r.status, body: await r.text() };
};
const info = await call('deck.info', {});
const rev = JSON.parse(info.body).revision ?? 0;
const rm = await call('deck.remove', { id: deck, confirm: true, baseRevision: rev });
console.log('remove', rm.status, rm.body.slice(0, 200));
await new Promise((r) => setTimeout(r, 2000));
for (const p of ['/edit/', '/deck/']) {
  const r = await fetch(`${BASE}${p}${deck}`);
  console.log('GET', p + deck, r.status);
}
