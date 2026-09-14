// The /s/<token> exchange on a hosted deployment, probed as a browser would issue it (finding 18
// of VERIFICATION-3). Node's fetch cannot make this request: undici stamps `sec-fetch-mode: cors`
// on every fetch and overwrites a caller's `navigate`, so every navigation here goes through
// node:https.request with the headers written out, and one fetch() row reproduces the verifier's
// 403 on purpose. Nothing secret is printed: the bearer, the OIDC token, the share token and the
// cookie values are masked in every line.
//
//   node preview-exchange-probe.mjs --base <origin> [--env <file with VERCEL_OIDC_TOKEN>] [--keep]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};
const BASE = (flag('--base') ?? '').replace(/\/$/, '');
if (BASE === '') {
  console.error('pass --base <origin>');
  process.exit(2);
}
const KEEP = args.includes('--keep');

const hosts = JSON.parse(readFileSync(`${homedir()}/.config/turboslide/hosts.json`, 'utf8'));
const bearer = hosts.hosts?.[`${BASE}/`]?.token ?? hosts.hosts?.[BASE]?.token ?? '';
if (bearer === '') {
  console.error(`no bearer for ${BASE} in hosts.json`);
  process.exit(2);
}
let oidc = process.env.VERCEL_OIDC_TOKEN ?? '';
const envFile = flag('--env');
if (oidc === '' && envFile) {
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('VERCEL_OIDC_TOKEN='));
  if (line) oidc = line.slice('VERCEL_OIDC_TOKEN='.length).replace(/^"|"$/g, '');
}
const protection = oidc === '' ? {} : { 'x-vercel-trusted-oidc-idp-token': oidc };

let token = '';
const mask = (text) => {
  let out = String(text).replaceAll(bearer, '<bearer>');
  if (oidc !== '') out = out.replaceAll(oidc, '<oidc>');
  if (token !== '') out = out.replaceAll(token, '<token>');
  return out;
};
const say = (...parts) => console.log(mask(parts.join(' ')));

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
  return { status: r.status, json };
}

const cookieNames = (h) =>
  (Array.isArray(h['set-cookie']) ? h['set-cookie'] : h['set-cookie'] ? [h['set-cookie']] : [])
    .map((c) => {
      const [pair, ...attrs] = c.split(';');
      const [name, value] = pair.split('=');
      return `${name}=<${(value ?? '').length} chars>;${attrs.map((a) => a.trim()).join(';')}`;
    })
    .join(' | ');

const describe = (label, r) =>
  say(
    `${label.padEnd(44)} -> ${r.status}`,
    `location ${r.headers.location ?? '-'}`,
    `referrer-policy ${r.headers['referrer-policy'] ?? '-'}`,
    `x-robots-tag ${r.headers['x-robots-tag'] ?? '-'}`,
    `cache-control ${r.headers['cache-control'] ?? '-'}`,
    r.headers['set-cookie'] ? `set-cookie ${cookieNames(r.headers)}` : 'no set-cookie',
    r.status >= 400 ? `body ${r.text.slice(0, 160).replaceAll('\n', ' ')}` : '',
  );

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

