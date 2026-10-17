import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { fumadocsMdx } from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

import { STATIC_HEADERS, prerenderNonce, staticPageCsp } from './src/server/headers.ts';
import { buildDefine } from './src/server/build-commit';

// Deployment build: `pnpm --filter @turboslide/studio build:deploy`. Nitro picks the target from
// NITRO_PRESET: node-server (default), vercel (apps/studio/vercel.json; docs/hosting.md), bun
// (bundle only) (SPEC 3.2, 11; tanstack report section 6.2). Same routes and server functions as
// vite.config.ts. devtools() must stay in the list for the reason given in vite.config.ts.
// sharp is a native addon reached from the server routes through @turboslide/render-worker/client
// (its local verify job imports @turboslide/effects/io) and cannot be bundled. The effects, export
// and cli tsconfigs alias `sharp` to its .d.ts because the package's exports map has no types
// condition, and `resolve.tsconfigPaths` would follow that alias into the type file
// (measured during the M2 integration: MISSING_EXPORT "default" on lib/index.d.ts). This resolver
// runs before Vite's and keeps `sharp` a runtime import, resolved from the workspace root.
// In the browser the same import must resolve to nothing that runs: the client transform of a
// createServerFn module keeps its module-level imports in dev (measured during the M3
// integration: /edit loaded server/thumbs.ts, reached @turboslide/effects/io and asked for
// /@id/sharp, a 404 that broke the route's lazy chunk), so the client consumer gets a stub whose
// default export throws if anything ever calls it; the production client bundle tree-shakes it.
// playwright-core joined the list in the M5 integration (vite.config.ts says why).
// @sparticuz/chromium joined in the hosting round for the serverless Chromium builder: external
// on the server so Nitro's dependency tracing copies the package with its bin/ folder (the
// Brotli-packed browser) into the function, a stub in the client; unused until the package is
// installed and packages/headless resolves it.
// The Linux addon of the Rust crate (gslides-parity SPEC-4 0.38, 3.9; build-4/b4.md R10): once
// B4 commits `packages/native/npm/linux-x64-gnu/turboslide-native.linux-x64-gnu.node` and
// apps/studio/package.json lists the package under optionalDependencies, it is external on the
// server (the function loads the .node file, never a bundle of it), a stub in the client, and a
// traced dependency so Nitro copies the file into the function. The lines apply only while the
// package resolves from this app, so a tree without the addon builds as before (a `traceDeps`
// entry that resolves nowhere fails the build, measured for @sparticuz/chromium).
const NATIVE_ADDON = '@turboslide/native-linux-x64-gnu';
const NATIVE_ADDON_PRESENT = existsSync(
  fileURLToPath(new URL(`./node_modules/${NATIVE_ADDON}/package.json`, import.meta.url)),
);
const SERVER_ONLY: readonly string[] = [
  'sharp',
  'playwright-core',
  '@sparticuz/chromium',
  ...(NATIVE_ADDON_PRESENT ? [NATIVE_ADDON] : []),
];
const STUB_PREFIX = '\0turboslide:server-only-stub:';

function externalServerOnly(): Plugin {
  return {
    name: 'turboslide:external-server-only',
    enforce: 'pre',
    resolveId(source) {
      if (!SERVER_ONLY.includes(source)) return null;
      if (this.environment.config.consumer === 'client') return `${STUB_PREFIX}${source}`;
      return { id: source, external: true };
    },
    load(id) {
      if (!id.startsWith(STUB_PREFIX)) return null;
      const name = id.slice(STUB_PREFIX.length);
      const message = JSON.stringify(`${name} runs on the server only`);
      return [
        `export default function serverOnly() { throw new Error(${message}); }`,
        `export const chromium = { launch() { throw new Error(${message}); } };`,
      ].join('\n');
    },
  };
}

// The hosted store (docs/hosting.md; server/root.ts, server/hosting-plugin.ts). The function has
// no checkout and no writable disk apart from /tmp, so the decks a hosted studio starts from
// travel inside the bundle: decks/templates and decks/gt-brand (its documents and its 30 MB of
// twins) as the `decks` server asset group, read at runtime through useStorage('assets:decks')
// by the plugin and written into the overlay on first use. The GT deck's twins are also static
// files of the deployment at their own URL, so the CDN serves them before the function runs;
// fallthrough stays on so a twin added later reaches the assets route. The paths are absolute
// from this file, not the working directory, because turbo runs the build from apps/studio and
// scripts/check.mjs from the root.
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const DECKS_DIR = `${REPO}decks`;

