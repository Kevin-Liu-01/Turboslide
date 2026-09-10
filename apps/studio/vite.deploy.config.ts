import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Deployment build: `pnpm --filter @turboslide/studio build:deploy`. Nitro picks the target from
// NITRO_PRESET: node-server (default), vercel (built and verified, not deployed), bun (bundle only)
// (SPEC 3.2, 11; tanstack report section 6.2). Same routes and server functions as vite.config.ts.
// devtools() must stay in the list for the reason given in vite.config.ts.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tanstackStart(), nitro(), viteReact()],
  server: {
    port: 4321,
    strictPort: true,
    forwardConsole: false,
  },
});
