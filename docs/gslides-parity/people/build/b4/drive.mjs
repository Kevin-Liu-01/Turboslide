#!/usr/bin/env node
// B4's drive of the picture pipeline on a local node server (docs/PEOPLE.md 4.2, 4.3, 4.6, 4.7;
// build/b4.md): the API through /api/actions with a signed in session, the CLI through an API
// key, the served files through the checkout route, and the janitor over the server's own
// folder. Every reading lands in drive.json beside this file; the served files of the first
// upload and the CLI's PNG land beside it too. Nothing here prints a secret: the server's env
// file is read into memory and the CLI receives the key through its environment. The server
// runs without TURBOSLIDE_TOKEN (a set token refuses every request without a bearer on the
// agent surface), so /api/actions reads the session cookie on localhost the way a page does.
//
//   node docs/gslides-parity/people/build/b4/drive.mjs <b4-env.json>
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKTREE = join(HERE, '..', '..', '..', '..', '..');
const require = createRequire(join(WORKTREE, 'apps', 'studio', 'package.json'));
const sharp = require('sharp');

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: drive.mjs <b4-env.json>');
const ENV = JSON.parse(readFileSync(envFile, 'utf8'));
const BASE = ENV.BASE;
const AUTH_DB = ENV.TURBOSLIDE_AUTH_DB_PATH;
const OVERLAY = ENV.TURBOSLIDE_OVERLAY_DIR;
const USERS_U = join(OVERLAY, '.turboslide', 'users', 'u');
const SEED = join(WORKTREE, 'apps', 'studio', 'e2e', 'identity-seed.mts');
const CLI = join(WORKTREE, 'apps', 'cli', 'bin', 'turboslide.mjs');
const SAME_ORIGIN = { origin: BASE, 'sec-fetch-site': 'same-origin' };
const URL_64 = /\/u\/[A-Za-z0-9_-]{22}\/[0-9a-f]{64}-64\.webp$/;

const facts = { base: BASE, at: new Date().toISOString(), load: loadavg(), steps: {} };
const step = (name, value) => {
  facts.steps[name] = value;
  console.log(`${name}: ${JSON.stringify(value).slice(0, 400)}`);
};

