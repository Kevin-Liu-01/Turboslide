import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `pnpm --dir <package> test` runs from this directory
// without picking up the root config's project list (vitest looks upward for a config); the root
// `pnpm test` still includes this package through its `projects` glob.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The command tests run the whole CLI in process: every write lints the deck, and a canvas
    // write (`slide to-canvas`, `block set /pos`, `slide set-layout --type freeform`, a block
    // duplicate on a grammar slide, the MCP walk) launches the Chrome for Testing binary and
    // measures the slide on a sheet page. Under the root `pnpm test`, where every package's
    // workers run at once beside the check chain's browsers, one such test passes vitest's 5 s
    // default (the focus round, VERIFICATION F-check5: canvas.test.ts, freeform.test.ts,
    // gslides.test.ts and mcp.test.ts red at 5 s under a load of 8 to 15, green alone). The
    // budget is the one mcp.test.ts already gave its walks, "the timeout the CLI walk allows a
    // slow machine"; the assertions are unchanged.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
