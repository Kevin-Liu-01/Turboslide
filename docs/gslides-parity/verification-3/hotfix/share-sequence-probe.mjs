#!/usr/bin/env node
// The share link sequence on a hosted deployment (VERIFICATION-3 finding 34; hotfix B; SPEC-3
// 6.4): a one slide scratch copy through the bearer; mint a viewer link; exchange it as a fresh
// browser navigation (node:https with Chrome's fetch metadata, the way the /s/ route wants it);
// mint a commenter link (the second mint after another instance's exchange wrote the visitor's
// grant: the write that met the raw Blob sentence on production); revoke the viewer link;
// exchange it again on many requests over the record cache's TTL (5 s) plus a margin so several
// instances answer; an unknown token. Nothing secret is printed: the bearer, the OIDC token, the
// tokens and the cookie values are masked.
//   TURBOSLIDE_TOKEN=<bearer> VERCEL_OIDC_TOKEN=<pulled> node share-sequence-probe.mjs --base <origin> [--out <json>]
import { writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = (value('base', '') ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error('pass --base');
  process.exit(2);
}
const OUT = value('out', null);
const bearer = process.env.TURBOSLIDE_TOKEN ?? '';
const oidc = process.env.VERCEL_OIDC_TOKEN ?? '';
if (!bearer) {
  console.error('TURBOSLIDE_TOKEN missing');
  process.exit(2);
}
const protection = oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {};
const tokens = [];
const mask = (text) => {
  let out = String(text).replaceAll(bearer, '<bearer>');
  if (oidc) out = out.replaceAll(oidc, '<oidc>');
  for (const t of tokens) if (t) out = out.replaceAll(t, '<token>');
  return out.replace(/__Host-ts_id=[^;\s"]+/g, '__Host-ts_id=<sealed>');
};
const rows = [];
const row = (name, ok, evidence) => {
  rows.push({ name, ok, evidence: mask(evidence) });
  console.log(mask(`${ok ? 'ok  ' : ok === null ? 'note' : 'FAIL'} ${name}: ${evidence}`));
};
const t = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function raw(path, headers = {}, method = 'GET') {
  const url = new URL(path, BASE);
  const lib = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = lib(
      url,
      { method, headers: { host: url.host, ...protection, ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}
async function action(name, deck, body) {
  const t0 = t();
  const r = await fetch(`${BASE}/api/actions/${name}?deck=${deck}`, {
    method: 'POST',
    headers: {
      ...protection,
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: r.status,
    json,
    text,
    ms: Math.round(t() - t0),
    instance: r.headers.get('x-vercel-id') ?? '-',
  };
}
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const NAVIGATE = {
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'user-agent': CHROME,
};
const setCookies = (h) =>
  Array.isArray(h['set-cookie']) ? h['set-cookie'] : h['set-cookie'] ? [h['set-cookie']] : [];
const describe = (r) =>
  `${r.status}; location ${r.headers.location ?? '-'}; x-robots-tag ${r.headers['x-robots-tag'] ?? '-'}; instance ${(r.headers['x-vercel-id'] ?? '-').toString().slice(-14)}${r.status >= 400 ? `; body ${r.text.slice(0, 120).replaceAll('\n', ' ')}` : ''}`;
const RAW_BLOB = /changed in the Blob store since it was read/;

const info = await action('deck.info', 'gt-brand', {});
row(
  'deck.info gt-brand through the bearer',
  info.status === 200,
  `status ${info.status} revision ${info.json?.revision ?? '-'} in ${info.ms} ms`,
);
const list = await action('slide.list', 'gt-brand', {});
const firstSlide = Array.isArray(list.json) ? list.json[0]?.id : list.json?.slides?.[0]?.id;
const scratch = `verifier-share-${Date.now().toString(36)}`;
const copy = await action('deck.copy', 'gt-brand', {
  id: 'gt-brand',
  name: 'Verifier share sequence',
  newId: scratch,
  slideIds: firstSlide ? [firstSlide] : undefined,
  baseRevision: info.json?.revision ?? 0,
});
row('deck.copy scratch (one slide)', copy.status === 200, `status ${copy.status} in ${copy.ms} ms`);
if (copy.status !== 200) {
  console.log(mask(copy.text.slice(0, 300)));
  process.exit(1);
}
let rev = (await action('share.get', scratch, { id: scratch })).json?.record?.revision ?? 0;

// 1. the viewer link
const link = await action('share.createLink', scratch, {
  id: scratch,
  role: 'viewer',
  label: 'verifier viewer',
  baseRevision: rev,
});
rev = link.json?.record?.revision ?? rev;
const token =
  link.status === 200 ? (new URL(link.json.url, BASE).pathname.split('/').pop() ?? '') : '';
tokens.push(token);
row(
  '1. share.createLink viewer',
  link.status === 200 && token.length > 0,
  `status ${link.status} in ${link.ms} ms; /s/<${token.length} chars>; link id ${link.json?.link?.id ?? '-'}; record revision ${rev}`,
);
// 2. the exchange from a fresh context (a first navigation with no cookie), polled until it lands
const mintedAt = t();
let landed = await raw(`/s/${token}`, NAVIGATE);
let tries = 1;
while (landed.status !== 303 && t() - mintedAt < 60_000) {
  await sleep(1000);
  landed = await raw(`/s/${token}`, NAVIGATE);
  tries += 1;
}
const cookie =
  setCookies(landed.headers)
    .find((c) => c.startsWith('__Host-ts_id='))
    ?.split(';')[0] ?? '';
row(
  '2. the viewer link exchanged from a fresh context: 303 to /deck/<id> with the sealed cookie',
  landed.status === 303 &&
    (landed.headers.location ?? '').startsWith(`/deck/${scratch}`) &&
    cookie !== '',
  `${describe(landed)}; landed on try ${tries}, ${Math.round(t() - mintedAt)} ms after the mint`,
);
// 3. the commenter link: the second mint after the exchange wrote the visitor's grant
const current = await action('share.get', scratch, { id: scratch });
const recRev = current.json?.record?.revision ?? rev;
const clink = await action('share.createLink', scratch, {
  id: scratch,
  role: 'commenter',
  label: 'verifier commenter',
  baseRevision: recRev,
});
const ctoken =
  clink.status === 200 ? (new URL(clink.json.url, BASE).pathname.split('/').pop() ?? '') : '';
tokens.push(ctoken);
row(
  '3. share.createLink commenter after the exchange: 200, no raw Blob sentence',
  clink.status === 200 && ctoken.length > 0 && !RAW_BLOB.test(clink.text),
  `status ${clink.status} in ${clink.ms} ms; based on record revision ${recRev} (the mint answered ${rev}, the exchange moved it to ${recRev}); body ${clink.status === 200 ? 'the record' : clink.text.slice(0, 160)}`,
);
if (clink.status !== 200) {
  // a 409 with the SPEC-3 sentence and the current record is the mapped conflict; retry once on it
  const again = await action('share.get', scratch, { id: scratch });
  const retry = await action('share.createLink', scratch, {
    id: scratch,
    role: 'commenter',
    label: 'verifier commenter',
    baseRevision: again.json?.record?.revision ?? recRev,
  });
  row(
    '3b. the retry on the current record',
    retry.status === 200 && !RAW_BLOB.test(retry.text),
    `first answer ${clink.status} ${/sharing settings changed/.test(clink.text) ? 'with the SPEC-3 sentence' : 'without the SPEC-3 sentence'}; retry ${retry.status} in ${retry.ms} ms`,
  );
  if (retry.status === 200)
    tokens.push(new URL(retry.json.url, BASE).pathname.split('/').pop() ?? '');
}
if (ctoken) {
  const since = t();
  let c = await raw(`/s/${ctoken}`, NAVIGATE);
  while (c.status !== 303 && t() - since < 60_000) {
    await sleep(1000);
    c = await raw(`/s/${ctoken}`, NAVIGATE);
  }
  row(
    '3c. the commenter link lands on /edit/<id>',
    c.status === 303 && (c.headers.location ?? '').startsWith(`/edit/${scratch}`),
    `${describe(c)} ${Math.round(t() - since)} ms after the mint`,
  );
}
// 4. revoke the viewer link
const before = await raw(`/s/${token}`, NAVIGATE);
const rec2 = await action('share.get', scratch, { id: scratch });
const revoke = await action('share.revokeLink', scratch, {
  id: scratch,
  linkId: link.json?.link?.id,
  baseRevision: rec2.json?.record?.revision ?? recRev,
});
row(
  '4. share.revokeLink viewer: 200, no raw Blob sentence',
  revoke.status === 200 && !RAW_BLOB.test(revoke.text),
  `alive before ${before.status}; revoke ${revoke.status} in ${revoke.ms} ms${revoke.status !== 200 ? `; ${revoke.text.slice(0, 160)}` : ''}`,
);
// 5. exchange again: dead on every instance within the TTL (5 s) plus a margin
const revokedAt = t();
const samples = [];
let firstDead = null;
while (t() - revokedAt < 20_000) {
  const r = await raw(`/s/${token}`, NAVIGATE);
  const at = Math.round(t() - revokedAt);
  samples.push({
    at,
    status: r.status,
    instance: (r.headers['x-vercel-id'] ?? '-').toString().slice(-12),
  });
  if (r.status === 404 && firstDead === null) firstDead = at;
  await sleep(700);
}
const afterTtl = samples.filter((s) => s.at > 6000);
const instances = new Set(samples.map((s) => s.instance));
row(
  '5. the revoked link answers 404 on every request after the 5 s TTL',
  afterTtl.length > 0 && afterTtl.every((s) => s.status === 404),
  `first 404 at ${firstDead ?? 'never'} ms; ${samples.length} navigations over 20 s on ${instances.size} instance id(s); after 6 s: ${afterTtl.map((s) => s.status).join(' ')}`,
);
row(
  '5b. the revoke was seen at once on the instance that served it',
  firstDead !== null && firstDead < 3000,
  `first 404 at ${firstDead ?? 'never'} ms`,
);
// 6. an unknown token
const unknown = await raw('/s/aaaaaaaaaaaaaaaaaaaaaa', NAVIGATE);
row(
  '6. an unknown token is the 404 page with the sentence',
  unknown.status === 404 && /not available to you, or does not exist/.test(unknown.text),
  describe(unknown),
);
// cleanup
const i4 = await action('deck.info', scratch, {});
const trash = await action('deck.trash', scratch, {
  id: scratch,
  baseRevision: i4.json?.revision ?? 0,
});
const i5 = await action('deck.info', scratch, {});
const rm = await action('deck.remove', scratch, {
  id: scratch,
  confirm: true,
  baseRevision: i5.json?.revision ?? i4.json?.revision ?? 0,
});
row(
  'scratch deck removed',
  trash.status === 200 && rm.status === 200,
  `deck.trash ${trash.status}; deck.remove ${rm.status}`,
);
const fails = rows.filter((r) => r.ok === false).length;
console.log(`${rows.filter((r) => r.ok === true).length} ok, ${fails} fail`);
if (OUT)
  writeFileSync(
    OUT,
    JSON.stringify({ base: BASE, at: new Date().toISOString(), rows, samples }, null, 2),
  );
process.exit(fails > 0 ? 1 : 0);
