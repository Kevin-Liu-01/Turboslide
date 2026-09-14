#!/usr/bin/env node
// The verifier's second pass over the `/s/<token>` exchange and the blob tier's comment write on
// the preview (VERIFICATION-3 findings 6 and 18; SPEC-3 6.4, 8.14, 16.4). Pass 1 probed the
// exchange with Node's fetch(), which cannot navigate (undici stamps `sec-fetch-mode: cors` on
// every request), so every navigation here goes through node:https.request with the browser's
// headers written out (B3's mechanics, docs/gslides-parity/build-3/b3-fix/preview-exchange-probe.mjs)
// and one fetch() row keeps the pass 1 shape on purpose. Rows: a viewer link minted through the
// bearer on a scratch copy lands (303 to /deck/<id>, the sealed cookie, no-referrer, noindex) and
// how long after the mint it first lands (the process local record cache of the blob tier); the
// same navigation holding the cookie; a cors fetch and a Node fetch are 403 with the sentence
// naming the fetch metadata; a curl navigation lands; a cross site navigation lands; a commenter
// link lands on /edit; a revoked link is the 404 page and how long after the revoke; an unknown
// token is the 404 page; comment.add and comment.list through the bearer on the blob tier. The
// scratch copy is trashed and removed at the end. Nothing secret is printed: the bearer, the OIDC
// token, the share tokens and the cookie values are masked in every line.
//   TURBOSLIDE_TOKEN=<bearer> VERCEL_OIDC_TOKEN=<pulled> node preview-exchange.mjs --base <origin> [--out <json>]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = (value('base', '') ?? '').replace(/\/$/, '');
if (BASE === '') {
  console.error('pass --base <origin>');
  process.exit(2);
}
const OUT = value('out', null);
const bearer = process.env.TURBOSLIDE_TOKEN ?? '';
const oidc = process.env.VERCEL_OIDC_TOKEN ?? '';
if (bearer === '') {
  console.error('TURBOSLIDE_TOKEN is not in the environment');
  process.exit(2);
}
const protection = oidc === '' ? {} : { 'x-vercel-trusted-oidc-idp-token': oidc };
const tokens = [];
const mask = (text) => {
  let out = String(text).replaceAll(bearer, '<bearer>');
  if (oidc !== '') out = out.replaceAll(oidc, '<oidc>');
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

/** A raw request with exactly the headers given; redirects are never followed. */
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
  const json = await r.json().catch(() => null);
  return { status: r.status, json, ms: Math.round(t() - t0) };
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
  `${r.status}; location ${r.headers.location ?? '-'}; referrer-policy ${r.headers['referrer-policy'] ?? '-'}; x-robots-tag ${r.headers['x-robots-tag'] ?? '-'}; set-cookie ${
    setCookies(r.headers)
      .map((c) => c.split('=')[0])
      .join(',') || 'none'
  }${r.status >= 400 ? `; body ${r.text.slice(0, 160).replaceAll('\n', ' ')}` : ''}`;

/** polls a navigation until it answers `want`, up to `limit` ms; answers the ms after `since` */
async function untilStatus(path, headers, want, since, limit = 90_000) {
  let r = await raw(path, headers);
  while (r.status !== want && t() - since < limit) {
    await sleep(2_000);
    r = await raw(path, headers);
  }
  return { r, ms: Math.round(t() - since) };
}

const info = await action('deck.info', 'gt-brand', {});
row(
  'deck.info gt-brand through the bearer',
  info.status === 200,
  `status ${info.status} revision ${info.json?.revision ?? '-'} in ${info.ms} ms`,
);
const scratch = `verifier-x-${Date.now().toString(36)}`;
const list = await action('slide.list', 'gt-brand', {});
const firstSlide = Array.isArray(list.json) ? list.json[0]?.id : list.json?.slides?.[0]?.id;
const copy = await action('deck.copy', 'gt-brand', {
  id: 'gt-brand',
  name: 'Verifier exchange probe',
  newId: scratch,
  slideIds: firstSlide ? [firstSlide] : undefined,
  baseRevision: info.json?.revision ?? 0,
});
row('deck.copy scratch (one slide)', copy.status === 200, `status ${copy.status} in ${copy.ms} ms`);
if (copy.status !== 200) {
  console.log(mask(JSON.stringify(copy.json).slice(0, 300)));
  process.exit(1);
}
let rev = (await action('deck.info', scratch, {})).json?.revision ?? 0;
const record = await action('share.get', scratch, { id: scratch });
const rec = record.json?.record ?? {};
row(
  'the copy starts restricted with an owner (6.1; the bearer caller is the owner)',
  rec.generalAccess?.mode === 'restricted' && typeof rec.owner === 'string',
  `generalAccess ${JSON.stringify(rec.generalAccess)}; owner ${rec.owner ?? 'null'}; record revision ${rec.revision}; caller role ${record.json?.role} via ${record.json?.via}`,
);
// the viewer link
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
  'share.createLink viewer through the bearer',
  link.status === 200 && token.length > 0,
  `status ${link.status} in ${link.ms} ms; url path /s/<${token.length} chars>; link id ${link.json?.link?.id ?? '-'}; the address carries the token once, never the record`,
);
const mintedAt = t();
let cookie = '';
if (token) {
  const path = `/s/${token}`;
  const first = await raw(path, NAVIGATE);
  const landed =
    first.status === 303
      ? { r: first, ms: Math.round(t() - mintedAt) }
      : await untilStatus(path, NAVIGATE, 303, mintedAt);
  const loc = landed.r.headers.location ?? '';
  const id = setCookies(landed.r.headers).find((c) => c.startsWith('__Host-ts_id='));
  cookie = id ? id.split(';')[0] : '';
  row(
    'A. a first navigation lands: 303 to /deck/<id>, the sealed cookie, no-referrer, noindex',
    landed.r.status === 303 &&
      loc.startsWith(`/deck/${scratch}`) &&
      cookie !== '' &&
      landed.r.headers['referrer-policy'] === 'no-referrer' &&
      /noindex/.test(landed.r.headers['x-robots-tag'] ?? ''),
    `first answer ${first.status} (the request itself took ${Math.round(landed.ms)} ms when it landed first); landed ${describe(landed.r)} ${landed.ms} ms after the mint${
      id
        ? `; cookie attrs ${id
            .split(';')
            .slice(1)
            .map((a) => a.trim())
            .join(' ')}`
        : ''
    }`,
  );
  const again = await raw(path, { ...NAVIGATE, ...(cookie ? { cookie } : {}) });
  row('B. the same browser again with the cookie lands', again.status === 303, describe(again));
  const curl = await raw(path, { 'user-agent': 'curl/8.7.1', accept: '*/*' });
  row('C. no fetch metadata (curl) lands', curl.status === 303, describe(curl));
  const cross = await raw(path, {
    ...NAVIGATE,
    'sec-fetch-site': 'cross-site',
    referer: 'https://example.org/',
  });
  row('D. a cross site navigation lands', cross.status === 303, describe(cross));
  const cors = await raw(path, {
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'sec-fetch-site': 'same-origin',
    'user-agent': CHROME,
  });
  row(
    'E. a cors fetch is 403 with the sentence naming the fetch metadata (6.4)',
    cors.status === 403 && /Sec-Fetch-Mode/i.test(cors.text),
    describe(cors),
  );
  const f = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: {
      ...protection,
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-site': 'none',
      'user-agent': CHROME,
    },
  });
  const fh = Object.fromEntries([...f.headers.entries()]);
  row(
    'F. Node fetch() asking for navigate is 403 (undici sends cors: the pass 1 probe artifact)',
    f.status === 403,
    describe({ status: f.status, headers: fh, text: await f.text() }),
  );
  let curlLine = '?';
  try {
    const out = execFileSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-D',
        '-',
        '-H',
        `x-vercel-trusted-oidc-idp-token: ${oidc}`,
        '-H',
        'Sec-Fetch-Mode: navigate',
        '-H',
        'Sec-Fetch-Dest: document',
        '-H',
        'Sec-Fetch-Site: none',
        '-A',
        CHROME,
        `${BASE}${path}`,
      ],
      { encoding: 'utf8' },
    );
    curlLine =
      out
        .split('\n')
        .filter((l) => l.startsWith('HTTP/'))
        .pop()
        ?.trim() ?? '?';
  } catch (error) {
    curlLine = `curl failed: ${String(error).slice(0, 80)}`;
  }
  row('G. real curl with the navigation headers lands', /\b303\b/.test(curlLine), curlLine);
  // the viewer page behind the cookie: no notes in the payload
  const deckPage = await raw(`/deck/${scratch}`, { ...NAVIGATE, cookie });
  row(
    'the viewer page carries no notes key',
    deckPage.status === 200 && !/"notes"/.test(deckPage.text),
    `status ${deckPage.status}; ${deckPage.text.length} bytes; "notes" ${/"notes"/.test(deckPage.text) ? 'present' : 'absent'}`,
  );
}
// the commenter link
const clink = await action('share.createLink', scratch, {
  id: scratch,
  role: 'commenter',
  label: 'verifier commenter',
  baseRevision: rev,
});
rev = clink.json?.record?.revision ?? rev;
const ctoken =
  clink.status === 200 ? (new URL(clink.json.url, BASE).pathname.split('/').pop() ?? '') : '';
