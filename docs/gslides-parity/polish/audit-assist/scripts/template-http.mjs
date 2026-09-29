const BASE = 'https://www.turboslide.com';
const TOKEN = process.env.TURBOSLIDE_TOKEN;
const call = async (action, input, deck = 'gt-brand') => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${deck}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-turboslide-author': 'agent:polish-audit-cleanup' }, body: JSON.stringify(input) });
  const text = await r.text();
  return { status: r.status, ms: Date.now() - t0, body: text.slice(0, 400) };
};
const mode = process.argv[2] ?? 'list';
if (mode === 'list') {
  for (let i = 0; i < 3; i += 1) {
    const r = await call('template.list', {});
    const j = JSON.parse(r.body.length >= 400 ? '{}' : r.body);
    console.log('list', r.status, r.ms, 'ms', j.templates ? j.templates.map((t) => t.id).join(',') : r.body.slice(0, 200));
    await new Promise((res) => setTimeout(res, 1500));
  }
} else if (mode === 'delete') {
  const r = await call('template.delete', { id: process.argv[3], confirm: true });
  console.log('delete', r.status, r.ms, 'ms', r.body);
}
