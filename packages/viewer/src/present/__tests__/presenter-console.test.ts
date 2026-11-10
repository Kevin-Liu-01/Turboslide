// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViewerSlide } from '../../model';
import { PresenterConsole } from '../PresenterConsole';

// The presenter console's timer ticks every 250 ms for the length of a talk. Its readout, Pause and
// Reset live in a leaf that owns the clock, so a tick re-renders the leaf and never the console
// root with its three live clones, the notes and the slide list (the Glyphfield port, PLAN.md wave
// 1 item 5). Each root render draws three LiveClones here (current, previous and next), so the
// mocked LiveClone's call count is the root's render count times three.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const cloneRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../LiveClone', () => ({
  LiveClone: () => {
    cloneRenders.count += 1;
    return null;
  },
}));

function slide(n: number): ViewerSlide {
  return {
    id: `s${n}`,
    n,
    title: `Slide ${n}`,
    kind: 'content',
    sectionId: 'one',
    html: `<section class="slide" data-slide="s${n}"></section>`,
    notes: `Notes for slide ${n}`,
  };
}

const SLIDES = [slide(1), slide(2), slide(3)];

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PresenterConsole, {
        title: 'Quarterly review',
        slides: SLIDES,
        index: 1,
        theme: 'light',
        connected: true,
        platform: 'mac',
        onGoto: () => undefined,
      }),
    );
  });
  return container;
}

function elapsed(host: HTMLElement): string {
  return host.querySelector('[data-control="presenter.elapsed"]')?.textContent ?? '';
}

function press(host: HTMLElement, control: string): void {
  const button = host.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);
  if (!button) throw new Error(`no ${control}`);
  act(() => button.click());
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ now: new Date('2026-10-14T09:00:00Z') });
  cloneRenders.count = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe('the presenter console timer', () => {
  it('renders the console root once across ten ticks while the readout counts', () => {
    const host = mount();
    expect(cloneRenders.count).toBe(3);
    expect(elapsed(host)).toBe('0:00');

    for (let tick = 0; tick < 10; tick += 1) {
      act(() => {
        vi.advanceTimersByTime(250);
      });
    }

    expect(elapsed(host)).toBe('0:02');
    expect(cloneRenders.count).toBe(3);
  });

  it('pauses, resumes and resets inside the leaf without rendering the root', () => {
    const host = mount();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(elapsed(host)).toBe('0:03');

    press(host, 'presenter.pause');
    const pause = host.querySelector('[data-control="presenter.pause"]');
    expect(pause?.getAttribute('aria-pressed')).toBe('true');
    expect(pause?.textContent).toBe('Resume');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(elapsed(host)).toBe('0:03');

    press(host, 'presenter.pause');
    expect(pause?.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(elapsed(host)).toBe('0:05');

    press(host, 'presenter.reset');
    expect(elapsed(host)).toBe('0:00');
    expect(cloneRenders.count).toBe(3);
  });
});

// A held arrow in the console (the presenter audit of a95d4097d, item 2): one press is one move
// at once, the repeats move at most once a frame, and letting the key go drops the repeat not
// yet run, so the presenter never moves past where the key was let go.
describe('a held arrow in the console', () => {
  let frames: Array<() => void> = [];
  const frame = () => {
    const due = frames;
    frames = [];
    act(() => {
      for (const run of due) run();
    });
  };
  const key = (type: 'keydown' | 'keyup', name: string, repeat = false) =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent(type, { key: name, repeat, bubbles: true }));
    });

  function mountWith(onGoto: (index: number, step?: number | 'end') => void): void {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        createElement(PresenterConsole, {
          title: 'Quarterly review',
          slides: SLIDES,
          index: 0,
          theme: 'light',
          connected: true,
          platform: 'mac',
          onGoto,
        }),
      );
    });
  }

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = () => undefined;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves once for a press and once a frame for the repeats while the key is held', () => {
    const moves: number[] = [];
    mountWith((index) => moves.push(index));
    key('keydown', 'ArrowRight');
    expect(moves).toEqual([1]);
    /* four repeats queued behind a slow move: one more move, on the next frame */
    for (let i = 0; i < 4; i += 1) key('keydown', 'ArrowRight', true);
    expect(moves).toEqual([1]);
    frame();
    expect(moves).toEqual([1, 1]);
    key('keyup', 'ArrowRight');
  });

  it('drops the repeat not yet run when the key is let go', () => {
    const moves: number[] = [];
    mountWith((index) => moves.push(index));
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight', true);
    key('keydown', 'ArrowRight', true);
    key('keyup', 'ArrowRight');
    frame();
    expect(moves).toEqual([1]);
    /* the next press is a move at once again */
    key('keydown', 'ArrowRight');
    expect(moves).toEqual([1, 1]);
  });
});
