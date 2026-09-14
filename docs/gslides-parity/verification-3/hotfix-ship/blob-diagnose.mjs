const BASE = process.argv[2];
const bearer = process.env.TURBOSLIDE_TOKEN;
const act = async (action, deck, body) => {
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${deck}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, text: t };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const removeDeck = async (deck) => {
  for (let i = 0; i < 12; i++) {
    const g = await act('deck.info', deck);
    if (g.status === 404) {
      return `gone after ${i} tries`;
    }
    if (g.status === 200) {
      let rev = g.json.revision;
      if (!g.json.trashedAt) {
        await act('deck.trash', deck, { id: deck, baseRevision: rev });
        const a = await act('deck.info', deck);
        if (a.status === 200) rev = a.json.revision;
        else rev = rev + 1;
      }
      let rm = await act('deck.remove', deck, { id: deck, confirm: true, baseRevision: rev });
      if (rm.status === 409) {
        const m = /at revision (\d+)/.exec(rm.json?.error?.message ?? '');
        if (m)
          rm = await act('deck.remove', deck, {
            id: deck,
            confirm: true,
            baseRevision: Number(m[1]),
          });
      }
      if (rm.json?.removed) {
        const gone = await act('deck.info', deck);
        return `removed on try ${i}; final ${gone.status}`;
      }
      // else 500 blob 403, retry
    }
    await sleep(2000);
  }
  return 'not removed after 12 tries';
};
// 1) clean up the stuck scratch deck
console.log('verifier-share-mu1bbz0b:', await removeDeck('verifier-share-mu1bbz0b'));
// 2) a clean control: fresh copy, immediate info, remove
const info = await act('deck.info', 'gt-brand');
const copyId = `ship-blob-${Date.now().toString(36)}`;
const cp = await act('deck.copy', 'gt-brand', {
  id: 'gt-brand',
  name: 'Blob diagnose',
  newId: copyId,
  slideIds: ['title'],
  baseRevision: info.json.revision,
});
console.log(
  'deck.copy',
  cp.status,
  cp.json?.id ?? (cp.json?.error?.message ?? cp.text).slice(0, 80),
);
if (cp.status === 200) {
  for (let i = 0; i < 6; i++) {
    const g = await act('deck.info', copyId);
    console.log(
      `  control deck.info try ${i}: ${g.status} ${(g.json?.error?.message ?? 'rev ' + g.json?.revision).toString().slice(0, 70)}`,
    );
    await sleep(1200);
  }
  console.log('control remove:', await removeDeck(copyId));
}