/** The seed folders that ship in the function; decks/fixture and scratch decks stay out. */
const SEED_PATTERN = '{templates,gt-brand}/**/*';

// The GT deck's 30 MB of twins leave the function bundle (gslides-parity SPEC-4 0.35, 3.6; PP 3.6
// item 1): the `decks` server asset group keeps the documents (deck.json, the slides, the
// templates with the blank template's 2.2 MB of starter pictures) and drops decks/gt-brand/assets,
// which are static files of the deployment already (`publicAssets` below) and on Blob after
// `seedOnce`. A render or an export on a fresh instance reads them through
// `ensureDeckAssets` (server/root.ts, B4's round four change: the deployment's static URL or
// Blob in place of the bundle), and `deck.create` from the GT template copies them from the same
// source. The two changes land together at merge 2: with this ignore in place and the old
// `ensureDeckAssets`, a render on a fresh instance would wait on twins the overlay never gets
// (docs/hosting.md measured a 300 s hang on missing images), so the integrator confirms B4's
// source is in the tree before this config ships. The `tmp` tier (check step 31's node-server
// build) needs the same fallback in packages/store/src/tmp-store.ts (b4.md R2, the integrator's);
// DROP_SEED_TWINS is the one switch to hold the twins in the bundle if either is missing at merge 2.
const DROP_SEED_TWINS = true;
const SEED_IGNORE = [
  '**/.turboslide/**',
  '**/.DS_Store',
  '**/*.lock',
  ...(DROP_SEED_TWINS ? ['gt-brand/assets/**'] : []),
];

// The runtime files of the theme, fonts and export packages: the renderer reads sheet.css,
// stage.css, the sprite and Inter from the workspace (@turboslide/render/theme-node), the
// exporter reads the export faces and calibration.json, and a function has no workspace. They
// travel as the `packages` server asset group (6.1 MB, the export faces most of it), materialized
// by server/root.ts under the overlay and named in TURBOSLIDE_PACKAGES_DIR. Measured without
// them: `import.meta.resolve('@turboslide/theme/package.json')` has nothing to resolve in the
// function and `new URL('../calibration/calibration.json', import.meta.url)` names a file that
// is not in the bundle.
const PACKAGES_DIR = `${REPO}packages`;
// The font catalog of the product round (docs/archive/rounds/PRODUCT.md 4.2, 5.1; SPEC-5-amendments A5):
// `fonts/assets/<id>/*` carries the 26 open families beside their LICENSE files once B5a's port
// lands them (99 files, about 14.4 MB), so the export function names a catalog face in the
// PowerPoint's `a:latin typeface` and embeds its subset in the PDF; on a tree without the
// folders the glob matches nothing and the group is the 6.1 MB it was. The group's size after
// the port is measured on the first preview deploy and recorded in build/b7.md, never typed here.
// The shader gallery's stills of the features round's ship two (docs/archive/rounds/FEATURES.md 5.4;
// `packages/materials/previews/*`, about 600 KB of webp once B5's `build-shader-previews.mjs`
// commits them) join the group so a server route that serves a still from the workspace finds the
// file in the function; on a tree without the folder the glob matches nothing.
const PACKAGES_PATTERN =
  '{theme/src/gt-ink-paper/*.css,theme/assets/sprite.svg,fonts/src/inter.css,fonts/assets/InterVariable.woff2,fonts/assets/*/*,fonts/export/*,export/src/calibration/calibration.json,materials/previews/*}';

// Vercel Functions (docs/hosting.md, section limits): the base function keeps the project's
// duration default written out; the routes that render or export (and the server functions, which
// TanStack Start posts to /_serverFn/<id>) get their own function directories with the longer
// budget. 800 s is the Pro maximum and what the synchronous export's 780 s budget assumes
// (server/export-sync.ts SYNC_EXPORT_TIMEOUT_MS). The memory size is not set here: on Fluid
// compute it is the project's dashboard setting (standard, 2 GB and 1 vCPU; the seven day metric
// read 2048 MB for every /_serverFn path) and a `memory` value in the build output is ignored with
// a build warning, so the `memory: 3009` this rule carried until the sync and costs round was
// inert (docs/gslides-parity/sync/audit-costs.md item 19; docs/HOSTING-MOVE.md section 9).
const HEAVY = { maxDuration: 800 } as const;

