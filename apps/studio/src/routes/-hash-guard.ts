// The hash guard of the pinned /new page (gslides-parity build-4/hotfix-2.md cause A4). After the
// first save, routes/new.tsx pins the address bar to /edit/<id> through the browser's own
// `History.prototype.replaceState` while the router still stands on /new (SPEC-2 8.6: a route
// change would remount the editor and lose its history). The viewer shell writes the slide hash
// on every move with `window.history.replaceState` (viewer/hash.ts), which is the router's
// wrapper, and hands it the pinned pathname, so the router read a move to /edit/<id>#s/…,
// matched the edit route, ran its loader and mounted a second editor: a second controller, a
// second room client with a new client id, the first one stopped with its last flush dropped
// (three edits lost in the reproduction) and the tab's own first id drawn as a collaborator.
//
// The guard stands in for `window.history.replaceState` while the page is pinned. A call whose
// URL names the pinned pathname is split in two: the router's wrapper is told the same move on
// its own route (/new plus the search and the new hash, so `navigate({ hash: true })` keeps the
// slide and nothing remounts), then the browser's own method pins the address again. Every other
// call (the router's own flushes, which name /new) passes through. Pure over a History-like
// object and the router's wrapper, so the test runs in Node.

/** The two methods the guard reads and calls. */
export type HistoryLike = Pick<History, 'replaceState' | 'state'>;

/** The address of the saved deck as /new keeps it: the pinned path plus the search and hash. */
export function pinnedPath(deckId: string): string {
  return `/edit/${encodeURIComponent(deckId)}`;
}

/**
 * Installs the guard on `history` and answers its remover. `wrapper` is the router's
 * `replaceState` (the instance's own property before the guard), `native` the browser's
 * (`History.prototype.replaceState`), `routePath` the path the router stands on (`/new`).
 */
export function installHashGuard(
  history: HistoryLike,
  deckId: string,
  options: {
    wrapper: History['replaceState'];
    native: History['replaceState'];
    routePath?: string;
  },
): () => void {
  const pinned = pinnedPath(deckId);
  const routePath = options.routePath ?? '/new';
  const guard: History['replaceState'] = function guardedReplaceState(
    this: History,
    state: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const href = url === undefined || url === null ? null : String(url);
    if (
      href === null ||
      !(href === pinned || href.startsWith(`${pinned}?`) || href.startsWith(`${pinned}#`))
    ) {
      options.wrapper.call(history, state, unused, url);
      return;
    }
    // the router learns the search and the hash on its own route, then the address is pinned
    const rest = href.slice(pinned.length);
    options.wrapper.call(history, state, unused, `${routePath}${rest}`);
    options.native.call(history, history.state, unused, href);
  };
  history.replaceState = guard;
  return () => {
    if (history.replaceState === guard) history.replaceState = options.wrapper;
  };
}
