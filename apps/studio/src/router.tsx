import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { getGlobalStartContext } from '@tanstack/react-start';

import { setDitherWorkerFactory } from '@turboslide/viewer/dither';

import { routeTree } from './routeTree.gen';

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

export function getRouter() {
  registerDitherWorker();
  const nonce = requestNonce();
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
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
