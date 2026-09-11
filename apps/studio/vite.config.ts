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
function externalSharp(): Plugin {
  return {
    name: 'turboslide:external-sharp',
    enforce: 'pre',
    resolveId(source) {
      return source === 'sharp' ? { id: 'sharp', external: true } : null;
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [externalSharp(), devtools(), tanstackStart(), viteReact()],
  server: {
    port: 4321,
    strictPort: true,
    forwardConsole: false,
  },
});
