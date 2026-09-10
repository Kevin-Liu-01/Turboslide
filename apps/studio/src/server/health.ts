import { createServerFn } from '@tanstack/react-start';

// createServerFn appears only under apps/studio/src/server (SPEC 3.3 item 4): the Start plugin
// compiles these bodies out of the client bundle. The marker string below is the build-time proof
// of that: scripts/check-client-bundle.mjs asserts it appears in zero files under dist/client and
// in at least one file under dist/server (tanstack report section 5.2).
export const SERVER_ONLY_MARKER = 'TURBOSLIDE_SERVER_ONLY_MARKER_7f3a';

export const getServerHealth = createServerFn({ method: 'GET' }).handler(async () => ({
  marker: SERVER_ONLY_MARKER,
  node: process.version,
  sheet: [1600, 900] as const,
}));
