import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

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
const PACKAGES_PATTERN =
  '{theme/src/gt-ink-paper/*.css,theme/assets/sprite.svg,fonts/src/inter.css,fonts/assets/InterVariable.woff2,fonts/export/*,export/src/calibration/calibration.json}';

// Vercel Functions (docs/hosting.md, section limits): the base function keeps the project's
// duration default written out; the routes that render or export (and the server functions, which
// TanStack Start posts to /_serverFn/<id>) get their own function directories with the longer
// budget and more memory. 800 s is the Pro maximum and what the synchronous export's 780 s
// budget assumes (server/export-sync.ts SYNC_EXPORT_TIMEOUT_MS); 3009 MB is the Pro memory cap
// for a function, and Fluid compute maps it to its 4 GB tier or warns at build time (the first
// preview deploy records which; docs/hosting.md).
const HEAVY = { maxDuration: 800, memory: 3009 } as const;

// @sparticuz/chromium reads bin/*.br relative to its own module, which the dependency tracer
// cannot see, and @turboslide/headless imports the package through a variable specifier, which
// the bundler cannot see either; the full-trace suffix copies every file of the package
// (docs/hosting-chromium.md section 6; Nitro traceDeps: "pkg*: Full trace"). Nitro resolves such
// an entry from this app's direct dependencies and from this directory, and under pnpm's strict
// layout the package is only where a package.json declares it, so apps/studio/package.json lists
// it as an optional dependency too (measured without that: "nf3: could not resolve `traceInclude`
// entry "@sparticuz/chromium" from any root" and no node_modules/@sparticuz in the function;
// traceOpts.traceIncludeRoots is overwritten by Nitro's own root list and does not help).
const TRACE_DEPS = ['@sparticuz/chromium*', ...(NATIVE_ADDON_PRESENT ? [NATIVE_ADDON] : [])];

// The route rules Nitro compiles into the deployment's config.json (gslides-parity SPEC-4 0.43,
// 1.6, 3.13; R02 section 8; scripts/check-vercel-output.mjs asserts one route per rule): the icon
// set and the card a day in the browser with a week of stale service, the manifest a day, the
// manifest icons a week with a month stale, B2's content hashed /home/** screenshots a year and
// immutable, the GT deck's twins an hour with a day at the CDN and a week stale (they are not
// content hashed, so a year would pin a regenerated twin), and `/` as a 307 to /new with the
// `x-robots-tag` header, so the redirect never wakes the function (routes/index.tsx keeps its
// `beforeLoad` for a client side visit). The /brand/** twins are named without a content hash
// (site.ts TWIN_PATHS: hero-dark.png and the rest), so they take the icon set's day and week
// rather than 1.6's immutable year until their names carry a hash. On the node-server build the
// same rules run in h3, so the local check sees the redirect and the headers too.
const DAY = 'public, max-age=86400, stale-while-revalidate=604800';
const WEEK = 'public, max-age=604800, stale-while-revalidate=2592000';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const ROUTE_RULES = {
  '/': { redirect: { to: '/new', status: 307 as const }, headers: { 'x-robots-tag': 'noindex' } },
  '/favicon.ico': { headers: { 'cache-control': DAY } },
  '/icon.svg': { headers: { 'cache-control': DAY } },
  '/apple-touch-icon.png': { headers: { 'cache-control': DAY } },
  '/og/turboslide.png': { headers: { 'cache-control': DAY } },
  '/manifest.webmanifest': { headers: { 'cache-control': 'public, max-age=86400' } },
  '/icons/**': { headers: { 'cache-control': WEEK } },
  '/brand/**': { headers: { 'cache-control': DAY } },
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
// (`autoStaticPathsDiscovery: false`; /new, /decks and /deck carry per request data).
const HOME_ROUTE = fileURLToPath(new URL('./src/routes/home.tsx', import.meta.url));
const PRERENDER = existsSync(HOME_ROUTE)
  ? {
      pages: [{ path: '/home' }],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
    }
  : {};

// The vendor chunk group (gslides-parity SPEC-4 0.44, 3.12; PP 7; Rolldown `codeSplitting.groups`):
// React, the scheduler and the router in one chunk named `vendor`, so it caches across
// deployments while the app's chunks change. One group and no split by package: the boundary
// between the editor and the viewer is the import graph's (the round four editor split), not a
// chunking rule's. The client environment alone; the server bundle is Nitro's.
const VENDOR_TEST =
  /node_modules[\\/](?:react|react-dom|scheduler|@tanstack[\\/](?:react-router|router-core|history|react-start|react-start-client|start-client-core))[\\/]/;
// Hidden source maps for the client chunks, opt in (the focus round, cycle 3 stream fix round's
// fix round; VERIFICATION C2-F18): `TURBOSLIDE_CLIENT_SOURCEMAP=1` writes a `.map` beside every
// chunk with no `sourceMappingURL` comment, so the served bytes are the same and
// scripts/chunk-attribution.mjs can say which module put how many bytes in which chunk. Off by
// default: a deployment ships no map.
const CLIENT_SOURCEMAP: boolean | 'hidden' =
  process.env.TURBOSLIDE_CLIENT_SOURCEMAP === '1' ? 'hidden' : false;
const CLIENT_BUILD = {
  build: {
    sourcemap: CLIENT_SOURCEMAP,
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'vendor', test: VENDOR_TEST, priority: 10 }] } },
    },
  },
};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  environments: { client: CLIENT_BUILD },
  plugins: [
    externalServerOnly(),
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
      plugins: [`${fileURLToPath(new URL('./src/server/hosting-plugin.ts', import.meta.url))}`],
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
          '/_serverFn/**': HEAVY,
        },
      },
    }),
    viteReact(),
  ],
  server: {
    port: 4321,
    strictPort: true,
    forwardConsole: false,
  },
});
