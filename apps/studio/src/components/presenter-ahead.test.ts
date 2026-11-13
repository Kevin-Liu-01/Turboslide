// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViewerSlide } from '@turboslide/viewer/model';
import { PresenterConsole } from '@turboslide/viewer/present/PresenterConsole';

// The presenter console's next move (the slide motion round): the current frame draws a slide's
// pictures at full size where the next slide preview drew their small copies, so after every move
// the full copies were fetched and decoded and appeared one by one in the current frame. Once a
// move has settled the console decodes the next slide's full size pictures.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

vi.mock('@turboslide/viewer/LiveClone', () => ({ LiveClone: () => null }));

const decoded = vi.hoisted(() => [] as string[]);

function slide(id: string): ViewerSlide {
  return {
    id,
    n: 1,
    title: id,
    kind: 'content',
    sectionId: 'one',
    html: `<section class="slide"><img src="/${id}.jpg" data-thumb="/${id}-w400.webp" data-thumb-w="400"></section>`,
  };
}

const SLIDES = ['a', 'b', 'c'].map(slide);

let root: Root | null = null;
let container: HTMLElement | null = null;

async function show(index: number): Promise<void> {
  await act(async () => {
    root?.render(
      createElement(PresenterConsole, {
        title: 'Ahead',
        slides: SLIDES,
        index,
        theme: 'light',
        connected: true,
        platform: 'mac',
        onGoto: () => undefined,
      }),
    );
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  decoded.length = 0;
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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the presenter console between moves', () => {
  it("decodes the next slide's full size pictures once a move has settled", async () => {
    await show(0);
    expect(decoded).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(decoded).toEqual(['/b.jpg']);
    await show(1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(decoded).toEqual(['/b.jpg', '/c.jpg']);
  });
});