// The assist route (docs/archive/rounds/PRODUCT.md 6.3): its own function directory with a 60 s duration, so a
// WAF rule (firewall/rules.json R22) and a duration can name it; a model call
// at low effort answers in about ten seconds and the route's own deadline is under the minute.
const ASSIST = { maxDuration: 60 } as const;

// @sparticuz/chromium reads bin/*.br relative to its own module, which the dependency tracer
// cannot see, and @turboslide/headless imports the package through a variable specifier, which
// the bundler cannot see either; the full-trace suffix copies every file of the package
// (docs/hosting-chromium.md section 6; Nitro traceDeps: "pkg*: Full trace"). Nitro resolves such
// an entry from this app's direct dependencies and from this directory, and under pnpm's strict
// layout the package is only where a package.json declares it, so apps/studio/package.json lists
// it as an optional dependency too (measured without that: "nf3: could not resolve `traceInclude`
// entry "@sparticuz/chromium" from any root" and no node_modules/@sparticuz in the function;
// traceOpts.traceIncludeRoots is overwritten by Nitro's own root list and does not help).
// @paper-design/shaders joined in the features round's ship two fix round (docs/archive/rounds/FEATURES.md 5.5,
// 5.8; VERIFICATION.md pass 1 F2): the hosted capture serves Paper's dist to its browser and
// reads the noise texture out of it, so `packages/materials/src/capture.ts` `paperDistDir`
// resolves the package at run time (`createRequire(import.meta.url).resolve`), while the server
// bundle carried the modules inline and no `node_modules/@paper-design` at all. Measured on the
// ship two preview: `shader.render` answered "Cannot find module '@paper-design/shaders'" in
// about 140 ms, and `shader.capture`, `slide.setBackgroundMaterial` and the Background dialog's
// Place answered the one render sentence for every material. With the full-trace suffix the
// import stays external on the server and nf3 copies the whole package (dist/shaders included,
// about 1 MB) beside the function, so the run time resolve finds it where the checkout would.
// No package.json line is needed here: the import in capture.ts is a static specifier the
// bundler resolves, so the traced path is known and the root lookup that @sparticuz/chromium's
// variable specifier needs never runs. The client bundle is untouched (the plugin is the server
// build's).
const TRACE_DEPS = [
  '@sparticuz/chromium*',
  '@paper-design/shaders*',
  ...(NATIVE_ADDON_PRESENT ? [NATIVE_ADDON] : []),
];

// The docs (docs/POLISH-2.md 5.2, C23): every page under content/docs, its markdown twin and the
// search index, read from the content folder when the config loads, so a page added to the folder
// is prerendered with no list to edit. A page's address drops `.mdx` and a folder's `index`; its
// twin is the address with `.md` (/docs/index.md for /docs). The twins are files on the CDN, so the
// two headers their route writes (the markdown type with its charset and the canonical Link) are
// route rules here, one per twin, which Nitro writes in front of the static file on Vercel and
// applies in h3 on the node server.
const DOCS_DIR = fileURLToPath(new URL('./content/docs', import.meta.url));
const DOCS_ORIGIN = (
  process.env.TURBOSLIDE_PUBLIC_ORIGIN?.trim() || 'https://www.turboslide.com'
).replace(/\/+$/, '');

function mdxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...mdxFiles(full));
    else if (name.endsWith('.mdx')) out.push(full);
  }
  return out;
}

/** Every docs page's address and twin, from the content folder. */
function docsAddresses(): { page: string; twin: string }[] {
  return mdxFiles(DOCS_DIR).map((file) => {
    const parts = relative(DOCS_DIR, file).slice(0, -'.mdx'.length).split(sep);
    if (parts[parts.length - 1] === 'index') parts.pop();
    return parts.length === 0
      ? { page: '/docs', twin: '/docs/index.md' }
      : { page: `/docs/${parts.join('/')}`, twin: `/docs/${parts.join('/')}.md` };
  });
}

const DOCS = docsAddresses();

/**
 * The agent contracts as static files (hardening PS#9, PERF-14): the three routes answer the
 * bundle's generated files with no per request data, so the CDN serves them and no request for
 * them reaches the function or its cookie. Their headers are the routes' own: the type, and
 * contracts.ts CONTRACTS_CACHE_CONTROL (a day at the CDN, five minutes in the browser).
 */