const started = performance.now();
const info = await action('deck.info', 'gt-brand', {});
say(`deck.info gt-brand ${info.status} revision ${info.json?.revision ?? '-'}`);
const scratch = `b3-fix-${Date.now().toString(36)}`;
const copy = await action('deck.copy', 'gt-brand', {
  id: 'gt-brand',
  name: 'B3 fix round exchange probe',
  newId: scratch,
  baseRevision: info.json?.revision ?? 0,
});
say(`deck.copy -> ${scratch} ${copy.status}`);
if (copy.status !== 200) {
  say(JSON.stringify(copy.json).slice(0, 300));
  process.exit(1);
}
const copyInfo = await action('deck.info', scratch, {});
const link = await action('share.createLink', scratch, {
  id: scratch,
  role: 'viewer',
  label: 'B3 fix probe',
  baseRevision: copyInfo.json?.revision ?? 0,
});
if (link.status !== 200 || typeof link.json?.url !== 'string') {
  say(`share.createLink ${link.status} ${JSON.stringify(link.json).slice(0, 300)}`);
} else {
  token = new URL(link.json.url, BASE).pathname.split('/').pop() ?? '';
  const mintedAt = performance.now();
  say(
    `share.createLink 200; url path /s/<token> (${token.length} chars); link id ${link.json.link?.id ?? '-'} role ${link.json.link?.role ?? '-'}`,
  );

  const path = `/s/${token}`;
  const results = {};
  // A. a browser's first navigation: no cookie yet; polled until the link lands (the 60 s record
  // cache of the blob tier is process local, so another instance may still hold the pre link record)
  results.A = await raw(path, NAVIGATE);
  describe('A navigate+document+none, no cookie', results.A);
  say(`   ${Math.round(performance.now() - mintedAt)} ms after the mint`);
  let landed = results.A.status === 303 ? Math.round(performance.now() - mintedAt) : null;
  while (landed === null && performance.now() - mintedAt < 90_000) {
    await new Promise((r) => setTimeout(r, 2_000));
    const again = await raw(path, NAVIGATE);
    if (again.status === 303) {
      landed = Math.round(performance.now() - mintedAt);
      results.A = again;
    } else say(`   still ${again.status} at ${Math.round(performance.now() - mintedAt)} ms`);
  }
  say(`A2 first landing ${landed === null ? 'never within 90 s' : `${landed} ms after the mint`}`);
  const setCookies = Array.isArray(results.A.headers['set-cookie'])
    ? results.A.headers['set-cookie']
    : results.A.headers['set-cookie']
      ? [results.A.headers['set-cookie']]
      : [];
  const identityCookie = setCookies.find((c) => c.startsWith('__Host-ts_id='));
  const cookie = identityCookie ? identityCookie.split(';')[0] : '';
  say(`   identity cookie ${cookie === '' ? 'missing' : 'held for the next rows'}`);
  // B. the same browser again, holding the identity cookie
  results.B = await raw(path, { ...NAVIGATE, ...(cookie ? { cookie } : {}) });
  describe('B navigate+document+none, with cookie', results.B);
  // C. no fetch metadata at all (curl, an old browser)
  results.C = await raw(path, { 'user-agent': 'curl/8.7.1', accept: '*/*' });
  describe('C no sec-fetch headers, curl UA', results.C);
  // D. a link clicked on a page of another origin
  results.D = await raw(path, {
    ...NAVIGATE,
    'sec-fetch-site': 'cross-site',
    referer: 'https://example.org/',
  });
  describe('D navigate+document+cross-site', results.D);
  // E. a cors fetch by a page: refused by SPEC-3 6.4
  results.E = await raw(path, {
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'sec-fetch-site': 'same-origin',
    'user-agent': CHROME,
  });
  describe('E sec-fetch-mode cors (a page fetch)', results.E);
  // F. the verifier's shape: Node fetch() asked for navigate; undici sends cors anyway
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
  const fHeaders = {};
  for (const [k, v] of f.headers) fHeaders[k] = v;
  describe('F Node fetch() asking for navigate', {
    status: f.status,
    headers: fHeaders,
    text: await f.text(),
  });
  // G. real curl with the navigation headers
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
    const statusLine =
      out
        .split('\n')
        .filter((l) => l.startsWith('HTTP/'))
        .pop()
        ?.trim() ?? '?';
    const loc = /^location: (.*)$/im.exec(out)?.[1]?.trim() ?? '-';
    const sc = /^set-cookie: ([^=]+)=/im.exec(out)?.[1] ?? 'none';
    say(
      `G real curl navigate+document+none          -> ${statusLine} location ${loc} set-cookie ${sc}`,
    );
  } catch (error) {
    say(`G real curl failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  // H. a dead token of the right grammar: the 404 page
  results.H = await raw(`/s/${'a'.repeat(token.length)}`, NAVIGATE);
  describe('H unknown token of the right length', results.H);
  // I. a fetch after a revocation would be 404 too; revoke and navigate once more
  const current = await action('share.get', scratch, { id: scratch });
  let revoke = await action('share.revokeLink', scratch, {
    id: scratch,
    linkId: link.json.link?.id,
    baseRevision: current.json?.record?.revision ?? 0,
  });
  if (revoke.status === 409 && typeof revoke.json?.error?.currentRevision === 'number') {
    say(
      `share.revokeLink 409 at baseRevision ${current.json?.record?.revision}; current ${revoke.json.error.currentRevision}; retrying`,
    );
    revoke = await action('share.revokeLink', scratch, {
      id: scratch,
      linkId: link.json.link?.id,
      baseRevision: revoke.json.error.currentRevision,
    });
  }
  say(
    `share.revokeLink ${revoke.status}${revoke.status === 200 ? '' : ' ' + JSON.stringify(revoke.json).slice(0, 200)}`,
  );
  const revokedAt = performance.now();
  results.I = await raw(path, { ...NAVIGATE, ...(cookie ? { cookie } : {}) });
  describe('I navigate after revoke, with cookie', results.I);
  say(`   ${Math.round(performance.now() - revokedAt)} ms after the revoke`);
  // J. how long the dead token keeps landing: poll every 5 s for up to 120 s
  let dead = results.I.status === 404 ? 0 : null;
  while (dead === null && performance.now() - revokedAt < 120_000) {
    await new Promise((r) => setTimeout(r, 3_000));
    const again = await raw(path, { ...NAVIGATE, ...(cookie ? { cookie } : {}) });
    if (again.status === 404) dead = Math.round(performance.now() - revokedAt);
    else say(`   still ${again.status} at ${Math.round(performance.now() - revokedAt)} ms`);
  }
  say(`J dead token answers 404 after ${dead === null ? 'more than 120000' : dead} ms`);

  const landing = `/deck/${scratch}`;
  const verdict =
    landed !== null &&
    results.A.headers.location === landing &&
    results.B.status === 303 &&
    results.C.status === 303 &&
    results.D.status === 303 &&
    results.E.status === 403 &&
    f.status === 403 &&
    results.H.status === 404 &&
    dead !== null;
  say(
    `verdict ${verdict ? 'the exchange lands for every navigation and refuses every fetch' : 'MISMATCH'}`,
  );
}

if (!KEEP) {
  const before = await action('deck.info', scratch, {});
  const trash = await action('deck.trash', scratch, {
    id: scratch,
    baseRevision: before.json?.revision ?? 0,
  });
  const after = await action('deck.info', scratch, {});
  const rm = await action('deck.remove', scratch, {
    id: scratch,
    confirm: true,
    baseRevision: after.json?.revision ?? before.json?.revision ?? 0,
  });
  say(`cleanup deck.trash ${trash.status} deck.remove ${rm.status}`);
}
say(`done in ${Math.round(performance.now() - started)} ms`);