function seed(mode, ...args) {
  const out = execFileSync('node', [SEED, mode, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.trim().split('\n').pop() ?? '{}');
}

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorb(response) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
async function call(path, init = {}) {
  const headers = { ...SAME_ORIGIN, ...(init.headers ?? {}) };
  if (jar.size > 0) headers.cookie = cookieHeader();
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  absorb(response);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}
async function action(id, input, extra = {}) {
  return call(`/api/actions/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extra },
    body: JSON.stringify(input),
  });
}
const errorOf = (answer) => answer.body?.error?.message ?? answer.body?.message ?? (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
const keysOnDisk = () => (existsSync(USERS_U) ? readdirSync(USERS_U) : []);
const dataUrl = (mime, base64) => `data:${mime};base64,${base64}`;

async function servedFile(url, saveAs) {
  const response = await fetch(`${BASE}${url}`, { headers: SAME_ORIGIN });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const h = response.headers;
  const out = {
    url,
    status: response.status,
    bytes: bytes.byteLength,
    contentType: h.get('content-type'),
    cacheControl: h.get('cache-control'),
    corp: h.get('cross-origin-resource-policy'),
    nosniff: h.get('x-content-type-options'),
  };
  if (response.status === 200 && (h.get('content-type') ?? '').startsWith('image/')) {
    const meta = await sharp(Buffer.from(bytes)).metadata();
    out.width = meta.width;
    out.height = meta.height;
    out.format = meta.format;
    out.exif = meta.exif === undefined ? 'none' : `${meta.exif.byteLength} bytes`;
    out.orientationTag = meta.orientation ?? null;
    if (saveAs) writeFileSync(join(HERE, saveAs), bytes);
  }
  return out;
}

// 1. the runtime and the database
step('probe', { getSession: (await call('/api/auth/get-session')).status });

// 2. an anonymous principal is refused before anything is written
const small = seed('picture', 'png', '64', '64');
const anonymous = await action('account.setAvatar', { variant: 'picture', picture: dataUrl(small.mime, small.base64) });
step('anonymous-refused', { status: anonymous.status, sentence: errorOf(anonymous), keysOnDisk: keysOnDisk().length, cookie: [...jar.keys()] });

// 3. sign in with the captured code
const email = ENV.DRIVE_EMAIL ?? `b4-${Date.now()}@example.test`;
const asked = await call('/api/auth/sign-in/magic-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, callbackURL: '/decks' }) });
const mail = seed('mail', AUTH_DB, email);
const verified = await call('/api/auth/sign-in/email-otp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, otp: mail.code }) });
const me0 = await action('account.me', {});
step('sign-in', { asked: asked.status, code: mail.code ? 'captured' : 'missing', verified: verified.status, me: { kind: me0.body?.principal?.kind, trust: me0.body?.trust, avatar: me0.body?.avatar, cookies: [...jar.keys()] } });
const principalId = me0.body?.principal?.id;

// 4. the first upload: a 640 by 480 JPEG, the answer, the five served files
const first = seed('picture', 'jpeg', '640', '480');
const up1 = await action('account.setAvatar', { variant: 'picture', picture: dataUrl(first.mime, first.base64) });
const url1 = up1.body?.avatar?.url ?? '';
const served1 = {};
for (const size of [32, 64, 128, 256]) served1[`webp${size}`] = await servedFile(url1.replace(/-64\.webp$/, `-${size}.webp`), size === 64 ? 'served-first-64.webp' : undefined);
served1.png256 = await servedFile(url1.replace(/-64\.webp$/, '-256.png'), 'served-first-256.png');
step('upload-1', {
  status: up1.status,
  sentence: up1.status >= 400 ? errorOf(up1) : null,
  requestBytes: JSON.stringify({ variant: 'picture', picture: dataUrl(first.mime, first.base64) }).length,
  fixtureBytes: first.bytes,
  avatar: up1.body?.avatar,
  markVariant: up1.body?.mark?.variant,
  markPictureUrl: up1.body?.mark?.pictureUrl,
  markEqualsAvatarUrl: up1.body?.mark?.pictureUrl === url1,
  urlGrammar: URL_64.test(url1),
  keysOnDisk: keysOnDisk().length,
  served: served1,
});
const key1 = url1.split('/').at(-2);

// 5. account.me reads the picture back; a glyph choice writes the index and clears on the next picture
const me1 = await action('account.me', {});
const glyph = await action('account.setAvatar', { variant: 'glyph', salt: 7 });
const indexFiles = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name === 'decks.json' && p.includes(String(principalId).replace(/[^A-Za-z0-9_-]/g, '_'))) indexFiles.push(p);
  }
};
walk(join(OVERLAY, '.turboslide'));
walk(join(OVERLAY, 'decks'));
const readIndex = () => (indexFiles[0] ? JSON.parse(readFileSync(indexFiles[0], 'utf8')) : null);
const indexAfterGlyph = readIndex();
step('glyph-on-index', {
  meAfterUploadPictureUrl: me1.body?.mark?.pictureUrl,
  glyph: { status: glyph.status, avatar: glyph.body?.avatar, markVariant: glyph.body?.mark?.variant },
  keysOnDiskAfterGlyph: keysOnDisk().length,
  indexFile: indexFiles[0]?.replace(OVERLAY, '<overlay>') ?? null,
  indexAvatar: indexAfterGlyph?.avatar ?? null,
});

// 6. the second upload: the oriented JPEG; rotation of the key, the old URL 404, the PNG upright with no Exif
const oriented = seed('oriented');
const up2 = await action('account.setAvatar', { variant: 'picture', picture: dataUrl(oriented.mime, oriented.base64) });
const url2 = up2.body?.avatar?.url ?? '';
const key2 = url2.split('/').at(-2);
const old64 = await servedFile(url1);
const png2 = await servedFile(url2.replace(/-64\.webp$/, '-256.png'), 'served-oriented-256.png');
const webp2 = await servedFile(url2);
let upright = null;
if (png2.status === 200) {
  const { data, info } = await sharp(join(HERE, 'served-oriented-256.png')).raw().toBuffer({ resolveWithObject: true });
  const red = (x, y) => data[(y * info.width + x) * info.channels];
  upright = { redFlatAlongX: Math.abs(red(16, 16) - red(240, 16)) < 24, redRampsAlongY: red(128, 240) - red(128, 16) > 60, samples: { r16_16: red(16, 16), r240_16: red(240, 16), r128_240: red(128, 240) } };
}
step('upload-2-oriented', {
  status: up2.status,
  newKey: key2 !== key1,
  oldUrlStatus: old64.status,
  keysOnDisk: keysOnDisk(),
  keysOnDiskCount: keysOnDisk().length,
  onlyNewKeyOnDisk: keysOnDisk().length === 1 && keysOnDisk()[0] === key2,
  png: png2,
  webp64: webp2,
  upright,
  indexAvatarAfterPicture: readIndex()?.avatar ?? null,
});

// 7. the cap: a string over the bound that is no data URL, and a real WebP over 512 KB
const before = keysOnDisk();
const long = await action('account.setAvatar', { variant: 'picture', picture: 'x'.repeat(699_200) });
const noise = seed('picture', 'webp', '900', '900', 'noise');
const big = await action('account.setAvatar', { variant: 'picture', picture: dataUrl(noise.mime, noise.base64) });
step('cap-refusal', {
  longString: { length: 699_200, status: long.status, sentence: errorOf(long) },
  noiseWebp: { bytes: noise.bytes, overCap: noise.bytes > 512 * 1024, dataUrlLength: dataUrl(noise.mime, noise.base64).length, status: big.status, sentence: errorOf(big) },
  keysOnDiskUnchanged: JSON.stringify(keysOnDisk()) === JSON.stringify(before),
});

// 8. the pixel cap: a flat 2048 by 2048 PNG is small in bytes and large in pixels
const wide = seed('picture', 'png', '2048', '2048');
const pixels = await action('account.setAvatar', { variant: 'picture', picture: dataUrl(wide.mime, wide.base64) });
step('pixel-cap', { fixtureBytes: wide.bytes, underByteCap: wide.bytes <= 512 * 1024, status: pixels.status, sentence: errorOf(pixels), keysOnDiskUnchanged: JSON.stringify(keysOnDisk()) === JSON.stringify(before) });

// 9. the CLI through an API key of the same account: --picture, a read only key, the cap, --avatar-png
const rw = seed('key', AUTH_DB, email, 'b4-cli', 'read,write');
const ro = seed('key', AUTH_DB, email, 'b4-cli-ro', 'read');
const fixtures = join(dirname(envFile), 'fixtures');
mkdirSync(fixtures, { recursive: true });
const cliPicture = join(fixtures, 'cli-picture.jpeg');
writeFileSync(cliPicture, Buffer.from(seed('picture', 'jpeg', '800', '600').base64, 'base64'));
const cliBig = join(fixtures, 'cli-big.webp');
writeFileSync(cliBig, Buffer.from(noise.base64, 'base64'));
const cliText = join(fixtures, 'cli-not-a-picture.txt');
writeFileSync(cliText, 'not a picture');
const configDir = join(dirname(envFile), 'config');
mkdirSync(configDir, { recursive: true });
function cli(secret, args) {
  const out = spawnSync('node', [CLI, ...args, '--to', BASE, '--json'], {
    cwd: WORKTREE,
    encoding: 'utf8',
    env: { ...process.env, TURBOSLIDE_TOKEN: secret, TURBOSLIDE_CONFIG_DIR: configDir },
  });
  // --json prints one JSON document on stdout (pretty printed) and the human lines on stderr
  let json = null;
  try {
    json = JSON.parse(out.stdout.trim());
  } catch {
    json = null;
  }
  return { status: out.status, json, stderr: out.stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
}
const cliUp = cli(rw.secret, ['account', 'avatar', '--variant', 'picture', '--picture', cliPicture]);
const cliRo = cli(ro.secret, ['account', 'avatar', '--variant', 'glyph', '--another']);
const cliCap = cli(rw.secret, ['account', 'avatar', '--variant', 'picture', '--picture', cliBig]);
const cliText1 = cli(rw.secret, ['account', 'avatar', '--variant', 'picture', '--picture', cliText]);
const cliPng = join(HERE, 'cli-me-avatar.png');
const cliMe = cli(rw.secret, ['account', 'me', '--avatar-png', cliPng]);
const pngMeta = existsSync(cliPng) ? await sharp(cliPng).metadata() : null;
const me2 = await action('account.me', {});
step('cli', {
  upload: { status: cliUp.status, principal: cliUp.json?.principal, avatarUrl: cliUp.json?.avatar?.url, markVariant: cliUp.json?.mark?.variant, urlGrammar: URL_64.test(cliUp.json?.avatar?.url ?? ''), stderr: cliUp.stderr },
  keysOnDiskAfterCli: keysOnDisk().length,
  sessionSeesCliPicture: me2.body?.avatar?.url === cliUp.json?.avatar?.url,
  readOnlyKey: { status: cliRo.status, stderr: cliRo.stderr },
  overCap: { status: cliCap.status, stderr: cliCap.stderr },
  notAPicture: { status: cliText1.status, stderr: cliText1.stderr },
  avatarPng: { status: cliMe.status, principalKind: cliMe.json?.principal?.kind, markVariant: cliMe.json?.mark?.variant, avatarPng: cliMe.json?.avatarPng?.replace(HERE, '<b4>'), file: pngMeta ? { width: pngMeta.width, height: pngMeta.height, format: pngMeta.format, depth: pngMeta.depth, channels: pngMeta.channels } : null },
});

// 10. the janitor: the action through the bootstrap bearer, and the function over the server's own folder
// the signed in address is TURBOSLIDE_ADMIN_EMAILS on this server, so the session is the admin
const sweepAction = await action('admin.avatar.sweep', { dryRun: true });
const orphanKey = 'B4orphanB4orphanB4orph';
const orphanDir = join(USERS_U, orphanKey);
mkdirSync(orphanDir, { recursive: true });
const orphanFile = join(orphanDir, `${'f'.repeat(64)}-32.webp`);
writeFileSync(orphanFile, new Uint8Array(16));
const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
utimesSync(orphanFile, old, old);
const youngKey = 'B4youngB4youngB4youngB';
mkdirSync(join(USERS_U, youngKey), { recursive: true });
writeFileSync(join(USERS_U, youngKey, `${'e'.repeat(64)}-32.webp`), new Uint8Array(16));
const sweepOut = spawnSync('node', [join(HERE, 'sweep-local.mts'), OVERLAY, AUTH_DB], { cwd: WORKTREE, encoding: 'utf8' });
let sweep = null;
try {
  sweep = JSON.parse(sweepOut.stdout.trim().split('\n').pop() ?? 'null');
} catch {
  sweep = { error: sweepOut.stderr.slice(0, 300) };
}
step('janitor', {
  action: { status: sweepAction.status, sentence: errorOf(sweepAction) },
  seeded: { orphanKey, youngKey, namedKeys: keysOnDisk().filter((k) => k !== orphanKey && k !== youngKey) },
  sweep,
  keysOnDiskAfter: keysOnDisk(),
});

facts.loadAfter = loadavg();
writeFileSync(join(HERE, 'drive.json'), `${JSON.stringify(facts, null, 2)}\n`);
console.log(`written ${join(HERE, 'drive.json')}`);
