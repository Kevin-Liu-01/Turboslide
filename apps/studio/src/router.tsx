import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import type { ParsedLocation } from '@tanstack/react-router';
import { getGlobalStartContext } from '@tanstack/react-start';

import { setDitherWorkerFactory } from '@turboslide/viewer/dither';

import { routeTree } from './routeTree.gen';
import { PageRefused } from './routes/-refused-page';

/**
 * The dither preview worker of the block level dither (gslides-parity SPEC-3 10.2, 10.3;
 * apps/studio/src/workers/dither.worker.ts): registered once in the browser so every live render
 * (the editor's stage, the viewer's stage, the live clones) draws its overlays off the main
 * thread through `@turboslide/viewer/dither`'s shared host; on the server, and in a browser
 * without workers, the main thread stages stand in. Vite resolves the `new URL(..., import.meta.url)`
 * worker in dev and in the build.
 */
function registerDitherWorker(): void {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
  setDitherWorkerFactory(
    () => new Worker(new URL('./workers/dither.worker.ts', import.meta.url), { type: 'module' }),
  );
}

/**
 * The request's CSP nonce (gslides-parity SPEC-3 8.8; build-3/b4.md request 2): the security
 * headers middleware mints it into the request context, `ssr.nonce` hands it to the framework's
 * own inline scripts (`HeadContent`, `Scripts`) and `__root.tsx` reads the same value for the boot
 * scripts. The client stub of `getGlobalStartContext` answers nothing, as does a router built
 * outside a request (a prerender, a test), and the page then carries no nonce attributes.
 */
function requestNonce(): string | undefined {
  try {
    const context = getGlobalStartContext() as { nonce?: unknown } | undefined;
    return typeof context?.nonce === 'string' && context.nonce !== '' ? context.nonce : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The route transition (gslides-parity SPEC-4 0.40; PP 5): a same document navigation whose path
 * changes runs under `document.startViewTransition` with the type `route`, so the browser
 * snapshots the old page and cross fades to the new one while the loader runs; brand.css sets the
 * two `::view-transition-*` durations from `--pt-dur-leave` and `--pt-dur-enter`, which the
 * reduced motion block of tokens.css zeroes. A reader who asked for reduced motion gets no
 * transition at all here (`false`), not a zero length one: the browser would still freeze
 * rendering for the snapshot pair. A search or hash change on the same path (a view toggle, a
 * slide change) runs no transition; SlideView.tsx keeps its keyed fade for the slides. Firefox
 * has no view transitions and the router falls back to a plain update.
 *
 * The first load of a document runs no transition either (the focus round, b1 cycle 3 R40;
 * VERIFICATION C2-F26): `pathChanged` is true on the initial navigation too, and with the pending
 * skeleton's `.pt-stagewrap` and the editor's sharing the `pt-stage` name the skeleton's dither
 * curtain was shown as the stage's old image over the sheet for the fade, taking the title's
 * clicks with it (6 of 12 fresh `/new` loads under CPU throttling). `fromLocation` is undefined
 * on that first navigation alone, so the skeleton is replaced in place, as SPEC-4 0.15 describes
 * the curtain.
 */
function routeTransitionTypes({
  fromLocation,
  pathChanged,
}: {
  fromLocation?: ParsedLocation;
  pathChanged: boolean;
}): string[] | false {
  if (fromLocation === undefined) return false;
  if (!pathChanged) return false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  }
  return ['route'];
}

export function getRouter() {
  registerDitherWorker();
  const nonce = requestNonce();
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Preloaded loader data stays fresh for 30 s (gslides-parity SPEC-4 0.39; PP 5; R03 3.1): a
    // hover on a card then a click within that window opens the deck at the preloaded revision
    // instead of running the loader again, and the round three room stream (SPEC-3 3.3) adopts a
    // newer revision within its latency. Round one set 0 ("let an external cache decide") and no
    // external cache exists. The window is the behaviour change 0.39 records: a deck edited on
    // another instance in the 30 s after a hover opens one revision behind, for that latency.
    defaultPreloadStaleTime: 30_000,
    defaultViewTransition: { types: routeTransitionTypes },
    // The product's error page for every route without one of its own (the focus round, cycle 3
    // fix round; VERIFICATION C3-F3): without it a thrown error fell through to the router's
    // global catch boundary and its built in page, "Something went wrong!" with a "Show Error"
    // button on bare paper, which the cycle 3 text walk met over the editor. With a default every
    // route match carries a catch boundary of its own, so an error stays inside its route and the
    // shell around it stands; the page's Reload is `router.invalidate()`. The /edit route names
    // its own component for its two headings (routes/edit.$deckId.tsx EditRefused).
    defaultErrorComponent: PageRefused,
    ...(nonce === undefined ? {} : { ssr: { nonce } }),
  });

  return router;
}

declare module '@tanstack/react-router' {
  // The framework requires an interface here: it merges into the library's Register interface.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
