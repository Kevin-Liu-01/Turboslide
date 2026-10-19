#!/usr/bin/env node
// Check step 30 (gslides-parity SPEC-4 0.45, 3.13, 6.1): what the Vercel build wrote. After
// `NITRO_PRESET=vercel pnpm --filter @turboslide/studio build:deploy` the Build Output under
// apps/studio/.vercel/output must carry, in config.json, one route per `routeRules` header rule
// of SPEC-4 1.6 and the root redirect of 0.43 (a 307 to /new with x-robots-tag, compiled so the
// redirect never wakes the function), under static/ every file of the icon set of 0.13 and the
// prerendered /home of 0.43, and the script prints each function directory's size against
// Vercel's 250 MB cap (a report line this round; the 200 MB gate is round five's, 0.35).
//
//   NITRO_PRESET=vercel pnpm --filter @turboslide/studio build:deploy && node scripts/check-vercel-output.mjs
//   node scripts/check-vercel-output.mjs --dir apps/studio/.vercel/output --report --json .turboslide/vercel-output.json
//
// Options: --dir <path> (the output folder; apps/studio/.vercel/output); --report (print every row
// and exit 0 whatever the result); --json <file> (the rows and the sizes). Nitro writes a header
// rule as `{ src: path.replace('/**', '/(.*)'), headers }` and a redirect as
// `{ src, status, headers: { Location } }` before `{ handle: 'filesystem' }` (nitro 3.0 beta,
// dist/_presets.mjs generateBuildConfig), so a rule is found by testing its sample path against the
// route's `src` as an anchored regular expression, the way Vercel matches `src`.
//
// The hardening round (docs/hardening/HARDENING.md 4.5, HR-W#3a; SPEC-1, WEB-4): the answers the
// CDN gives before the function runs carry the app's security headers. Vercel applies the headers
// of each route a path matches up to the first one without `continue: true` (Nitro writes its rules
// without it), so the check collects the headers a path gets that way: the root redirect, /home and
// /home/, /docs and /docs/, every prerendered docs page with and without the trailing slash, every
// docs twin, the icon and robots.txt. HR-W#3b (CRIT-W5): every prerendered page's nonce
// attributes hold one value, the build's, and the header Vercel gives the page enforces a policy
// that names it with `frame-ancestors 'none'`; no address the function answers gets that header.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SPEC-4 1.6: the header rules, each with a sample path the compiled route must match; `cache`,
 * when set, is what the first matching route's cache-control must read (Vercel applies that route
 * alone): the content named GT cover under /brand/cover/ is immutable, not the /brand/** day
 * (hardening HR-PS#10).
 */
const HEADER_RULES = [
  { rule: '/favicon.ico', sample: '/favicon.ico' },
  { rule: '/icon.svg', sample: '/icon.svg' },
  { rule: '/apple-touch-icon.png', sample: '/apple-touch-icon.png' },
  { rule: '/og/turboslide.png', sample: '/og/turboslide.png' },
  { rule: '/manifest.webmanifest', sample: '/manifest.webmanifest' },
  { rule: '/icons/**', sample: '/icons/icon-512.png' },
  { rule: '/brand/**', sample: '/brand/hero-dark.png' },
  {
    rule: '/brand/cover/**',
    sample: '/brand/cover/gt-brand-dark-0123abcd.png',
    cache: /^public, max-age=31536000, immutable$/,
  },
  { rule: '/home/**', sample: '/home/01-editor-0123abcd.jpg' },
  { rule: '/decks/gt-brand/assets/**', sample: '/decks/gt-brand/assets/opener.png' },
];
/** SPEC-4 0.43: the root redirect compiled into config.json. */
const ROOT_REDIRECT = { rule: '/', to: '/new', status: 307, header: 'x-robots-tag' };
/** SPEC-4 0.13: the icon set served from static/ (the `handle: filesystem` step, 1.5). */
const STATIC_FILES = [
  'favicon.ico',
  'icon.svg',
  'apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-mask-192.png',
  'icons/icon-mask-512.png',
  'icons/icon-mono-512.png',
  'icons/icon-dark-192.png',
  'icons/icon-dark-512.png',
  'manifest.webmanifest',
  'robots.txt',
  'og/turboslide.png',
  'brand-manifest.json',
];
/**
 * The generated pictures beside the icon set (round four merge 2; build-4/b1.md R12, b2.md): every
 * file under these public folders must be under static/ too. The twins keep fixed names
 * (`/brand/*.png`, SITE.twins) and the GT cover's name follows its content (`/brand/cover/`,
 * site.ts GT_COVER), so the list is read from the tree rather than written here. The
 * site build (docs/SITE.md) retired public/home: the landing's pictures are imported with `?url`
 * and named by content under /assets.
 */
