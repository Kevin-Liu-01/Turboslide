import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Measured hazards, SPEC 3.3 item 5 (tanstack report sections 5.5 and 6.3):
// - devtools() stays in every Vite config. It strips the Solid-based <TanStackDevtools> from the
//   production bundle; without it every SSR request returned 500 and Solid chunks landed in the
//   server output. scripts/check-client-bundle.mjs asserts the latter on every build.
// - server.forwardConsole is off. Vite 8 console forwarding and the devtools console piping fed
//   each other and wrote a 10.7 GB log in eleven minutes.
// - The port is explicit and strict: the studio dev server is always 4321 (AGENTS.md).
// - No Tailwind (SPEC 3.3 item 6): chrome is tokens.css plus one small CSS file per component.
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
// playwright-core joined the list in the M5 integration: the editor's server functions reach the
// deck dispatcher (server/actions.ts), whose asset and material actions load the headless
// package, and the dev server's dependency optimizer followed that chain (it crawls dynamic
// imports too) into playwright-core's own `vite` import and failed on vite's fsevents binary.
// @sparticuz/chromium joined in the hosting round (docs/hosting-chromium.md): an optional
// dependency of @turboslide/headless loaded through a variable specifier, external on the server
// and a stub in the client like the other two.
const SERVER_ONLY = ['sharp', 'playwright-core', '@sparticuz/chromium'] as const;
const STUB_PREFIX = '\0turboslide:server-only-stub:';

function externalServerOnly(): Plugin {
  return {
    name: 'turboslide:external-server-only',
    enforce: 'pre',
    resolveId(source) {
      if (!(SERVER_ONLY as readonly string[]).includes(source)) return null;
      if (this.environment.config.consumer === 'client') return `${STUB_PREFIX}${source}`;
      return { id: source, external: true };
    },
    load(id) {
      if (!id.startsWith(STUB_PREFIX)) return null;
      const name = id.slice(STUB_PREFIX.length);
      const message = JSON.stringify(`${name} runs on the server only`);
      // a default export for `import sharp from 'sharp'`; named imports of playwright-core
      // (chromium) are never evaluated in the browser, the handler that reaches them is stripped
      return [
        `export default function serverOnly() { throw new Error(${message}); }`,
        `export const chromium = { launch() { throw new Error(${message}); } };`,
      ].join('\n');
    },
  };
}

// The vendor chunk group (gslides-parity SPEC-4 0.44, 3.12; PP 7; Rolldown `codeSplitting.groups`),
// the same group as vite.deploy.config.ts so `pnpm build` and scripts/check-client-bundle.mjs
// read the chunks the deployment ships: React, the scheduler and the router in one `vendor`
// chunk that caches across deployments while the app's chunks change. The client environment
// alone.
const VENDOR_TEST =
  /node_modules[\\/](?:react|react-dom|scheduler|@tanstack[\\/](?:react-router|router-core|history|react-start|react-start-client|start-client-core))[\\/]/;
// Hidden source maps, opt in with TURBOSLIDE_CLIENT_SOURCEMAP=1 (vite.deploy.config.ts says why).
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
  plugins: [externalServerOnly(), devtools(), tanstackStart(), viteReact()],
  server: {
    port: 4321,
    strictPort: true,
    forwardConsole: false,
  },
});
