// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditSearch } from '../routes/-edit-search';

// The /try page's blocker is registered once (TryPage.tsx): useBlocker registers again whenever
// its `shouldBlockFn` changes (its effect depends on it), so the options object TryPage passes
// must be the same object on every render. Before this test TryPage passed `tryBlocker(window)`,
// a new object each render, and the router's history took a new blocker on each render.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const seen = vi.hoisted(() => ({ blockers: [] as unknown[] }));

vi.mock('@tanstack/react-router', () => ({
  useBlocker: (options: unknown) => {
    seen.blockers.push(options);
  },
}));

/* the editor and the session are stand-ins: this test reads the blocker alone */
vi.mock('../editor/EditorRoot', () => ({ EditorRoot: () => null }));

vi.mock('./session', () => ({
  trySession: () => ({
    start: () => () => undefined,
    runner: { pause: () => undefined, resume: () => undefined, state: () => null },
    room: { entries: async () => [], versions: () => [] },
    visitor: { author: { kind: 'human', name: 'Cobalt 118', principalId: 'anon_test' } },
    press: () => undefined,
    guests: { active: () => [] },
    payload: {},
    attachVisitor: () => undefined,
  }),
}));

const { TryPage } = await import('./TryPage');

afterEach(() => {
  seen.blockers.length = 0;
  document.body.innerHTML = '';
});

describe('TryPage', () => {
  it('hands useBlocker the same options on every render', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (search: EditSearch) =>
      act(() => {
        root.render(createElement(TryPage, { search, still: true, onSearch: () => undefined }));
      });
    render({});
    render({ mode: 'grid' });
    render({});
    act(() => root.unmount());
    expect(seen.blockers.length).toBeGreaterThanOrEqual(3);
    const first = seen.blockers[0] as { shouldBlockFn: unknown; enableBeforeUnload: boolean };
    for (const options of seen.blockers) expect(options).toBe(first);
    expect(first.enableBeforeUnload).toBe(false);
  });
});
