// The published player gate on a dev server (hotfix B R1; SPEC-3 6.4): copy one slide of
// gt-brand, publish, GET the player and the embed with the token (200, noindex header and meta),
// unpublish, GET again (410 with the sentence), then trash and remove. Cookieless localhost calls
// are the checkout holder (agent:localhost).
const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const H = process.env.VERCEL_OIDC_TOKEN
  ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
  : {};
const bearer = process.env.TURBOSLIDE_TOKEN
  ? { authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}` }
  : {};
let fails = 0;
const row = (ok, name, ev) => {
  if (!ok) fails += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${ev}`);
};
const act = async (action, deck, body) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/actions/${action}?deck=${deck}`, {
    method: 'POST',
    headers: { ...H, ...bearer, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text, ms: Date.now() - t0 };
};
// the player is a browser with the sealed identity cookie (the principal middleware mints it on
// the first request): a cookieless request is a 401 in decide(), which shadow mode admits before
// the publish token is read, so the probe holds the cookie of its first page like a browser does
let cookie = '';
const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, {
    headers: { ...H, accept: 'text/html', ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  });
  const set = r.headers.getSetCookie?.() ?? [];
  const id = set.find((c) => c.startsWith('__Host-ts_id='));
  if (id) cookie = id.split(';')[0];
  return { status: r.status, robots: r.headers.get('x-robots-tag'), text: await r.text() };
};
const mask = (s) => String(s).replace(/p=[A-Za-z0-9_-]+/g, 'p=<token>');
const info = await act('deck.info', 'gt-brand');
const list = await act('slide.list', 'gt-brand');
const first = Array.isArray(list.json) ? list.json[0]?.id : list.json?.slides?.[0]?.id;
const id = `verifier-pub-${Date.now().toString(36)}`;
const copy = await act('deck.copy', 'gt-brand', {
  id: 'gt-brand',
  name: 'Verifier publish probe',
  newId: id,
  slideIds: first ? [first] : undefined,
  baseRevision: info.json?.revision ?? 0,
});
row(copy.status === 200, 'deck.copy one slide', `${copy.status} in ${copy.ms} ms`);
if (copy.status !== 200) {
  console.log(copy.text.slice(0, 300));
  process.exit(1);
}
const rec = await act('share.get', id, { id });
let rev = rec.json?.record?.revision ?? 0;
const pub = await act('deck.publish', id, { id, baseRevision: rev });
row(
  pub.status === 200 && typeof pub.json?.url === 'string' && pub.json.url.includes('?p='),
  'deck.publish answers the player url with ?p=',
  mask(`${pub.status} ${JSON.stringify(pub.json).slice(0, 160)}`),
);
const url = new URL(pub.json?.url ?? '/', BASE);
const playerPath = url.pathname + url.search;
const embedPath = pub.json?.embed
  ? (() => {
      const u = new URL(pub.json.embed, BASE);
      return u.pathname + u.search;
    })()
  : null;
const minted = await get('/decks');
row(
  cookie !== '',
  'the first page minted the identity cookie for the player',
  `${minted.status}; cookie ${cookie ? 'held (value not printed)' : 'absent'}`,
);
const player = await get(playerPath);
row(
  player.status === 200 &&
    /noindex/.test(player.robots ?? '') &&
    /<meta name="robots" content="noindex"/.test(player.text),
  'the player answers 200 with x-robots-tag noindex and the robots meta',
  mask(
    `${player.status}; x-robots-tag ${player.robots}; meta ${/<meta name="robots" content="noindex"/.test(player.text)}; ${playerPath}`,
  ),
);
if (embedPath) {
  const embed = await get(embedPath);
  row(
    embed.status === 200 &&
      /noindex/.test(embed.robots ?? '') &&
      /<meta name="robots" content="noindex"/.test(embed.text),
    'the embed answers 200 with noindex header and meta',
    mask(`${embed.status}; x-robots-tag ${embed.robots}; ${embedPath}`),
  );
}
const plain = await get(`/deck/${id}`);
row(
  plain.status === 200 && !/noindex/.test(plain.robots ?? ''),
  'the plain /deck answers 200 without the header',
  `${plain.status}; x-robots-tag ${plain.robots}`,
);
const bad = await get(`/deck/${id}?p=${'x'.repeat(22)}`);
row(
  bad.status === 200 || bad.status === 404,
  'a wrong token is not a 410 (shadow admits, enforce 404)',
  `${bad.status}`,
);
rev = (await act('share.get', id, { id })).json?.record?.revision ?? rev;
const unpub = await act('deck.unpublish', id, { id, baseRevision: rev });
row(unpub.status === 200, 'deck.unpublish', `${unpub.status} in ${unpub.ms} ms`);
const gone = await get(playerPath);
row(
  gone.status === 410 &&
    /This presentation is no longer published/.test(gone.text) &&
    /noindex/.test(gone.robots ?? ''),
  'the player answers 410 with the sentence after unpublish',
  mask(
    `${gone.status}; x-robots-tag ${gone.robots}; sentence ${/no longer published/.test(gone.text)}`,
  ),
);
if (embedPath) {
  const goneEmbed = await get(embedPath);
  row(goneEmbed.status === 410, 'the embed answers 410 after unpublish', `${goneEmbed.status}`);
}
const after = await get(`/deck/${id}`);
row(
  after.status === 200,
  'the plain /deck still answers 200 after unpublish (shadow)',
  `${after.status}`,
);
const i2 = await act('deck.info', id, { id });
const trash = await act('deck.trash', id, { id, baseRevision: i2.json?.revision ?? 0 });
const i3 = await act('deck.info', id, { id });
const rm = await act('deck.remove', id, {
  id,
  confirm: true,
  baseRevision: i3.json?.revision ?? i2.json?.revision ?? 0,
});
row(
  trash.status === 200 && rm.status === 200,
  'scratch deck trashed and removed',
  `trash ${trash.status}, remove ${rm.status}`,
);
console.log(
  `publish-410-probe: ${fails === 0 ? 'all rows ok' : `${fails} row(s) failed`} against ${BASE}`,
);
process.exit(fails ? 1 : 0);