const STATIC_FOLDERS = ['brand', 'brand/cover'];
/** SPEC-4 0.43: /home and the site pages are prerendered; the start plugin writes either shape. */
const PRERENDERED = ['home', 'features', 'faq', 'about'].map((page) => ({
  route: `/${page}`,
  files: [`${page}/index.html`, `${page}.html`],
}));
/** HR-W#3a: the security headers of a static answer, the values server/headers.ts STATIC_HEADERS holds. */
const STATIC_SECURITY = {
  'x-content-type-options': /^nosniff$/,
  'x-frame-options': /^DENY$/,
  'cross-origin-opener-policy': /^same-origin$/,
  'referrer-policy': /^strict-origin-when-cross-origin$/,
  'permissions-policy': /geolocation=\(\)/,
  'strict-transport-security': /^max-age=63072000; includeSubDomains; preload$/,
};
/** HR-W#3a: the static answers outside the docs folder that must carry them. */
const STATIC_SECURITY_PATHS = [
  '/',
  '/home',
  '/home/',
  '/features',
  '/faq',
  '/about',
  '/docs',
  '/docs/',
  '/favicon.ico',
  '/robots.txt',
];
/** Vercel's per function size cap (docs/hosting.md section 6); the 200 MB gate waits for round five (SPEC-4 0.35). */
const FUNCTION_CAP_BYTES = 250 * 1024 * 1024;

