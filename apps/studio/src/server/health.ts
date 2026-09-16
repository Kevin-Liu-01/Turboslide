import { createServerFn } from '@tanstack/react-start';
import { DEFAULT_PAGE, PAGE_MAX_PX } from '@turboslide/schema/render';

// createServerFn appears only under apps/studio/src/server (SPEC 3.3 item 4): the Start plugin
// compiles these bodies out of the client bundle. The marker string below is the build-time proof
// of that: scripts/check-client-bundle.mjs asserts it appears in zero files under dist/client and
// in at least one file under dist/server (tanstack report section 5.2).
export const SERVER_ONLY_MARKER = 'TURBOSLIDE_SERVER_ONLY_MARKER_7f3a';

export const getServerHealth = createServerFn({ method: 'GET' }).handler(async () => ({
  marker: SERVER_ONLY_MARKER,
  node: process.version,
  /* the default page; a deck's own page is `deck.info.page` (gslides-parity SPEC-5 6.1) */
  sheet: [1600, 900] as const,
  defaultPage: [DEFAULT_PAGE.width, DEFAULT_PAGE.height] as const,
  pageMax: PAGE_MAX_PX,
}));
