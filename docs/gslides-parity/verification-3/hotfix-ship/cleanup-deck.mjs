// Trash and remove a scratch deck on a host through the bearer (read in code), the product's own
// actions. TURBOSLIDE_TOKEN in the env (run-with-token.mjs supplies it).
const BASE = process.argv[2];
const DECK = process.argv[3];
const bearer = process.env.TURBOSLIDE_TOKEN;
const act = async (action, body) => {
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${DECK}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text: text.slice(0, 160) };
};
const info = await act('deck.info');
console.log('deck.info', info.status, JSON.stringify(info.json ?? info.text).slice(0, 120));
if (info.status === 404 || info.json === null) { console.log('already gone'); process.exit(0); }
let rev = info.json.revision ?? 0;
if (!info.json.trashedAt) {
  const t = await act('deck.trash', { id: DECK, baseRevision: rev });
  console.log('deck.trash', t.status, JSON.stringify(t.json ?? t.text).slice(0, 120));
  const after = await act('deck.info');
  rev = after.json?.revision ?? rev + 1;
}
const rm = await act('deck.remove', { id: DECK, confirm: true, baseRevision: rev });
console.log('deck.remove', rm.status, JSON.stringify(rm.json ?? rm.text).slice(0, 120));
const gone = await act('deck.info');
console.log('after remove, deck.info', gone.status, JSON.stringify(gone.json ?? gone.text).slice(0, 80));