function parseArgs(argv) {
  const out = { dir: 'apps/studio/.vercel/output', report: false, json: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') out.dir = argv[++i];
    else if (arg === '--report') out.report = true;
    else if (arg === '--json') out.json = argv[++i];
    else throw new Error(`check-vercel-output: unknown argument ${arg}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const OUT = resolve(ROOT, args.dir);
const rows = [];
let failures = 0;

function row(kind, name, ok, detail, asserted = true) {
  if (asserted && !ok) failures += 1;
  rows.push({ kind, name, ok, detail, asserted });
  console.log(
    `${asserted ? (ok ? 'ok  ' : 'FAIL') : 'info'} ${kind.padEnd(9)} ${name.padEnd(48)} ${detail}`,
  );
}

/** The bytes under a directory, symlinks counted as their own size and never followed. */
function directorySize(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      const inner = directorySize(path);
      bytes += inner.bytes;
      files += inner.files;
    } else {
      bytes += stat.size;
      files += 1;
    }
  }
  return { bytes, files };
}

/** Every `*.func` directory under functions/, at any depth (a function rule nests under its path). */
function functionDirs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name);
    if (entry.name.endsWith('.func')) out.push(path);
    else functionDirs(path, out);
  }
  return out;
}

/** The symbolic links under a directory, never followed. */
function linksUnder(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) out.push(path);
    else if (entry.isDirectory()) linksUnder(path, out);
  }
  return out;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// ---------------------------------------------------------------------------------------------

if (!existsSync(OUT)) {
  console.error(
    `check-vercel-output: ${OUT} is missing; run NITRO_PRESET=vercel pnpm --filter @turboslide/studio build:deploy first`,
  );
  process.exit(1);
}

const configPath = join(OUT, 'config.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
row(
  'config',
  'config.json present, version 3',
  config?.version === 3,
  config ? `version ${config.version}, ${config.routes?.length ?? 0} routes` : 'missing',
);

const routes = Array.isArray(config?.routes) ? config.routes : [];
const filesystemAt = routes.findIndex((r) => r.handle === 'filesystem');
const beforeFilesystem = filesystemAt === -1 ? routes : routes.slice(0, filesystemAt);
row(
  'config',
  'a handle: filesystem step',
  filesystemAt !== -1,
  filesystemAt === -1
    ? 'missing'
    : `route ${filesystemAt}, ${beforeFilesystem.length} rule(s) before it`,
);

const headerOf = (route, name) => {
  const headers = route.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
};
const matches = (route, sample) => {
  if (typeof route.src !== 'string') return false;
  try {
    return new RegExp(`^${route.src}$`).test(sample);
  } catch {
    return false;
  }
};

// SPEC-4 1.6: one route per header rule, carrying a cache-control header
for (const { rule, sample, cache } of HEADER_RULES) {
  const hit = beforeFilesystem.find(
    (route) => matches(route, sample) && headerOf(route, 'cache-control') !== undefined,
  );
  const value = hit ? headerOf(hit, 'cache-control') : undefined;
  row(
    'routes',
    `header rule ${rule}`,
    hit !== undefined && (cache === undefined || cache.test(value)),
    hit
      ? `src ${hit.src}; cache-control: ${value}`
      : `no route with a cache-control header matches ${sample}`,
  );
}

// SPEC-4 0.43: the root redirect with its robots header
{
  const hit = beforeFilesystem.find(
    (route) =>
      matches(route, ROOT_REDIRECT.rule) &&
      route.status !== undefined &&
      headerOf(route, 'Location') !== undefined,
  );
  const location = hit ? headerOf(hit, 'Location') : undefined;
  const robots = hit ? headerOf(hit, ROOT_REDIRECT.header) : undefined;
  const ok =
    hit !== undefined &&
    hit.status === ROOT_REDIRECT.status &&
    location === ROOT_REDIRECT.to &&
    typeof robots === 'string' &&
    /noindex/i.test(robots);
  row(
    'routes',
    `redirect ${ROOT_REDIRECT.rule} -> ${ROOT_REDIRECT.to} (${ROOT_REDIRECT.status}, ${ROOT_REDIRECT.header})`,
    ok,
    hit
      ? `status ${hit.status}, Location ${location ?? 'none'}, ${ROOT_REDIRECT.header} ${robots ?? 'none'}`
      : 'no redirect route matches /',
  );
}

// SPEC-4 0.13: the icon set under static/
const staticDir = join(OUT, 'static');

/** The headers Vercel gives a path: every matching route's, up to the first without `continue`. */
function collectedHeaders(path) {
  const out = {};
  for (const route of beforeFilesystem) {
    if (!matches(route, path)) continue;
    for (const [name, value] of Object.entries(route.headers ?? {}))
      out[name.toLowerCase()] = value;
    if (route.continue !== true) break;
  }
  return out;
}

/** The security headers a path lacks or carries with another value, by name. */
function missingSecurity(path) {
  const headers = collectedHeaders(path);
  return Object.entries(STATIC_SECURITY)
    .filter(([name, value]) => typeof headers[name] !== 'string' || !value.test(headers[name]))
    .map(([name]) => name);
}

/** The prerendered docs pages (`<dir>/index.html`) and twins (`*.md`) under static/docs, as paths. */
function staticDocs(dir = join(staticDir, 'docs'), path = '/docs', out = { pages: [], twins: [] }) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) staticDocs(join(dir, entry.name), `${path}/${entry.name}`, out);
    else if (entry.name === 'index.html') out.pages.push(path);
    else if (entry.name.endsWith('.md')) out.twins.push(`${path}/${entry.name}`);
  }
  return out;
}

// HR-W#3a: the static answers carry the security headers
for (const path of STATIC_SECURITY_PATHS) {
  const missing = missingSecurity(path);
  row(
    'headers',
    `static headers ${path}`,
    missing.length === 0,
    missing.length === 0 ? 'every security header' : `missing ${missing.join(', ')}`,
  );
}
{
  const docs = staticDocs();
  const groups = [
    ['docs pages', docs.pages],
    ['docs pages with a trailing slash', docs.pages.map((page) => `${page}/`)],
    ['docs twins', docs.twins],
  ];
  for (const [name, paths] of groups) {
    const bad = paths.filter((path) => missingSecurity(path).length > 0);
    row(
      'headers',
      `static headers on the ${name}`,
      paths.length > 0 && bad.length === 0,
      paths.length === 0
        ? 'none under static/docs'
        : bad.length === 0
          ? `${paths.length} of ${paths.length}`
          : `${bad.length} of ${paths.length} lack them: ${bad.slice(0, 3).join(', ')} (${missingSecurity(bad[0]).join(', ')})`,
    );
  }
}

// HR-W#3b (SPEC-1, CRIT-W5): every prerendered page carries the build's one nonce, and the header
// Vercel gives the page, with and without its trailing slash, enforces a policy that names that
// nonce with frame-ancestors 'none'. An address the function answers (a docs address with no
// page, the app's routes) gets no such header, so its own nonce is the one its policy names.
{
  const home = PRERENDERED.flatMap(({ route, files }) =>
    files
      .filter((file) => existsSync(join(staticDir, file)))
      .map((file) => ({ path: route, file })),
  ).slice(0, 1);
  const docs = staticDocs().pages.map((path) => ({
    path,
    file: `${path.slice(1)}/index.html`,
  }));
  const pages = [...home, ...docs].map(({ path, file }) => {
    const html = readFileSync(join(staticDir, file), 'utf8');
    return { path, values: [...html.matchAll(/\snonce="([^"]*)"/g)].map((m) => m[1]) };
  });
  const values = new Set(pages.flatMap((page) => page.values));
  const bare = pages.filter((page) => page.values.length === 0);
  const nonce = values.size === 1 ? [...values][0] : null;
  row(
    'csp',
    'static csp: one nonce on every prerendered page',
    pages.length > 0 && bare.length === 0 && nonce !== null,
    `${pages.length} page(s), ${pages.reduce((n, page) => n + page.values.length, 0)} nonce attribute(s), ${values.size} value(s)${bare.length > 0 ? `; no nonce on ${bare[0].path}` : ''}`,
  );
  /** Why the header of a path does not enforce the page's nonce, or null when it does. */
  const cspProblem = (path) => {
    const csp = collectedHeaders(path)['content-security-policy'];
    if (typeof csp !== 'string') return 'no content-security-policy';
    if (nonce === null || !csp.includes(`'nonce-${nonce}'`)) return 'another nonce';
    if (!/(?:^|;)\s*frame-ancestors 'none'(?:;|$)/.test(csp)) return "no frame-ancestors 'none'";
    if (/script-src[^;]*'unsafe-inline'/.test(csp)) return "script-src 'unsafe-inline'";
    return null;
  };
  const groups = [
    ['/home', home.map(({ path }) => [path, `${path}/`]).flat()],
    ['the docs pages', docs.map(({ path }) => path)],
    ['the docs pages with a trailing slash', docs.map(({ path }) => `${path}/`)],
  ];
  for (const [name, paths] of groups) {
    const bad = paths.filter((path) => cspProblem(path) !== null);
    row(
      'csp',
      `static csp ${name}`,
      paths.length > 0 && bad.length === 0,
      paths.length === 0
        ? 'no prerendered page'
        : bad.length === 0
          ? `${paths.length} of ${paths.length} enforce the page's nonce`
          : `${bad.length} of ${paths.length} do not: ${bad[0]} (${cspProblem(bad[0])})`,
    );
  }
  const answered = ['/docs/no-such-page', '/new', '/decks', '/deck/gt-brand', '/docs/index.md'];
  const stray = answered.filter((path) => {
    const headers = collectedHeaders(path);
    return 'content-security-policy' in headers || 'content-security-policy-report-only' in headers;
  });
  row(
    'csp',
    'static csp on the prerendered pages alone',
    stray.length === 0,
    stray.length === 0
      ? `no policy header on ${answered.join(', ')}`
      : `a policy header on ${stray.join(', ')}`,
  );
}
for (const file of STATIC_FILES) {
  const path = join(staticDir, file);
  const present = existsSync(path);
  row('static', file, present, present ? `${lstatSync(path).size} B` : 'missing');
}
// the twins (the public folders, read from the tree)
const publicDir = join(ROOT, 'apps/studio/public');
for (const folder of STATIC_FOLDERS) {
  const source = join(publicDir, folder);
  const expected = existsSync(source)
    ? readdirSync(source).filter(
        (name) => !name.startsWith('.') && /\.(?:png|jpg|webp|avif)$/.test(name),
      )
    : [];
  const missing = expected.filter((name) => !existsSync(join(staticDir, folder, name)));
  row(
    'static',
    `${folder}/ pictures (${expected.length} in apps/studio/public/${folder})`,
    expected.length > 0 && missing.length === 0,
    expected.length === 0
      ? `no pictures under apps/studio/public/${folder}`
      : missing.length === 0
        ? 'every file present'
        : `missing ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`,
  );
}
for (const { route, files } of PRERENDERED) {
  const found = files.find((file) => existsSync(join(staticDir, file)));
  row(
    'static',
    `${route} prerendered`,
    found !== undefined,
    found ? `static/${found}` : `none of ${files.join(', ')}`,
  );
}
if (existsSync(staticDir)) {
  const size = directorySize(staticDir);
  row('static', 'static/ total', true, `${mb(size.bytes)} in ${size.files} file(s)`, false);
}

