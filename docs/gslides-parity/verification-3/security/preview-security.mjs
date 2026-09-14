#!/usr/bin/env node
// The verifier's manual pass over SPEC-3 section 8's table on the preview (MILESTONES-3
// "Verifier" item 5), the rows curl can drive: the headers of 8.8 and the report only CSP on four
// routes, the agent routes' bearer rule, a cross site text/plain POST, an SVG upload refused
// hosted, safeFetch refusing a loopback URL (through slide.setBackgroundPicture --url), and the
// anonymous comment quota of 8.3 answering 429 with Retry-After and one sentence, on a scratch
// copy of gt-brand that the walk removes. Deployment protection: every request carries the
// development OIDC token from the environment (VERCEL_OIDC_TOKEN, never printed). Usage:
//   node docs/gslides-parity/verification-3/security/preview-security.mjs --base <origin> [--token-env TURBOSLIDE_TOKEN]
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = value('base', 'https://turboslide-igavfcg2x-kl01s-projects.vercel.app').replace(
  /\/$/,
  '',
);
const TOKEN = process.env[value('token-env', 'TURBOSLIDE_TOKEN')] ?? '';
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
const protection = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const rows = [];
const row = (name, ok, evidence) => {
  rows.push({ name, ok, evidence });
  console.log(`${ok ? 'ok  ' : ok === null ? 'skip' : 'FAIL'} ${name}: ${evidence}`);
};
const get = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...init,
    headers: { ...protection, ...(init.headers ?? {}) },
  });
