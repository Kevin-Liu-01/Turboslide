// Reduced motion from both of its sources (the GF-fix of wave 1, after the review's finding that
// four script checks and the stage's live shader read only the system setting): the system's
// `prefers-reduced-motion: reduce` and Tools > Preferences > Reduce motion, the root's
// `data-reduce-motion`. Node, with a fake root, media query list and mutation observer.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REDUCE_MOTION_ATTRIBUTE, motionReduced, onMotionReducedChange } from '../reduce-motion';

/** A page: the root's attributes, the system setting and the observers watching the root. */
function fakePage(options: { system?: boolean } = {}) {
  const attributes = new Set<string>();
  const mediaListeners = new Set<() => void>();
  const observers = new Set<{ callback: () => void; filter: string[] }>();
  const media = {
    matches: options.system === true,
    addEventListener: (_type: string, listener: () => void) => void mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      void mediaListeners.delete(listener),
  };
  const queries: string[] = [];
  vi.stubGlobal('window', {
    matchMedia: (query: string) => {
      queries.push(query);
      return media;
    },
  });
  vi.stubGlobal('document', {
    documentElement: { hasAttribute: (name: string) => attributes.has(name) },
  });
  vi.stubGlobal(
    'MutationObserver',
    class {
      entry: { callback: () => void; filter: string[] } | null = null;
      readonly callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
      }
      observe(_target: unknown, init: { attributeFilter: string[] }) {
        this.entry = { callback: this.callback, filter: init.attributeFilter };
        observers.add(this.entry);
      }
      disconnect() {
        if (this.entry !== null) observers.delete(this.entry);
      }
    },
  );
  return {
    queries,
    setSystem(on: boolean) {
      media.matches = on;
      for (const listener of mediaListeners) listener();
    },
    setAttribute(name: string, on: boolean) {
      if (on) attributes.add(name);
      else attributes.delete(name);
      for (const observer of observers) if (observer.filter.includes(name)) observer.callback();
    },
    watchers: () => mediaListeners.size + observers.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('motionReduced', () => {
  it('is false with neither source, and true for the system setting or the root attribute alone', () => {
    const page = fakePage();
    expect(motionReduced()).toBe(false);
    expect(page.queries).toContain('(prefers-reduced-motion: reduce)');
    page.setAttribute(REDUCE_MOTION_ATTRIBUTE, true);
    expect(motionReduced()).toBe(true);
    page.setAttribute(REDUCE_MOTION_ATTRIBUTE, false);
    page.setSystem(true);
    expect(motionReduced()).toBe(true);
  });

  it('names the attribute the chrome stamps and is false on a server', () => {
    expect(REDUCE_MOTION_ATTRIBUTE).toBe('data-reduce-motion');
    expect(motionReduced()).toBe(false);
  });

  it('is false where matchMedia throws and nothing is stamped', () => {
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('no media queries');
      },
    });
    vi.stubGlobal('document', { documentElement: { hasAttribute: () => false } });
    expect(motionReduced()).toBe(false);
  });
});

describe('onMotionReducedChange', () => {
  it('hears the system setting and the root attribute, ignores other attributes, and stops', () => {
    const page = fakePage();
    const listener = vi.fn(() => motionReduced());
    const stop = onMotionReducedChange(listener);
    page.setAttribute(REDUCE_MOTION_ATTRIBUTE, true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveLastReturnedWith(true);
    page.setAttribute('data-hide-tooltips', true);
    expect(listener).toHaveBeenCalledTimes(1);
    page.setAttribute(REDUCE_MOTION_ATTRIBUTE, false);
    page.setSystem(true);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveLastReturnedWith(true);
    stop();
    expect(page.watchers()).toBe(0);
    page.setSystem(false);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('subscribes to nothing on a server', () => {
    const stop = onMotionReducedChange(() => undefined);
    expect(stop).not.toThrow();
  });
});
