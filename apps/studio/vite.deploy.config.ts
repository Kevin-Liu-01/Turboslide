import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Deployment build: `pnpm --filter @turboslide/studio build:deploy`. Nitro picks the target from
// NITRO_PRESET: node-server (default), vercel (built and verified, not deployed), bun (bundle only)
// (SPEC 3.2, 11; tanstack report section 6.2). Same routes and server functions as vite.config.ts.
// devtools() must stay in the list for the reason given in vite.config.ts.
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
  plugins: [externalSharp(), devtools(), tanstackStart(), nitro(), viteReact()],
  server: {
    port: 4321,
    strictPort: true,
    forwardConsole: false,
  },
});
