// The /s/<token> exchange on a hosted deployment, probed as a browser would issue it (finding 18
// of VERIFICATION-3). Node's fetch cannot make this request: undici stamps `sec-fetch-mode: cors`
// on every fetch and overwrites a caller's `navigate`, so every navigation here goes through
// node:https.request with the headers written out, and one fetch() row reproduces the verifier's
// 403 on purpose. Nothing secret is printed: the bearer, the OIDC token, the share token and the
// cookie values are masked in every line.
//
//   node preview-exchange-trials.mjs --trials <n> --base <origin> [--env <file with VERCEL_OIDC_TOKEN>] [--keep]
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

const TRIALS = Number(flag('--trials', '6'));
const STEP = 2_000;
const CAP = 90_000;
const started = performance.now();
const info = await action('deck.info', 'gt-brand', {});
const scratch = `b3-trials-${Date.now().toString(36)}`;
const copy = await action('deck.copy', 'gt-brand', {
  id: 'gt-brand',
  name: 'B3 exchange trials',
  newId: scratch,
  baseRevision: info.json?.revision ?? 0,
});
say(`deck.copy -> ${scratch} ${copy.status}`);
if (copy.status !== 200) process.exit(1);
const rows = [];
for (let i = 1; i <= TRIALS; i++) {
  const current = await action('share.get', scratch, { id: scratch });
  const link = await action('share.createLink', scratch, {
    id: scratch,
    role: 'viewer',
    label: `trial ${i}`,
    baseRevision: current.json?.record?.revision ?? 0,
  });
  if (link.status !== 200) {
    say(`trial ${i} createLink ${link.status} ${JSON.stringify(link.json).slice(0, 160)}`);
    continue;
  }
  token = new URL(link.json.url, BASE).pathname.split('/').pop() ?? '';
  const path = `/s/${token}`;
  const mintedAt = performance.now();
  let first = await raw(path, NAVIGATE);
  let land = first.status === 303 ? Math.round(performance.now() - mintedAt) : null;
  let misses = first.status === 303 ? 0 : 1;
  while (land === null && performance.now() - mintedAt < CAP) {
    await new Promise((r) => setTimeout(r, STEP));
    const again = await raw(path, NAVIGATE);
    if (again.status === 303) land = Math.round(performance.now() - mintedAt);
    else misses++;
  }
  const rev = await action('share.get', scratch, { id: scratch });
  let revoke = await action('share.revokeLink', scratch, {
    id: scratch,
    linkId: link.json.link?.id,
    baseRevision: rev.json?.record?.revision ?? 0,
  });
  if (revoke.status === 409 && typeof revoke.json?.error?.currentRevision === 'number')
    revoke = await action('share.revokeLink', scratch, {
      id: scratch,
      linkId: link.json.link?.id,
      baseRevision: revoke.json.error.currentRevision,
    });
  const revokedAt = performance.now();
  let die = null;
  let lands = 0;
  if (revoke.status === 200) {
    let r = await raw(path, NAVIGATE);
    die = r.status === 404 ? Math.round(performance.now() - revokedAt) : null;
    lands = r.status === 404 ? 0 : 1;
    while (die === null && performance.now() - revokedAt < CAP) {
      await new Promise((x) => setTimeout(x, STEP));
      r = await raw(path, NAVIGATE);
      if (r.status === 404) die = Math.round(performance.now() - revokedAt);
      else lands++;
    }
  }
  rows.push({ i, firstStatus: first.status, land, misses, revoke: revoke.status, die, lands });
  say(
    `trial ${i}: first navigation ${first.status}; landed after ${land ?? '>' + CAP} ms (${misses} misses); revoke ${revoke.status}; dead after ${die ?? (revoke.status === 200 ? '>' + CAP : 'n/a')} ms (${lands} stale landings)`,
  );
}
const before = await action('deck.info', scratch, {});
await action('deck.trash', scratch, { id: scratch, baseRevision: before.json?.revision ?? 0 });
const after = await action('deck.info', scratch, {});
const rm = await action('deck.remove', scratch, {
  id: scratch,
  confirm: true,
  baseRevision: after.json?.revision ?? before.json?.revision ?? 0,
});
say(
  `cleanup deck.remove ${rm.status}; ${rows.length} trials in ${Math.round((performance.now() - started) / 1000)} s`,
);
say(JSON.stringify(rows));
