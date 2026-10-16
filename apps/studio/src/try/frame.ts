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
