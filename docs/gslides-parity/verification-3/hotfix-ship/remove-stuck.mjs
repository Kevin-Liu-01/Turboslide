const BASE = 'https://turboslide.vercel.app',
  DECK = 'verifier-share-mu1bbz0b';
const bearer = process.env.TURBOSLIDE_TOKEN;
const act = async (a, b) => {
  const r = await fetch(`${BASE}/api/actions/${a}?deck=${DECK}`, {
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
const g = await act('deck.info');
if (g.status === 404) {
  console.log('gone');
  process.exit(0);
}
if (g.status === 200) {
  let rev = g.json.revision;
  if (!g.json.trashedAt) {
    const tr = await act('deck.trash', { id: DECK, baseRevision: rev });
    if (tr.status === 200) {
      const a = await act('deck.info');
      if (a.status === 200) rev = a.json.revision;
    }
  }
  let rm = await act('deck.remove', { id: DECK, confirm: true, baseRevision: rev });
  if (rm.status === 409) {
    const m = /at revision (\d+)/.exec(rm.json?.error?.message ?? '');
    if (m) rm = await act('deck.remove', { id: DECK, confirm: true, baseRevision: Number(m[1]) });
  }
  if (rm.json?.removed) {
    console.log('removed');
    process.exit(0);
  }
  console.log(
    `still stuck: info 200 rev ${rev}, remove ${rm.status} ${(rm.json?.error?.message ?? '').slice(0, 60)}`,
  );
  process.exit(1);
}
console.log(`info ${g.status} ${(g.json?.error?.message ?? '').slice(0, 60)}`);
process.exit(1);
