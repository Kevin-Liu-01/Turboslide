// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViewerSlide } from '@turboslide/viewer/model';

import { Slideshow } from './Slideshow';

// A held arrow in the show (the presenter audit of a95d4097d, item 2). Each keydown used to move
// at once, so the repeats of a held key queued behind slow renders and kept moving after the key
// was let go. One press is still one move at once; the repeats move at most once a frame and the
// release drops the one not yet run. A held key stops at the end plate and never leaves the show.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

vi.mock('@turboslide/chrome/Layer', () => ({ useLayer: () => undefined }));

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
let moves: string[] = [];
let exits = 0;

function mount(): void {
  moves = [];
  exits = 0;
  function Host() {
    const [active, setActive] = useState('s1');
    return createElement(Slideshow, {
      deckId: 'held',
      slides: SLIDES,
      activeId: active,
      theme: 'light',
      onGoto: (id: string) => {
        moves.push(id);
        setActive(id);
      },
      onExit: () => {
        exits += 1;
      },
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

function key(type: 'keydown' | 'keyup', name: string, repeat = false): void {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent(type, { key: name, repeat, bubbles: true }));
  });
}

function frame(): void {
  const due = frames;
  frames = [];
  act(() => {
    for (const run of due) run();
  });
}

function ended(): boolean {
  return container?.querySelector('[data-control="present.end"]') !== null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => undefined;
  });
});

afterEach(async () => {
  act(() => root?.unmount());
  /* useMountEffect runs its cleanup on a timer after the unmount: let it remove the listeners */
  await new Promise((resolve) => setTimeout(resolve, 0));
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe('a held arrow in the show', () => {
  it('moves once a press, and once a frame for the repeats while the key is held', () => {
    mount();
    key('keydown', 'ArrowRight');
    key('keyup', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(moves).toEqual(['s2', 's3']);
    for (let i = 0; i < 6; i += 1) key('keydown', 'ArrowRight', true);
    expect(moves).toEqual(['s2', 's3']);
    frame();
    expect(moves).toEqual(['s2', 's3', 's4']);
  });

  it('stops where the key is let go: a repeat not yet run is dropped', () => {
    mount();
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight', true);
    key('keydown', 'ArrowRight', true);
    key('keyup', 'ArrowRight');
    frame();
    expect(moves).toEqual(['s2']);
  });

  it('stops a held key at the end plate; a fresh press leaves the show', () => {
    mount();
    key('keydown', 'End');
    expect(moves).toEqual(['s4']);
    key('keydown', 'ArrowRight');
    expect(ended()).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      key('keydown', 'ArrowRight', true);
      frame();
    }
    expect(ended()).toBe(true);
    expect(exits).toBe(0);
    key('keyup', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(exits).toBe(1);
  });
});
