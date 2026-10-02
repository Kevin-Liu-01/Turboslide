// Removes one scratch deck by id: deck.info (revision), deck.trash, deck.remove, deck.info again (404 expected).
const [base, id] = process.argv.slice(2);
const call = async (action, body) => { const r = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(id)}`, { method: 'POST', headers: { authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, j, t }; };
const info = await call('deck.info', {});
if (info.status !== 200) { console.log(id, 'info', info.status, info.t.slice(0, 160)); process.exit(0); }
let rev = (info.j?.result ?? info.j)?.revision;
const trash = await call('deck.trash', { id, baseRevision: rev });
const trashed = trash.j?.result ?? trash.j; rev = trashed?.revision ?? rev;
if (trash.status !== 200) console.log(id, 'trash', trash.status, trash.t.slice(0, 160));
const info2 = await call('deck.info', {}); rev = (info2.j?.result ?? info2.j)?.revision ?? rev;
const remove = await call('deck.remove', { id, confirm: true, baseRevision: rev });
if (remove.status !== 200) console.log(id, 'remove', remove.status, remove.t.slice(0, 200));
const after = await call('deck.info', {});
console.log(id, `trash ${trash.status}, remove ${remove.status}, info after ${after.status} ${after.status === 404 ? (after.j?.error?.message ?? '') : ''}`);
