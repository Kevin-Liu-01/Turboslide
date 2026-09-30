// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';

import { paintMutations } from '../clipboard';
import { Editor } from '../Editor';
import type { EditorHandle } from '../Editor';

// Paint format on the title placeholder (docs/POLISH.md 2.3 item 18; the polish round fix round
// 3, B5's R19; the walk row `text.tail.heading-takes-list-indent`): the cover's heading is a field
// object with no block, so the brush reads its drawn typography from the stage; the handle's
// `subscribePaint` tells the toolbar's Paint format button as the brush arms and disarms, so the
// button reads pressed; the look lands on a text block as one block.set of its typography.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const cover: Slide = {
  schemaVersion: 1,
  id: 'cover',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'Quarterly review',
  lead: '',
};

const agenda: Block = {
  id: 'agenda',
  type: 'text',
  text: 'Agenda',
  pos: { x: 200, y: 200, w: 480, h: 120, z: 1 },
};

const content: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: { main: [agenda] },
};

function documentOf(...slides: Slide[]): DeckDocument {
  return {
    deck: {
      schemaVersion: 1,
      id: 'paint',
      title: 'Paint',
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: slides.map((slide) => slide.id) }],
      assets: {},
      revision: 1,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
    slides: Object.fromEntries(slides.map((slide) => [slide.id, slide])),
  };
}

type Mounted = { root: Root; container: HTMLElement; handle: () => EditorHandle };

/** The stage mounted on one slide with a controlled selection; no write lands (the brush arms without one). */
function mount(doc: DeckDocument, props: Partial<Parameters<typeof Editor>[0]> = {}): Mounted {
  const container = document.createElement('div');
  document.body.append(container);
  let latestHandle: EditorHandle | null = null;
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(Editor, {
        document: doc,
        slideId: 'cover',
        theme: 'light',
        assetBase: '/decks/paint/',
        stageSize: { width: 1600, height: 900 },
        index: 0,
        total: 1,
        narrow: false,
        dispatch: () => undefined,
        handle: (handle) => {
          latestHandle = handle;
        },
        ...props,
      }),
    );
  });
  return {
    root,
    container,
    handle: () => {
      if (!latestHandle) throw new Error('no handle');
      return latestHandle;
    },
  };
}

/** The look the sheet draws on the cover's heading, which jsdom's own computed style never carries. */
function drawHeadingAt(size: string, weight: string, align: string): void {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
    element instanceof HTMLElement && element.getAttribute('data-block') === 'heading'
      ? ({ fontSize: size, fontWeight: weight, textAlign: align } as CSSStyleDeclaration)
      : original(element, pseudo),
  );
}

let mounted: Mounted | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
  vi.restoreAllMocks();
});

describe('Paint format on the title placeholder (docs/POLISH.md 2.3 item 18)', () => {
  it('arms from the drawn typography of the selected heading and tells the subscriber as it arms and disarms', () => {
    drawHeadingAt('88px', '500', 'start');
    mounted = mount(documentOf(cover), { selection: { kind: 'block', blockId: 'heading' } });
    const { container, handle } = mounted;
    expect(container.querySelector('[data-block="heading"]')).not.toBeNull();
    const told: boolean[] = [];
    const off = handle().subscribePaint((armed) => told.push(armed));

    let armed = false;
    act(() => {
      armed = handle().armPaint();
    });
    expect(armed).toBe(true);
    expect(handle().paintArmed()).toBe(true);
    expect(told).toEqual([true]);

    act(() => handle().disarmPaint());
    expect(handle().paintArmed()).toBe(false);
    expect(told).toEqual([true, false]);

    /* the unsubscribe: a later arm tells the listener nothing */
    off();
    act(() => {
      handle().armPaint();
    });
    expect(handle().paintArmed()).toBe(true);
    expect(told).toEqual([true, false]);
  });

  it('refuses with nothing selected and tells the subscriber nothing', () => {
    drawHeadingAt('88px', '500', 'start');
    mounted = mount(documentOf(cover), { selection: null });
    const { handle } = mounted;
    const told: boolean[] = [];
    handle().subscribePaint((armed) => told.push(armed));
    let armed = true;
    act(() => {
      armed = handle().armPaint();
    });
    expect(armed).toBe(false);
    expect(handle().paintArmed()).toBe(false);
    expect(told).toEqual([]);
  });

  it('refuses when the heading draws nothing readable', () => {
    drawHeadingAt('', '', '');
    mounted = mount(documentOf(cover), { selection: { kind: 'block', blockId: 'heading' } });
    const { handle } = mounted;
    let armed = true;
    act(() => {
      armed = handle().armPaint();
    });
    expect(armed).toBe(false);
    expect(handle().paintArmed()).toBe(false);
  });

  it("lands the cover's look on a text block as one block.set of its typography", () => {
    const mutations = paintMutations(content, agenda, {
      typography: { size: 88, weight: 500, align: 'left' },
    });
    expect(mutations).toEqual([
      {
        op: 'block.set',
        slideId: 'free',
        blockId: 'agenda',
        path: '/typography',
        value: { size: 88, weight: 500, align: 'left' },
      },
    ]);
  });
});
