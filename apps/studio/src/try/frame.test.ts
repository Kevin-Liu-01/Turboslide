import { describe, expect, it, vi } from 'vitest';

import { tryBlocker } from './frame';

// The /try page's blocker (TryPage's useBlocker): a navigation away from /try loads a new document,
// in the window around the frame or in a /try that stands alone, so the tab backend never reaches
// another editor; and no unload of /try asks for the browser's leave prompt, since the hero has
// nothing to save (docs/SITE.md D3, D10).

type ShouldBlockArgs = Parameters<ReturnType<typeof tryBlocker>['shouldBlockFn']>[0];

/** The blocker's argument for a navigation to `pathname` with `search`. */
function toward(pathname: string, search: Record<string, string> = {}): ShouldBlockArgs {
  return { next: { pathname, search } } as unknown as ShouldBlockArgs;
}

const ORIGIN = 'https://www.turboslide.com';

type Parent = { location: { origin: string; assign: (path: string) => void } };

/** A /try window framed by `parent`, or standing alone when `parent` is null. */
function tryWindow(parent: Parent | null): Window {
  const win: { location: { origin: string }; parent?: unknown } = { location: { origin: ORIGIN } };
  win.parent = parent ?? win;
  return win as unknown as Window;
}

describe('tryBlocker', () => {
  it('asks for no leave prompt on an unload of /try', () => {
    expect(tryBlocker(tryWindow(null)).enableBeforeUnload).toBe(false);
  });

  it('loads a navigation away from /try in the window around the frame', async () => {
    const assign = vi.fn();
    const blocker = tryBlocker(tryWindow({ location: { origin: ORIGIN, assign } }));
    expect(await blocker.shouldBlockFn(toward('/docs', { a: '1' }))).toBe(true);
    expect(assign).toHaveBeenCalledWith('/docs?a=1');
    expect(await blocker.shouldBlockFn(toward('/try'))).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('loads a navigation away from a /try that stands alone as a new document', async () => {
    const assign = vi.fn();
    const win = tryWindow(null) as unknown as { location: { assign: (path: string) => void } };
    win.location.assign = assign;
    const blocker = tryBlocker(win as unknown as Window);
    expect(await blocker.shouldBlockFn(toward('/edit/fixture'))).toBe(true);
    expect(assign).toHaveBeenCalledWith('/edit/fixture');
  });
});