const CONTRACTS_CACHE = 'public, max-age=300, s-maxage=86400';
const CONTRACT_FILES = [
  { path: '/llms.txt', type: 'text/plain; charset=utf-8' },
  { path: '/llms-full.txt', type: 'text/plain; charset=utf-8' },
  { path: '/openapi.json', type: 'application/json; charset=utf-8' },
];
const CONTRACT_RULES = Object.fromEntries(
  CONTRACT_FILES.map(({ path, type }) => [
    path,
    { headers: { 'content-type': type, 'cache-control': CONTRACTS_CACHE, ...STATIC_HEADERS } },
  ]),
);

/**
 * The prerendered docs files: each page, each twin, the search index, the agents' full text and the
 * sitemap (5.2, 5.7).
 */
const DOCS_PRERENDER = [
  ...DOCS.flatMap(({ page, twin }) => [{ path: page }, { path: twin }]),
  { path: '/docs/search.json' },
  { path: '/docs/llms-full.txt' },
  { path: '/sitemap.xml' },
];

/**
 * The twins' headers on their static copies (routes/docs.{$}[.]md.ts writes the same two), with the
 * static headers, because Vercel applies the first header rule a path matches and a twin's own rule
 * comes before `/docs/**` (HR-W#3a).
 */
const DOCS_TWIN_RULES = Object.fromEntries(
  DOCS.map(({ page, twin }) => [
    twin,
    {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        link: `<${DOCS_ORIGIN}${page}>; rel="canonical"`,
        ...STATIC_HEADERS,
      },
    },
  ]),
);

// The route rules Nitro compiles into the deployment's config.json (gslides-parity SPEC-4 0.43,
// 1.6, 3.13; R02 section 8; scripts/check-vercel-output.mjs asserts one route per rule): the icon
// set and the card a day in the browser with a week of stale service, the manifest a day, the
// manifest icons a week with a month stale, B2's content hashed /home/** screenshots a year and
// immutable, the GT deck's twins an hour with a day at the CDN and a week stale (they are not
// content hashed, so a year would pin a regenerated twin), and `/` as a 307 to /new with the
// `x-robots-tag` header, so the redirect never wakes the function (routes/index.tsx keeps its
// `beforeLoad` for a client side visit). The /brand/** twins are named without a content hash
// (site.ts TWIN_PATHS: hero-dark.png and the rest), so they take the icon set's day and week
// rather than 1.6's immutable year until their names carry a hash. The GT cover under
// /brand/cover/ is named by its sha256 (site.ts GT_COVER, hardening HR-PS#10), so it takes the
// immutable year; Nitro writes the rules with more path segments first, so Vercel matches
// `/brand/cover/**` before `/brand/**`. On the node-server build the same rules run in h3, so the
// local check sees the redirect and the headers too.
// The answers the CDN gives before the function runs carry the app's security headers
// (`STATIC_HEADERS`, hardening HR-W#3a, SPEC-1): the root redirect, the prerendered pages, the docs'
// twins, the icon and robots.txt. Nitro compiles a header rule into a route without `continue`, and
// Vercel applies the first such route a path matches, so each rule of those paths carries the whole
// set: `/docs` and `/home/` get rules of their own (`/docs/**` does not match `/docs` there, and the
// static layer answers `/home/` with the page under the screenshots' `/home/**` year).
const DAY = 'public, max-age=86400, stale-while-revalidate=604800';
const WEEK = 'public, max-age=604800, stale-while-revalidate=2592000';
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** A prerendered page: the CDN's copy, revalidated by the browser on every visit. */
const PAGE = 'public, max-age=0, must-revalidate';
const ROUTE_RULES = {
  '/': {
    redirect: { to: '/new', status: 307 as const },
    headers: { 'x-robots-tag': 'noindex', ...STATIC_HEADERS },
  },
  /* the prerendered pages (docs/POLISH-2.md 5.2): the header Vercel gives /home's static file, so the
     CDN serves a page and a browser asks again before using its copy; written for /home too, which
     the node server otherwise answered with the /home/** rule's year (h3 matches the page itself) */
  '/home': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  '/home/': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  /* the site pages of the pages step, prerendered as /home is */
  '/features': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  '/faq': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  '/about': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  '/docs': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  '/docs/**': { headers: { 'cache-control': PAGE, ...STATIC_HEADERS } },
  ...DOCS_TWIN_RULES,
  ...CONTRACT_RULES,
  '/favicon.ico': { headers: { 'cache-control': DAY, ...STATIC_HEADERS } },
  '/robots.txt': { headers: { ...STATIC_HEADERS } },
  '/icon.svg': { headers: { 'cache-control': DAY } },
  '/apple-touch-icon.png': { headers: { 'cache-control': DAY } },
  '/og/turboslide.png': { headers: { 'cache-control': DAY } },
  '/manifest.webmanifest': { headers: { 'cache-control': 'public, max-age=86400' } },
  '/icons/**': { headers: { 'cache-control': WEEK } },
  '/brand/**': { headers: { 'cache-control': DAY } },
  '/brand/cover/**': { headers: { 'cache-control': IMMUTABLE } },
  '/home/**': { headers: { 'cache-control': IMMUTABLE } },
  '/decks/gt-brand/assets/**': {
    headers: {
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  },
};

// /home is prerendered at build and served as a static file (gslides-parity SPEC-4 0.43, 2.1; PP
// 6): the page has no loader and no per request data, so its first byte is the CDN's. The entry
// is added once B2's route file is in the tree, so the deploy build passes before that and
// prerenders the page from then on; the other routes are never prerendered
// (`autoStaticPathsDiscovery: false`; /new, /decks and /deck carry per request data). The docs join
// the list with their twins and their search index (docs/POLISH-2.md 5.2, DOCS_PRERENDER above).
const HOME_ROUTE = fileURLToPath(new URL('./src/routes/home.tsx', import.meta.url));
const PRERENDER = existsSync(HOME_ROUTE)
  ? {
      pages: [
        { path: '/home' },
        { path: '/features' },
        { path: '/faq' },
        { path: '/about' },
        ...DOCS_PRERENDER,
        ...CONTRACT_FILES.map(({ path }) => ({ path })),
      ],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        /* the docs add some seventy files (POLISH-2.md 5.2): at the default of one request per core a
           loaded machine timed the preview server out on two of them, and the start plugin logs
           such a failure as an unhandled rejection rather than failing the build (measured
           2026-10-07, load 112 to 141), so the requests go four at a time and a failed one is tried
           again three times */
        concurrency: 4,
        retryCount: 3,
        retryDelay: 2000,
      },
    }
  : {};

