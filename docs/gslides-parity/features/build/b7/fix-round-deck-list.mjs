// The deployment's deck list through deck.list with the bearer (never printed): ids and titles alone.
const BASE = process.argv[2].replace(/\/$/, '');
const headers = {
  'content-type': 'application/json',
  authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}`,
  ...(process.env.VERCEL_OIDC_TOKEN
    ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
    : {}),
};
const res = await fetch(`${BASE}/api/actions/deck.list?deck=gt-brand`, {
  method: 'POST',
  headers,
  body: '{}',
  redirect: 'manual',
});
const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}
const decks = Array.isArray(body) ? body : (body.decks ?? body.items ?? body.result ?? body);
console.log('status', res.status, Array.isArray(decks) ? `${decks.length} decks` : typeof decks);
if (Array.isArray(decks))
  for (const d of decks)
    console.log(
      ' ',
      d.id ?? d.deckId ?? JSON.stringify(d).slice(0, 80),
      '|',
      (d.title ?? d.name ?? '').toString().slice(0, 40),
      '|',
      d.trashed ?? d.trashedAt ?? '',
      '|',
      d.updatedAt ?? d.modifiedAt ?? '',
    );
else console.log(String(text).slice(0, 400));
