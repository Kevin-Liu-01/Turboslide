// The studio's own Vite config with the file watcher blind to the repository (the focus round,
// b3 R22, b4's cycle 2): a Playwright or probe run against a dev server on the shared checkout is
// a measurement only while no other lane's save remounts the page mid run (the text and arrange
// walk of 2026-09-16 21:38Z lost nine rows to a full reload after a "Could not Fast Refresh" of
// Editor.tsx). HMR stays on so the dependency optimizer's first load reload still reaches the
// page; a server on this config is restarted to pick up an edit. From `apps/studio`:
//
//   TURBOSLIDE_STORE=tmp ... node_modules/.bin/vite dev --port <port> --strictPort -c vite.no-watch.config.ts
import base from './vite.config';

const IGNORED = /\/(packages|apps|scripts|docs|tooling)\//;

export default {
  ...base,
  server: {
    ...(base as { server?: Record<string, unknown> }).server,
    watch: { ignored: (path: string) => IGNORED.test(path) },
  },
};
