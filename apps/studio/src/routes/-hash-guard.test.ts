// The hash guard of the pinned /new page (build-4/hotfix-2.md cause A4): a slide hash written
// against the pinned /edit/<id> address reaches the router as a move on /new, so the router never
// matches the edit route and never remounts the editor, and the address bar keeps /edit/<id>.
import { describe, expect, it } from 'vitest';

import { installHashGuard, pinnedPath } from './-hash-guard';
import type { HistoryLike } from './-hash-guard';

type Call = { via: 'wrapper' | 'native'; url: string | null; state: unknown };

function harness(): {
  history: HistoryLike;
  calls: Call[];
  wrapper: History['replaceState'];
  native: History['replaceState'];
} {
  const calls: Call[] = [];
  const native: History['replaceState'] = function (state, _unused, url) {
    calls.push({
      via: 'native',
      url: url === undefined || url === null ? null : String(url),
      state,
    });
  };
  const wrapper: History['replaceState'] = function (state, _unused, url) {
    calls.push({
      via: 'wrapper',
      url: url === undefined || url === null ? null : String(url),
      state,
    });
  };
  const history: HistoryLike = { replaceState: wrapper, state: { key: 'k1' } };
  return { history, calls, wrapper, native };
}

describe('installHashGuard', () => {
  it('turns a slide hash write on the pinned path into a move on /new for the router and pins the address again', () => {
    const h = harness();
    const remove = installHashGuard(h.history, 'untitled-20260914-abcd', {
      wrapper: h.wrapper,
      native: h.native,
    });
    h.history.replaceState(null, '', `${pinnedPath('untitled-20260914-abcd')}?mode=grid#s/title`);
    expect(h.calls).toEqual([
      { via: 'wrapper', url: '/new?mode=grid#s/title', state: null },
      {
        via: 'native',
        url: '/edit/untitled-20260914-abcd?mode=grid#s/title',
        state: { key: 'k1' },
      },
    ]);
    remove();
    expect(h.history.replaceState).toBe(h.wrapper);
  });

  it('passes every other call to the router’s wrapper unchanged', () => {
    const h = harness();
    installHashGuard(h.history, 'untitled-20260914-abcd', { wrapper: h.wrapper, native: h.native });
    h.history.replaceState({ key: 'k2' }, '', '/new?edit=0#s/title');
    h.history.replaceState({ key: 'k3' }, '', '/edit/other-deck#s/title');
    h.history.replaceState({ key: 'k4' }, '');
    expect(h.calls.map((call) => call.via)).toEqual(['wrapper', 'wrapper', 'wrapper']);
    expect(h.calls.map((call) => call.url)).toEqual([
      '/new?edit=0#s/title',
      '/edit/other-deck#s/title',
      null,
    ]);
  });

  it('leaves a replacement someone else installed later in place when removed', () => {
    const h = harness();
    const remove = installHashGuard(h.history, 'untitled-20260914-abcd', {
      wrapper: h.wrapper,
      native: h.native,
    });
    const later: History['replaceState'] = () => undefined;
    h.history.replaceState = later;
    remove();
    expect(h.history.replaceState).toBe(later);
  });
});
