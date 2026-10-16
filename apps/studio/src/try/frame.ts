import type { UseBlockerOpts } from '@tanstack/react-router';

/**
 * The frame's side of the protocol of components/site/try-frame.ts (docs/SITE.md C.11): which
 * window frames /try, and where a navigation away from /try goes.
 */
export { TRY_READY, isTryPress, isTryVisible } from '../components/site/try-frame';
export type { TryPressed } from '../components/site/try-frame';

/** The window above a framed /try, or null when it stands alone or the parent is another origin. */
export function framingWindow(win: Window): Window | null {
  if (win.parent === win) return null;
  try {
    return win.parent.location.origin === win.location.origin ? win.parent : null;
  } catch {
    return null;
  }
}

/** The window a navigation away from /try goes to: the page around the frame, else this one. */
export function topWindow(win: Window): Window {
  return framingWindow(win) ?? win;
}

/**
 * The /try page's blocker (TryPage's useBlocker): a navigation of the router away from /try loads
 * a new document, in the window around the frame or, on a /try that stands alone, in this one. The
 * tab backend is bound for the document (editor/backend.ts), so a navigation in place would carry
 * it into the editor of /edit or /new. `enableBeforeUnload` is off: the router's default asks for
 * the browser's leave prompt on every unload of the document (a reload, a load of another page
 * around the frame, a closed tab) whatever the editor holds, and the hero has nothing to save
 * (docs/SITE.md D3).
 */
export function tryBlocker(win: Window): UseBlockerOpts {
  return {
    shouldBlockFn: ({ next }) => {
      if (next.pathname === '/try') return false;
      const query = new URLSearchParams(next.search as Record<string, string>).toString();
      topWindow(win).location.assign(`${next.pathname}${query === '' ? '' : `?${query}`}`);
      return true;
    },
    enableBeforeUnload: false,
  };
}
