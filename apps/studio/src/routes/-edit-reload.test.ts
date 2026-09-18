// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

// The editor route's loader across a same address navigation (VERIFICATION.md C3-F3). Under jsdom
// so the router takes the browser's loading algorithm (with no `document` it takes the server's,
// which runs every loader on every load and decides nothing about staleness). With the
// router's defaults a navigation to the address the editor already stands on (a View > Mode row
// picked while it is the mode, a search key cleared that was already absent) runs the route's
// loader again in the background; the loader is `readEditorDeck`, a server function, and when
// the store refuses it (the 429 of C3-F2) the match's status turns to `error`, the router throws
// the error from the match's render and the nearest catch boundary replaces the editor. This
// pins the trigger on the router the studio ships and the option the edit route sets against
// it, with the same memory history on both sides: `shouldReload: false` keeps a standing
// match's loader from running again on a navigation to it (the /new route's answer to
// VERIFICATION-3 finding 51; `staleTime: Infinity` alone does not close it on this router, whose
// flight donor branch reloads a standing match whenever `shouldReload` is unset), while
// `router.invalidate()` (the Reload button of -refused-page.tsx) still runs it and clears the
// error, and another presentation's address is a new match with a run of its own.

const BLOB_429 =
  'Vercel Blob: Too many requests please lower the number of concurrent requests  - try again in 60 seconds.';

function build(options: { shouldReload?: false }) {
  let runs = 0;
  let fail = false;
  const root = createRootRoute();
  const edit = createRoute({
    getParentRoute: () => root,
    path: '/edit/$deckId',
    validateSearch: (search: Record<string, unknown>) =>
      search.mode === 'grid' ? { mode: 'grid' as const } : {},
    loader: async () => {
      runs += 1;
      if (fail) throw new Error(BLOB_429);
      return { run: runs };
    },
    errorComponent: () => null,
    component: () => null,
    ...options,
  });
  const router = createRouter({
    routeTree: root.addChildren([edit]),
    history: createMemoryHistory({ initialEntries: ['/edit/a'] }),
    defaultPreloadStaleTime: 30_000,
  });
  const editMatch = () => router.state.matches.find((match) => match.routeId === edit.id);
  /** the background reload settles after the navigation's promise; wait for its status */
  const settled = async (status: string, timeout = 2000) => {
    const until = Date.now() + timeout;
    while (editMatch()?.status !== status && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return editMatch()?.status;
  };
  const sameAddress = () =>
    router.navigate({ to: '/edit/$deckId', params: { deckId: 'a' }, replace: true });
  return {
    router,
    runs: () => runs,
    fail: (value: boolean) => {
      fail = value;
    },
    editMatch,
    sameAddress,
    settled,
  };
}

describe('the editor route across a same address navigation', () => {
  it('runs the loader again with the router’s defaults, and a refusal replaces the match', async () => {
    const t = build({});
    await t.router.load();
    expect(t.runs()).toBe(1);
    await t.sameAddress();
    expect(t.runs()).toBe(2);
    t.fail(true);
    await t.sameAddress();
    expect(t.runs()).toBe(3);
    expect(await t.settled('error')).toBe('error');
    expect((t.editMatch()?.error as Error).message).toBe(BLOB_429);
  });

  it('runs the loader once with shouldReload false, whatever the store answers later', async () => {
    const t = build({ shouldReload: false });
    await t.router.load();
    expect(t.runs()).toBe(1);
    await t.sameAddress();
    t.fail(true);
    await t.sameAddress();
    await t.router.navigate({
      to: '/edit/$deckId',
      params: { deckId: 'a' },
      search: { mode: 'grid' },
      replace: true,
    });
    await t.router.navigate({ to: '/edit/$deckId', params: { deckId: 'a' }, replace: true });
    expect(t.runs()).toBe(1);
    expect(await t.settled('success')).toBe('success');
  });

  it('still runs the loader on invalidate, the page’s Reload, and clears a refusal', async () => {
    const t = build({ shouldReload: false });
    await t.router.load();
    t.fail(true);
    await t.router.invalidate();
    expect(t.runs()).toBe(2);
    expect(await t.settled('error')).toBe('error');
    t.fail(false);
    await t.router.invalidate();
    expect(t.runs()).toBe(3);
    expect(await t.settled('success')).toBe('success');
  });

  it('enters another presentation with a fresh loader run', async () => {
    const t = build({ shouldReload: false });
    await t.router.load();
    await t.router.navigate({ to: '/edit/$deckId', params: { deckId: 'b' } });
    expect(t.runs()).toBe(2);
    expect(t.editMatch()?.params).toEqual({ deckId: 'b' });
  });
});
