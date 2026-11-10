// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViewerSlide } from '@turboslide/viewer/model';

import { Slideshow } from './Slideshow';

// The laser pointer (the presenter audit of a95d4097d, item 3). Its dot's place was the show's
// state, so every pointer move rendered the whole show, and with the slide list open every clone
// in the list; the list's outside press listener was armed again on each render because its
// close callback was new each time. The dot now moves by a style write in a frame callback.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const counts = vi.hoisted(() => ({
  toolbar: 0,
  clones: 0,
  onList: null as null | ((anchor: HTMLElement) => void),
}));

vi.mock('@turboslide/chrome/Layer', () => ({ useLayer: () => undefined }));
vi.mock('@turboslide/viewer/LiveClone', () => ({
  LiveClone: () => {
    counts.clones += 1;
    return null;
  },
}));
/* the toolbar renders once with every render of the show: its count is the show's */
vi.mock('@turboslide/viewer/present/PresentToolbar', () => ({
  PresentToolbar: (props: { onList: (anchor: HTMLElement) => void }) => {
    counts.toolbar += 1;
    counts.onList = props.onList;
    return null;
  },
}));

function slide(id: string, n: number): ViewerSlide {
  return {
    id,
    n,
    title: id,
    kind: 'content',
    sectionId: 'one',
    html: `<section class="slide" data-slide="${id}"></section>`,
  };
}

const SLIDES = ['s1', 's2', 's3', 's4'].map((id, at) => slide(id, at + 1));

let root: Root | null = null;
let container: HTMLElement | null = null;
let frames: Array<() => void> = [];
let rerender: () => void = () => undefined;

function mount(): void {
  function Host() {
    const [active, setActive] = useState('s1');
    const [, setTick] = useState(0);
    rerender = () => setTick((tick) => tick + 1);
    return createElement(Slideshow, {
      deckId: 'laser',
      slides: SLIDES,
      activeId: active,
      theme: 'light',
      onGoto: setActive,
      onExit: () => undefined,
      /* a new callback each render, as a caller may pass */
      say: () => undefined,
    });
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Host));
  });
}

function key(name: string): void {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  });
}

function move(x: number, y: number): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
  });
}

function frame(): void {
  const due = frames;
  frames = [];
  act(() => {
    for (const run of due) run();
  });
}

function dot(): HTMLElement | null {
  return container?.querySelector<HTMLElement>('[data-control="present.laserDot"]') ?? null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  counts.toolbar = 0;
  counts.clones = 0;
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => undefined;
  });
  /* jsdom lays nothing out: the list's option scrolls into view as a no-op */
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(async () => {
  act(() => root?.unmount());
  /* useMountEffect runs its cleanup on a timer after the unmount: let it remove the listeners */
  await new Promise((resolve) => setTimeout(resolve, 0));
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the laser pointer', () => {
  it('moves the dot by a style write once a frame, without rendering the show', () => {
    mount();
    move(40, 50);
    key('l');
    /* the dot appears where the pointer is */
    expect(dot()?.style.transform).toBe('translate(40px, 50px)');
    const renders = counts.toolbar;
    for (let x = 100; x < 400; x += 10) move(x, 300);
    expect(counts.toolbar - renders, 'thirty moves render nothing').toBe(0);
    expect(frames).toHaveLength(1);
    frame();
    expect(dot()?.style.transform).toBe('translate(390px, 300px)');
    move(600.4, 400.6);
    frame();
    expect(dot()?.style.transform).toBe('translate(600px, 401px)');
    expect(counts.toolbar - renders).toBe(0);
    /* off, a move schedules nothing */
    key('l');
    expect(dot()).toBeNull();
    move(10, 10);
    expect(frames).toHaveLength(0);
  });

  it('leaves the slide list and its clones alone while the pointer moves', async () => {
    mount();
    key('l');
    const listens = vi.spyOn(document, 'addEventListener');
    act(() => counts.onList?.(document.body));
    expect(container?.querySelector('[data-control="present.list"]')).not.toBeNull();
    /* the outside press listener arms after the opening click has bubbled */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const armed = () => listens.mock.calls.filter(([type]) => type === 'pointerdown').length;
    expect(armed()).toBe(1);

    const clones = counts.clones;
    for (let x = 100; x < 400; x += 10) move(x, 300);
    frame();
    expect(counts.clones - clones, 'no clone renders on a pointer move').toBe(0);

    /* a render of the show for another reason keeps the list's listener as it is */
    act(() => rerender());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(armed()).toBe(1);
  });
});