const headersOf = (r) => Object.fromEntries([...r.headers.entries()]);
const t = () => performance.now();
// 1. headers and the report only CSP on four routes (8.8)
const WANT = [
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-request-id',
  'content-security-policy-report-only',
  'strict-transport-security',
];
for (const path of ['/new', '/edit/gt-brand', '/deck/gt-brand', '/embed/gt-brand']) {
  const r = await get(path);
  const h = headersOf(r);
  const missing = WANT.filter((k) => h[k] === undefined);
  const frame = h['x-frame-options'];
  const csp = h['content-security-policy-report-only'] ?? '';
  const workerSrc = /worker-src 'self' blob:/.test(csp);
  const nonce = /'nonce-[A-Za-z0-9+/=_-]+'/.test(csp);
  const embed = path.startsWith('/embed');
  const frameOk = embed
    ? frame === undefined && /frame-ancestors https:\/\/prototemplate\.com/.test(csp)
    : frame === 'DENY';
  row(
    `headers ${path}`,
    r.status === 200 && missing.length === 0 && workerSrc && nonce && frameOk,
    `status ${r.status}; missing ${missing.join(', ') || 'none'}; x-frame-options ${frame ?? 'absent'}; worker-src blob ${workerSrc}; nonce ${nonce}; report-uri ${/report-uri|report-to/.test(csp)}; frame-ancestors ${(csp.match(/frame-ancestors [^;]+/) ?? [''])[0]}`,
  );
}
// 2. the agent routes need the bearer (8.2)
{
  const r = await get('/api/agent');
  const r2 = await get('/api/actions/deck.info?deck=gt-brand', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: '{}',
  });
  row(
    'agent routes without a bearer',
    r.status === 401 && [401, 403].includes(r2.status),
    `/api/agent ${r.status}; POST /api/actions/deck.info ${r2.status}; cache-control ${headersOf(r)['cache-control']}`,
  );
  if (TOKEN) {
    const r3 = await get('/api/actions/deck.info?deck=gt-brand', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: '{}',
    });
    const body = await r3.json().catch(() => null);
    row(
      'deck.info with the bearer',
      r3.status === 200 && typeof body?.revision === 'number',
      `status ${r3.status}; revision ${body?.revision}; snapshots ${body?.counts?.snapshots}`,
    );
  } else row('deck.info with the bearer', null, 'no token in the environment');
}
// 3. a cross site text/plain POST and a form body are refused (8.7)
{
  const r = await get('/api/actions/slide.remove?deck=gt-brand', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
    body: '{"slideId":"x"}',
  });
  const r2 = await get('/api/actions/slide.remove?deck=gt-brand', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://evil.example',
    },
    body: 'slideId=x',
  });
  row(
    'cross site text/plain and form POSTs refused',
    [403, 415].includes(r.status) && [403, 415].includes(r2.status),
    `text/plain ${r.status}; form ${r2.status}`,
  );
}
// 4. an identity cookie for the anonymous rows (7.1): the first /new mints __Host-ts_id
let cookie = '';
{
  const r = await get('/new');
  const set = r.headers.getSetCookie?.() ?? [];
  const id = set.find((c) => c.startsWith('__Host-ts_id='));
  cookie = id ? id.split(';')[0] : '';
  row(
    'the sealed identity cookie on the first request',
    cookie !== '' &&
      /HttpOnly/i.test(id ?? '') &&
      /Secure/i.test(id ?? '') &&
      /SameSite=Lax|SameSite=Strict/i.test(id ?? ''),
    `Set-Cookie ${id ? id.replace(/=[^;]+/, '=<sealed>') : 'none'}`,
  );
}
const anon = (extra = {}) => ({
  ...protection,
  cookie,
  origin: BASE,
  'sec-fetch-site': 'same-origin',
  'content-type': 'application/json',
  ...extra,
});
// 5. an SVG upload is refused hosted while a PNG grant is issued (8.5)
{
  const svg = await get('/api/x/upload/picture', {
    method: 'POST',
    headers: anon(),
    body: JSON.stringify({ deckId: 'gt-brand', contentType: 'image/svg+xml', bytes: 1200 }),
  });
  const svgText = await svg.text();
  const png = await get('/api/x/upload/picture', {
    method: 'POST',
    headers: anon(),
    body: JSON.stringify({ deckId: 'gt-brand', contentType: 'image/png', bytes: 1200 }),
  });
  const pngBody = await png.json().catch(() => null);
  row(
    'an SVG upload is refused hosted while a PNG grant is issued',
    (svg.status === 400 || svg.status === 415) &&
      /png, jpeg, webp or gif|svg/i.test(svgText) &&
      (png.status === 200 || png.status === 201) &&
      typeof pngBody?.token === 'string',
    'svg: status ' +
      svg.status +
      '; ' +
      svgText.slice(0, 120).replace(/\s+/g, ' ') +
      '; png: status ' +
      png.status +
      '; a grant with ' +
      Object.keys(pngBody ?? {}).join(', ') +
      ' (values not printed)',
  );
}
// 6. a scratch copy for the writes (never gt-brand itself)
let scratch = null;
let revision = 0;
if (TOKEN) {
  const bearer = {
    ...protection,
    'content-type': 'application/json',
    authorization: `Bearer ${TOKEN}`,
  };
  const info = await (
    await get('/api/actions/deck.info?deck=gt-brand', {
      method: 'POST',
      headers: bearer,
      body: '{}',
    })
  )
    .json()
    .catch(() => null);
  scratch = `verifier-sec-${Date.now().toString(36)}`;
  const t0 = t();
  const copy = await get('/api/actions/deck.copy?deck=gt-brand', {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify({
      id: 'gt-brand',
      name: 'Verifier security walk',
      newId: scratch,
      baseRevision: info?.revision ?? 0,
    }),
  });
  const copied = await copy.json().catch(() => null);
  row(
    'deck.copy scratch deck',
    copy.status === 200,
    `status ${copy.status} in ${Math.round(t() - t0)} ms; ${JSON.stringify(copied).slice(0, 140)}`,
  );
  if (copy.status !== 200) scratch = null;
  else {
    // 7. safeFetch refuses a loopback URL (8.6): slide.setBackgroundPicture --url
    const info2 = await (
      await get(`/api/actions/deck.info?deck=${scratch}`, {
        method: 'POST',
        headers: bearer,
        body: '{}',
      })
    ).json();
    revision = info2.revision;
    const list = await (
      await get(`/api/actions/slide.list?deck=${scratch}`, {
        method: 'POST',
        headers: bearer,
        body: '{}',
      })
    ).json();
    const first = Array.isArray(list) ? list[0]?.id : list?.slides?.[0]?.id;
    for (const url of [
      'http://127.0.0.1:4321/decks/gt-brand/assets/ref-rosetta.jpg',
      'http://localhost/x.jpg',
      'http://169.254.169.254/latest/meta-data/',
    ]) {
      const r = await get(`/api/actions/slide.setBackgroundPicture?deck=${scratch}`, {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ slideIds: [first], url, baseRevision: revision }),
      });
      const text = await r.text();
      row(
        `safeFetch refuses ${url}`,
        r.status >= 400 && r.status < 500,
        `status ${r.status}; ${text.slice(0, 140).replace(/\s+/g, ' ')}`,
      );
      const again = await (
        await get(`/api/actions/deck.info?deck=${scratch}`, {
          method: 'POST',
          headers: bearer,
          body: '{}',
        })
      ).json();
      revision = again.revision;
    }
    // 8. the quotas of 8.3 answer 429 with Retry-After and one sentence. Comments cannot be written
    // on the blob tier (the row below records the sentence), so the anonymous render quota
    // (400 per hour) is the one driven: thumbnail GETs from the cookie holder until the 429.
    {
      const c = await get(`/api/comments/${scratch}/add`, {
        method: 'POST',
        headers: anon(),
        body: JSON.stringify({
          anchor: { kind: 'slide', slideId: first },
          body: { text: 'Quota probe', mentions: [] },
        }),
      });
      const text = await c.text();
      row(
        'an anonymous comment on the blob tier',
        null,
        `status ${c.status}; ${text.slice(0, 160).replace(/\s+/g, ' ')}`,
      );
    }
    {
      const statuses = [];
      let retryAfter = null;
      let sentence = '';
      const times = [];
      const t0 = t();
      for (let i = 0; i < 430; i += 1) {
        const t1 = t();
        const r = await get(
          `/api/render/${encodeURIComponent(first)}?deck=gt-brand&theme=light&w=160`,
          { headers: { ...protection, cookie, accept: 'image/*,*/*' } },
        );
        times.push(Math.round(t() - t1));
        statuses.push(r.status);
        if (r.status === 429) {
          retryAfter = r.headers.get('retry-after');
          const b = await r.json().catch(() => null);
          sentence = b?.error?.message ?? b?.message ?? (await r.text().catch(() => ''));
          break;
        }
        if (
          r.status >= 500 ||
          (r.status >= 400 && r.status !== 429 && statuses.filter((x) => x >= 400).length > 3)
        )
          break;
        await r.arrayBuffer().catch(() => null);
      }
      const first429 = statuses.indexOf(429);
      const sorted = [...times].sort((x, y) => x - y);
      const counts = Object.entries(statuses.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}))
        .map(([k, v]) => `${k}×${v}`)
        .join(' ');
      row(
        'the anonymous render quota answers 429 with Retry-After and a sentence (8.3: 400 per hour)',
        first429 > 0 && retryAfter !== null && String(sentence).length > 0,
        `${statuses.length} thumbnail GETs in ${Math.round(t() - t0)} ms (${counts}); first 429 at request ${first429 + 1}; Retry-After ${retryAfter}; "${String(sentence).slice(0, 160)}"; p50 ${sorted[Math.floor(sorted.length / 2)]} ms`,
      );
    }
    // 9. the write to saved time: one slide.update through the bearer, then deck.info until the revision moves
    const info3 = await (
      await get(`/api/actions/deck.info?deck=${scratch}`, {
        method: 'POST',
        headers: bearer,
        body: '{}',
      })
    ).json();
    const t2 = t();
    const w = await get(`/api/actions/slide.update?deck=${scratch}`, {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({
        slideId: first,
        baseRevision: info3.revision,
        mutations: [{ op: 'slide.set', slideId: first, path: '/notes', value: 'verifier timing' }],
      }),
    });
    const wroteMs = Math.round(t() - t2);
    let savedMs = null;
    for (let i = 0; i < 40; i += 1) {
      const again = await (
        await get(`/api/actions/deck.info?deck=${scratch}`, {
          method: 'POST',
          headers: bearer,
          body: '{}',
        })
      )
        .json()
        .catch(() => null);
      if (again && again.revision > info3.revision) {
        savedMs = Math.round(t() - t2);
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    row(
      'write to saved (bearer, blob store)',
      w.status === 200 && savedMs !== null,
      `slide.update ${w.status} in ${wroteMs} ms; deck.info shows the new revision after ${savedMs} ms`,
    );
    // 10. cleanup
    const info4 = await (
      await get(`/api/actions/deck.info?deck=${scratch}`, {
        method: 'POST',
        headers: bearer,
        body: '{}',
      })
    ).json();
    const trash = await get(`/api/actions/deck.trash?deck=${scratch}`, {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ id: scratch, baseRevision: info4.revision }),
    });
    const info5 = await (
      await get(`/api/actions/deck.info?deck=${scratch}`, {
        method: 'POST',
        headers: bearer,
        body: '{}',
      })
    )
      .json()
      .catch(() => info4);
    const rm = await get(`/api/actions/deck.remove?deck=${scratch}`, {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({
        id: scratch,
        confirm: true,
        baseRevision: info5?.revision ?? info4.revision,
      }),
    });
    row(
      'scratch deck removed',
      trash.status === 200 && rm.status === 200,
      `deck.trash ${trash.status}; deck.remove ${rm.status}`,
    );
  }
} else row('scratch deck rows', null, 'no bearer in the environment');
// 11. the CSP report endpoint (8.8)
{
  const r = await get('/api/x/csp/report', {
    method: 'POST',
    headers: { ...protection, 'content-type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': {
        'violated-directive': 'script-src',
        'blocked-uri': 'eval',
        'document-uri': `${BASE}/new`,
      },
    }),
  });
  const r2 = await get('/api/x/csp/report', {
    method: 'POST',
    headers: { ...protection, 'content-type': 'application/csp-report' },
    body: 'garbage',
  });
  row(
    'the CSP report endpoint',
    r.status === 204 && r2.status === 400,
    `report ${r.status}; garbage ${r2.status}`,
  );
}
// 12. the twin attachment rule for a .json asset (8.5)
{
  const r = await get('/decks/gt-brand/assets/liquid-metal-diamond.recipe.json');
  const h = headersOf(r);
  row(
    'a .json twin is an attachment with nosniff and a sandbox policy',
    r.status === 200 &&
      /attachment/.test(h['content-disposition'] ?? '') &&
      h['x-content-type-options'] === 'nosniff' &&
      /sandbox/.test(h['content-security-policy'] ?? ''),
    `status ${r.status}; content-disposition ${h['content-disposition']}; csp ${h['content-security-policy']}; corp ${h['cross-origin-resource-policy']}`,
  );
}
const fails = rows.filter((r) => r.ok === false).length;
console.log(
  `preview security: ${rows.filter((r) => r.ok === true).length} ok, ${fails} fail, ${rows.filter((r) => r.ok === null).length} skipped`,
);
process.exit(fails === 0 ? 0 : 1);
