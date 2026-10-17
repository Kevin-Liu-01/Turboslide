// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineText, TEXT_BURST_MS, flushHeldBursts, heldBursts } from '../InlineText';

// A text session holds the keys of the last TEXT_BURST_MS (100 ms) before its burst writes them
// (InlineText scheduleBurst). The page counts a held burst in its leave warning and writes it on
// `pagehide` and when the tab turns hidden (EditorRoot, through flushHeldBursts), so a reload or
// a closed tab inside the 100 ms after the last key drops nothing. Before, a leave in that window
// lost the held keys: the timer never fired and the room client persisted no operation for them.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type Mounted = {
  root: Root;
  run: HTMLElement;
  onBurst: ReturnType<typeof vi.fn>;
  onEnd: ReturnType<typeof vi.fn>;
};

const mounted: Mounted[] = [];

/** A session on one run of a slide, as the Editor mounts it. */
function mount(): Mounted {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const slide = document.createElement('section');
  slide.setAttribute('data-slide', 'one');
  const run = document.createElement('h1');
  run.setAttribute('data-run', 'title/text');
  run.textContent = 'Agenda';
  slide.append(run);
  const host = document.createElement('div');
  document.body.append(slide, host);
  const root = createRoot(host);
  const onBurst = vi.fn();
  const onEnd = vi.fn();
  act(() => {
    root.render(
      createElement(InlineText, {
        element: run,
        box: [0, 0, 400, 80],
        k: 1,
        onBurst,
        onEnd,
      }),
    );
  });
  const m = { root, run, onBurst, onEnd };
  mounted.push(m);
  return m;
}

/** A keystroke as the browser reports it: the text changes, then `input`. */
function type(run: HTMLElement, text: string): void {
  run.textContent = text;
  run.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  for (const m of mounted.splice(0)) act(() => m.root.unmount());
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('a held burst', () => {
  it('is counted from the keystroke until its timer writes it', () => {
    vi.useFakeTimers();
    const { run, onBurst } = mount();
    expect(heldBursts()).toBe(0);
    type(run, 'Agenda for');
    expect(heldBursts()).toBe(1);
    expect(onBurst).not.toHaveBeenCalled();
    /* a second key restarts the timer and stays one held burst */
    type(run, 'Agenda for Q4');
    expect(heldBursts()).toBe(1);
    vi.advanceTimersByTime(TEXT_BURST_MS);
    expect(onBurst).toHaveBeenCalledTimes(1);
    expect(onBurst).toHaveBeenLastCalledWith('Agenda for Q4');
    expect(heldBursts()).toBe(0);
  });

  it('is written at once by flushHeldBursts, and the timer then writes nothing more', () => {
    vi.useFakeTimers();
    const { run, onBurst } = mount();
    type(run, 'Agenda for Q4');
    flushHeldBursts();
    expect(onBurst).toHaveBeenCalledTimes(1);
    expect(onBurst).toHaveBeenLastCalledWith('Agenda for Q4');
    expect(heldBursts()).toBe(0);
    vi.advanceTimersByTime(TEXT_BURST_MS * 2);
    expect(onBurst).toHaveBeenCalledTimes(1);
    /* nothing held: a second flush writes nothing */
    flushHeldBursts();
    expect(onBurst).toHaveBeenCalledTimes(1);
  });

  it('leaves the count when the session ends, whose final write carries the keys', () => {
    vi.useFakeTimers();
    const { run, onBurst, onEnd } = mount();
    type(run, 'Agenda for Q4');
    expect(heldBursts()).toBe(1);
    act(() => {
      run.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onEnd).toHaveBeenCalledWith('Agenda for Q4', 'escape');
    expect(heldBursts()).toBe(0);
    flushHeldBursts();
    expect(onBurst).not.toHaveBeenCalled();
  });
});
