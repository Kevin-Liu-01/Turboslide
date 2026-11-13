// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViewerSlide } from '@turboslide/viewer/model';
import { Stage } from '@turboslide/viewer/Stage';

// The stage's slide change (the slide motion round). The slide a move leaves stays under the
// arriving one, at full opacity, until the arrival's own animations end; it went on a 120 ms timer
// with a 120 ms fade, so the paper showed through the middle of every move and a 400 ms transition
// lost the slide under it a third of the way in. A move during an entrance cuts; a move into a
// full-picture slide keeps the stage in its picture state and moves the pictures in phases.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function slide(id: string, kind = 'content'): ViewerSlide {
  return {
    id,
    n: 1,
    title: id,
    kind,
    sectionId: 'one',
    html: `<section class="slide" data-slide="${id}"></section>`,
    ...(kind === 'opener'
      ? { picture: { light: `/${id}-light.jpg`, dark: `/${id}-dark.jpg` } }
      : {}),
  };
}

/* the browser's animations, stood in for: each body entering runs one, which ends on demand */
type Fake = { finish: () => void };
let running: Map<Element, Fake> = new Map();

function fakeAnimations(): void {
  running = new Map();
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value(this: HTMLElement) {
      if (!this.classList.contains('pt-slide') || this.classList.contains('is-leaving')) return [];
      if (this.dataset.enter === 'cut') return [];
      let fake = running.get(this);
      let resolve: () => void = () => undefined;
      const finished = new Promise<void>((done) => {
        resolve = done;
      });
      if (fake === undefined) {
        fake = { finish: () => resolve() };
        running.set(this, fake);
        (this as unknown as { __finished: Promise<void> }).__finished = finished;
      }
      return [
        {
          playState: 'running',
          pending: false,
          finished: (this as unknown as { __finished: Promise<void> }).__finished,
          effect: { getComputedTiming: () => ({ endTime: 180 }) },
        },
      ];
    },
  });
}

let root: Root | null = null;
let container: HTMLElement | null = null;

async function show(current: ViewerSlide): Promise<void> {
  await act(async () => {
    root?.render(
      createElement(Stage, {
        slide: current,
        index: 0,
        total: 3,
        stageSize: { width: 1600, height: 900 },
        mode: 'slide',
        present: true,
        narrow: false,
        theme: 'light',
        dir: 'next',
      }),
    );
  });
}

function bodies(): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>('.ts-stage > .pt-slide') ?? [])];
}

async function finish(id: string): Promise<void> {
  const body = bodies().find((el) => el.dataset.slideId === id);
  await act(async () => {
    if (body) running.get(body)?.finish();
    await Promise.resolve();
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fakeAnimations();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  delete (HTMLElement.prototype as { getAnimations?: unknown }).getAnimations;
});

describe('the stage on a move', () => {
  it('holds the slide it left under the arriving one until the arrival has entered', async () => {
    await show(slide('a'));
    await show(slide('b'));
    const [leaving, arriving] = bodies();
    expect(leaving?.classList.contains('is-leaving')).toBe(true);
    expect(leaving?.dataset.out).toBeUndefined();
    expect(arriving?.dataset.slideId).toBe('b');
    /* the arrival's length reaches the layers that move with it */
    expect(
      container?.querySelector<HTMLElement>('.ts-stagewrap')?.style.getPropertyValue('--ts-change'),
    ).toBe('180ms');
    await finish('b');
    expect(bodies().map((el) => el.dataset.slideId)).toEqual(['b']);
  });

  it('cuts a move that comes while the slide before it is still entering', async () => {
    await show(slide('a'));
    await show(slide('b'));
    await show(slide('c'));
    expect(bodies().map((el) => el.dataset.slideId)).toEqual(['c']);
    expect(bodies()[0]?.dataset.enter).toBe('cut');
  });

  it('keeps the picture state while an opener leaves, and lets its picture go late', async () => {
    await show(slide('p', 'opener'));
    await show(slide('b'));
    const wrap = container?.querySelector('.ts-stagewrap');
    expect(wrap?.classList.contains('is-picture')).toBe(true);
    const leavingPicture = container?.querySelector<HTMLElement>('.backdrop > img');
    expect(leavingPicture?.getAttribute('src')).toBe('/p-light.jpg');
    expect(leavingPicture?.dataset.out).toBe('late');
    await finish('b');
    expect(wrap?.classList.contains('is-picture')).toBe(false);
    expect(container?.querySelector('.backdrop > img')).toBeNull();
  });

  it('brings an opener in over a content slide in two halves', async () => {
    await show(slide('a'));
    await show(slide('p', 'opener'));
    expect(bodies()[0]?.dataset.out).toBe('late');
    expect(container?.querySelector<HTMLElement>('.backdrop > img')?.dataset.in).toBe('early');
    await finish('p');
    expect(container?.querySelector<HTMLElement>('.backdrop > img')?.getAttribute('src')).toBe(
      '/p-light.jpg',
    );
  });

  it('takes the slide it left away at once when the arrival runs nothing', async () => {
    delete (HTMLElement.prototype as { getAnimations?: unknown }).getAnimations;
    await show(slide('a'));
    await show(slide('b'));
    expect(bodies().map((el) => el.dataset.slideId)).toEqual(['b']);
  });
});

describe('the stage between moves', () => {
  it("decodes the next slides' pictures once the slide shown has settled", async () => {
    vi.useFakeTimers();
    const decoded: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = 'auto';
        src = '';
        decode(): Promise<void> {
          decoded.push(this.src);
          return Promise.resolve();
        }
      },
    );
    try {
      const next = {
        ...slide('b'),
        html: '<section class="slide"><img src="/next.jpg"></section>',
      };
      await act(async () => {
        root?.render(
          createElement(Stage, {
            slide: slide('a'),
            index: 0,
            total: 2,
            stageSize: { width: 1600, height: 900 },
            mode: 'slide',
            present: true,
            narrow: false,
            theme: 'light',
            dir: 'next',
            ahead: [next],
          }),
        );
      });
      expect(decoded).toEqual([]);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(decoded).toEqual(['/next.jpg']);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

vi.mock('@turboslide/viewer/present/ShaderLayer', () => ({ ShaderLayer: () => null }));