tokens.push(ctoken);
if (ctoken) {
  const since = t();
  const landed = await untilStatus(`/s/${ctoken}`, NAVIGATE, 303, since);
  row(
    'H. a commenter link lands on /edit/<id> (6.4: a commenter link lands on /edit)',
    landed.r.status === 303 && (landed.r.headers.location ?? '').startsWith(`/edit/${scratch}`),
    `${describe(landed.r)} at ${landed.ms} ms after the mint`,
  );
}
// the revoke: the record's revision is read back first (the exchange writes a grant on the record,
// so the revision the mint answered may be stale by the time of the revoke)
if (token && link.json?.link?.id) {
  const alive = await raw(`/s/${token}`, NAVIGATE);
  const current = await action('share.get', scratch, { id: scratch });
  const recRev = current.json?.record?.revision ?? rev;
  const revoke = await action('share.revokeLink', scratch, {
    id: scratch,
    linkId: link.json.link.id,
    baseRevision: recRev,
  });
  const since = t();
  const dead = await untilStatus(`/s/${token}`, NAVIGATE, 404, since);
  row(
    'I. the revoked viewer link is the 404 page (6.4: a revocation kills the grant)',
    alive.status === 303 && revoke.status === 200 && dead.r.status === 404,
    `alive before the revoke ${alive.status}; record revision ${recRev} (the mint answered ${link.json?.record?.revision}); share.revokeLink ${revoke.status}${revoke.status !== 200 ? ` ${JSON.stringify(revoke.json).slice(0, 160)}` : ''}; then ${describe(dead.r).slice(0, 120)} ${dead.ms} ms after the revoke`,
  );
}
const unknown = await raw('/s/aaaaaaaaaaaaaaaaaaaaaa', NAVIGATE);
row(
  'J. an unknown token is the 404 page with the sentence',
  unknown.status === 404 && /not available to you, or does not exist/.test(unknown.text),
  describe(unknown),
);
// comments on the blob tier through the bearer (finding 6)
const slides = await action('slide.list', scratch, {});
const sid = Array.isArray(slides.json) ? slides.json[0]?.id : slides.json?.slides?.[0]?.id;
const added = await action('comment.add', scratch, {
  anchor: { kind: 'slide', slideId: sid },
  body: { text: 'Verifier pass 2: a comment on the blob tier', mentions: [] },
});
row(
  'comment.add through the bearer on the blob tier answers a thread (finding 6)',
  added.status === 200 && typeof (added.json?.thread?.id ?? added.json?.id) === 'string',
  `status ${added.status} in ${added.ms} ms; ${JSON.stringify(added.json).slice(0, 160)}`,
);
const listed = await action('comment.list', scratch, {});
const threads = Array.isArray(listed.json?.threads)
  ? listed.json.threads
  : Array.isArray(listed.json)
    ? listed.json
    : [];
row(
  'comment.list reads it back',
  listed.status === 200 && threads.length >= 1,
  `status ${listed.status} in ${listed.ms} ms; ${threads.length} threads; comments revision ${listed.json?.revision ?? '-'}`,
);
// cleanup
const info4 = await action('deck.info', scratch, {});
const trash = await action('deck.trash', scratch, {
  id: scratch,
  baseRevision: info4.json?.revision ?? 0,
});
const info5 = await action('deck.info', scratch, {});
const rm = await action('deck.remove', scratch, {
  id: scratch,
  confirm: true,
  baseRevision: info5.json?.revision ?? info4.json?.revision ?? 0,
});
row(
  'scratch deck removed',
  trash.status === 200 && rm.status === 200,
  `deck.trash ${trash.status}; deck.remove ${rm.status}`,
);
const fails = rows.filter((r) => r.ok === false).length;
console.log(
  `${rows.filter((r) => r.ok === true).length} ok, ${fails} fail, ${rows.filter((r) => r.ok === null).length} note`,
);
if (OUT)
  writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 2));
process.exit(fails > 0 ? 1 : 0);