// The prerendered pages' policy (hardening HR-W#3b, SPEC-1, CRIT-W5). The build mints one nonce
// (`prerenderNonce`, kept in TURBOSLIDE_PRERENDER_NONCE so the prerender's preview server reads
// the same value), and the request middleware hands it to every page it renders while TanStack
// Start prerenders. Once the prerender is done, `staticPagePolicy` adds one Vercel route to the
// Build Output's config.json: a `content-security-policy` header written by headers.ts's builder,
// with that nonce and `frame-ancestors 'none'`, on every prerendered page whose file is under
// static/ and carries that nonce alone, with and without its trailing slash. The route is
// `continue: true`, so the route rule of the path still applies its own headers after it. A page
// the prerender skipped (the start plugin's retry does not run again, and a loaded machine times
// a page out) is answered by the function with the request's nonce and the middleware's policy,
// so the route never names it. It is a Vercel route and not a route rule: on the node server the
// function renders these pages with the request's nonce, and h3 writes a route rule's headers
// over the answer's. One nonce for every visitor is safe on these pages alone: they hold no deck
// content and nothing of a person.
const PRERENDER_NONCE = prerenderNonce();
const STATIC_PAGES = existsSync(HOME_ROUTE)
  ? ['/home', '/features', '/faq', '/about', ...DOCS.map(({ page }) => page)]
  : [];
const VERCEL_OUTPUT = fileURLToPath(new URL('./.vercel/output/', import.meta.url));
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the page's file is this build's: at least one nonce attribute, each the build's. */
function carriesBuildNonce(file: string): boolean {
  if (!existsSync(file)) return false;
  const values = [...readFileSync(file, 'utf8').matchAll(/\snonce="([^"]*)"/g)].map((m) => m[1]);
  return values.length > 0 && values.every((value) => value === PRERENDER_NONCE);
}