// SPEC-4 0.35, 0.45: each function directory's size against the cap (reported; the cap itself fails a deploy)
const functions = functionDirs(join(OUT, 'functions'));
row('functions', 'function directories', functions.length > 0, `${functions.length} found`);
// 2026-10-19: no symbolic link inside a function (apps/studio/vite.deploy.config.ts
// FUNCTION_LINKS replaces nf3's links to a package traced at two versions with copies)
const links = functions.flatMap((dir) => linksUnder(dir));
row(
  'functions',
  'symbolic links inside a function',
  links.length === 0,
  links.length === 0
    ? 'none'
    : `${links.length}: ${links
        .slice(0, 3)
        .map((path) => relative(OUT, path))
        .join(', ')}`,
);
const sizes = [];
for (const dir of functions) {
  const size = directorySize(dir);
  sizes.push({ dir: relative(OUT, dir), bytes: size.bytes, files: size.files });
  row(
    'functions',
    relative(join(OUT, 'functions'), dir),
    size.bytes < FUNCTION_CAP_BYTES,
    `${mb(size.bytes)} in ${size.files} file(s), cap ${mb(FUNCTION_CAP_BYTES)}`,
  );
}

if (args.json) {
  mkdirSync(dirname(resolve(args.json)), { recursive: true });
  writeFileSync(
    resolve(args.json),
    JSON.stringify({ at: new Date().toISOString(), dir: OUT, rows, functions: sizes }, null, 2),
  );
  console.log(`check-vercel-output: wrote ${resolve(args.json)}`);
}
const asserted = rows.filter((r) => r.asserted).length;
console.log(
  `check-vercel-output: ${asserted - failures} of ${asserted} assertions met under ${OUT}`,
);
process.exit(failures > 0 && !args.report ? 1 : 0);
