const BASE = 'https://turboslide.vercel.app';
const bearer = process.env.TURBOSLIDE_TOKEN;
const act = async (a, b) => {
  const r = await fetch(`${BASE}/api/actions/${a}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(b ?? {}),
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, text: t };
};
const norm = (v) => (Array.isArray(v) ? v : Array.isArray(v?.decks) ? v.decks : []);
for (const scope of [{}, { trashed: true }, { filter: 'trash' }]) {
  const l = await act('deck.list', scope);
  const decks = norm(l.json).map((d) => d.id ?? d);
  const mine = decks.filter(
    (id) => /2026091[34]/.test(id) && /^(ship-|verifier-|untitled-|e2e-|probe-)/.test(id),
  );
  console.log(
    `${JSON.stringify(scope)}: ${l.status}; ${decks.length} deck(s); mine-scratch: ${mine.length ? mine.join(', ') : 'none'}; all: ${decks.join(', ').slice(0, 200)}`,
  );
}