function staticPagePolicy(): Plugin {
  return {
    name: 'turboslide:static-page-policy',
    enforce: 'post',
    buildApp: {
      order: 'post',
      async handler(builder) {
        const configPath = join(VERCEL_OUTPUT, 'config.json');
        const headers = staticPageCsp(PRERENDER_NONCE);
        if (!existsSync(configPath) || Object.keys(headers).length === 0) return;
        // a node-server build leaves an older Vercel output alone: its pages carry another nonce
        const pages = STATIC_PAGES.filter((page) =>
          carriesBuildNonce(join(VERCEL_OUTPUT, 'static', page.slice(1), 'index.html')),
        );
        if (pages.length === 0) return;
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        config.routes.unshift({
          src: `^(?:${pages.map(escapeRegExp).join('|')})/?$`,
          headers,
          continue: true,
        });
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        builder.config.logger.info(
          `static page policy: ${pages.length} of ${STATIC_PAGES.length} prerendered pages carry the build's nonce and its header`,
        );
      },
    },
  };
}

// The vendor chunk group (gslides-parity SPEC-4 0.44, 3.12; PP 7; Rolldown `codeSplitting.groups`):
// React, the scheduler and the router in one chunk named `vendor`, so it caches across
// deployments while the app's chunks change. One group and no split by package: the boundary
// between the editor and the viewer is the import graph's (the round four editor split), not a
// chunking rule's. The client environment alone; the server bundle is Nitro's.
// React DOM's server renderers stay out of the group: fumadocs-core's loader imports
// `react-dom/server.edge` on demand (its page tree serializer), and the test pulled those 207 KB
// into the chunk every route preloads (polish two, requests A-R1 and P2-D-2; the node-server build
// of 2026-10-07). With the docs' lazy chunks in the graph the group takes effect, so the chunk
// every route preloads is named `vendor` and holds the app's shared modules with the libraries.
// The group holds libraries alone (hardening HR-PC#2, PERF-9): the group takes in its modules'
// dependencies, and the start runtime's hydration entry imports the app's router (the route tree,
// every route file's options and what they import), so with it the `vendor` chunk carried about
// 124 KB of the app's modules and changed with every deployment. The modules on that path (the
// default client entry, `@tanstack/react-start/client`, the start client's index, `StartClient`
// and `hydrateStart`, and the core's `client/` entry) stay out of the group and land in the entry
// chunk with the app; the router and React stay in it.
const VENDOR_EXCLUDE =
  /@tanstack[\\/](?:react-start[\\/]dist[\\/](?:plugin[\\/]|esm[\\/]client\.js)|react-start-client[\\/]dist[\\/]esm[\\/](?:index|StartClient|hydrateStart)\.js|start-client-core[\\/]dist[\\/]esm[\\/]client[\\/])/;
const VENDOR_TEST = new RegExp(
  `^(?!.*${VENDOR_EXCLUDE.source})` +
    /.*node_modules[\\/](?:react|react-dom|scheduler|@tanstack[\\/](?:react-router|router-core|history|react-start|react-start-client|start-client-core))[\\/](?!server|cjs[\\/]react-dom-server)/
      .source,
);
// Hidden source maps for the client chunks, opt in (the focus round, cycle 3 stream fix round's
// fix round; VERIFICATION C2-F18): `TURBOSLIDE_CLIENT_SOURCEMAP=1` writes a `.map` beside every
// chunk with no `sourceMappingURL` comment, so the served bytes are the same and
// scripts/chunk-attribution.mjs can say which module put how many bytes in which chunk. Off by
// default: a deployment ships no map.
const CLIENT_SOURCEMAP: boolean | 'hidden' =
  process.env.TURBOSLIDE_CLIENT_SOURCEMAP === '1' ? 'hidden' : false;
// The shader gallery's stills stay files (hardening HR-PC#3, PERF-8): `shaderPreviewUrl`'s glob
// of packages/materials/previews/*.webp put every still under the 4 KB inline limit into the
// chunk the viewer and the editor load as a data URL, about 120 KB of base64 in a 138,850 B chunk.
// As files, a still is fetched when the gallery or a card shows it and cached with the build.
const MATERIAL_PREVIEW = /[\\/]materials[\\/]previews[\\/][^\\/]+\.webp$/;
const CLIENT_BUILD = {
  build: {
    sourcemap: CLIENT_SOURCEMAP,
    assetsInlineLimit: (file: string): boolean | undefined =>
      MATERIAL_PREVIEW.test(file) ? false : undefined,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor', test: VENDOR_TEST, priority: 10 },
            /* the app's part of the graph every route loads (the root route, the router, each
               route file's options and what they import) in one chunk beside `vendor`, where
               the bundler would otherwise cut it into a chunk per module the lazy routes share
               (hardening HR-PC#2) */
            { name: 'app', tags: ['$initial' as const], priority: 1 },
          ],
        },
      },
    },
  },
};

// The docs' MDX (docs/POLISH-2.md 5.1), the options vite.config.ts carries and says why: no index
// files, no Shiki, image imports, npm tabs or code tabs, and no change to this config.
const DOCS_MDX: Parameters<typeof fumadocsMdx>[0] = {
  index: false,
  updateViteConfig: false,
  globalOptions: {
    mdxOptions: {
      rehypeCodeOptions: false,
      remarkImageOptions: false,
      remarkNpmOptions: false,
      remarkCodeTabOptions: false,
    },
  },
};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  /* the build's commit for the site footer (components/site/build.ts) */
  define: buildDefine(),
  environments: { client: CLIENT_BUILD },
  plugins: [
    externalServerOnly(),
    fumadocsMdx(DOCS_MDX),
    devtools(),
    tanstackStart(PRERENDER),
    nitro({
      traceDeps: TRACE_DEPS,
      routeRules: ROUTE_RULES,
      serverAssets: [
        {
          baseName: 'decks',
          dir: DECKS_DIR,
          pattern: SEED_PATTERN,
          ignore: SEED_IGNORE,
        },
        { baseName: 'packages', dir: PACKAGES_DIR, pattern: PACKAGES_PATTERN },
      ],
      publicAssets: [
        {
          dir: `${DECKS_DIR}/gt-brand/assets`,
          baseURL: '/decks/gt-brand/assets',
          maxAge: 3600,
          fallthrough: true,
        },
      ],
      plugins: [
        `${fileURLToPath(new URL('./src/server/hosting-plugin.ts', import.meta.url))}`,
        // the node-server build commits its rooms and exits on SIGTERM (hardening HR-O#8,
        // PERF-18); a Vercel function's life is the platform's
        ...((process.env.NITRO_PRESET ?? 'node-server') === 'node-server' &&
        process.env.VERCEL === undefined
          ? [fileURLToPath(new URL('./src/server/plugins/shutdown.ts', import.meta.url))]
          : []),
      ],
      vercel: {
        functions: { maxDuration: 300 },
        // the seed deck's twins are static files the CDN answers before the asset route runs,
        // so the attachment rule of the route (server/headers.ts assetResponseHeaders; SPEC-3
        // 0.28, report 04 F5) is repeated here for the two non raster types the CDN may serve:
        // the headers apply and the filesystem handler still answers (`continue`). Measured on
        // the merge 2 preview: the recipe json of gt-brand went out inline with no policy.
        config: {
          version: 3,
          routes: [
            {
              src: '^/decks/[^/]+/assets/(.*)\\.(json|svg)$',
              headers: {
                'content-disposition': 'attachment',
                'x-content-type-options': 'nosniff',
                'content-security-policy': "sandbox; default-src 'none'",
                'cross-origin-resource-policy': 'same-site',
              },
              continue: true,
            },
          ],
        },
        // gslides-parity SPEC-3 11.3, 8.5: the bundle routes stream a zip of up to 200 MB and the
        // WAF visible export and render routes of /api/x/* run the same jobs the server functions
        // do, so they join the heavy rule; the stream, ops and presence routes stay on the catch
        // all (a stream holds a connection, not CPU, and the catch all's 300 s is its lifetime)
        functionRules: {
          '/api/export/**': HEAVY,
          '/api/render/**': HEAVY,
          '/api/x/export/**': HEAVY,
          '/api/x/render/**': HEAVY,
          '/api/decks/bundle': HEAVY,
          '/api/decks/**/bundle': HEAVY,
          '/api/assist': ASSIST,
          '/api/assist/**': ASSIST,
          '/_serverFn/**': HEAVY,
        },
      },
    }),
    viteReact(),
    staticPagePolicy(),
  ],
  server: {
    port: 4321,
    strictPort: true,
    forwardConsole: false,
  },
});
