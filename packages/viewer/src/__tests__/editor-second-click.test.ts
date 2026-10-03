// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';

import { Editor } from '../Editor';

// The second click on a selected text object (docs/gslides-parity/focus/AMENDMENTS.md A2; Kevin,
// 2026-10-02: "for textboxes, clicking it shouldnt go stragiht itno typing but once i click
// again, i should be able to write"): the stage mounted on a canvas slide with one text box, the
// pointer and mouse events of a click dispatched as the browser sends them (pointerdown, then the
// mousedown carrying the click count, then the pointerup on the window). The first click selects,
// a later click opens the session at its release without a write, the second press of a double
// click leaves the entry to the double click, and a press that moves past the threshold opens
// nothing.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const agenda: Block = {
  id: 'agenda',
  type: 'text',
  text: 'Agenda for the review',
  pos: { x: 200, y: 200, w: 480, h: 120, z: 1 },
};

const canvas: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: { main: [agenda] },
};

const doc: DeckDocument = {
  deck: {
    schemaVersion: 1,
    id: 'second-click',
    title: 'Second click',
    theme: 'gt-ink-paper',
    sections: [{ id: 'one', name: 'One', slideIds: ['free'] }],
    assets: {},
    revision: 1,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  },
  slides: { free: canvas },
};

type Mounted = { root: Root; container: HTMLElement; dispatch: ReturnType<typeof vi.fn> };

function mount(): Mounted {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const dispatch = vi.fn(() => undefined);
  act(() => {
    root.render(
      createElement(Editor, {
        document: doc,
        slideId: 'free',
        theme: 'light',
        assetBase: '/decks/second-click/',
        stageSize: { width: 1600, height: 900 },
        index: 0,
        total: 1,
        narrow: false,
        dispatch,
      }),
    );
  });
  return { root, container, dispatch };
}

const run = (m: Mounted) => {
  const el = m.container.querySelector<HTMLElement>('[data-run="agenda/text"]');
  if (!el) throw new Error('no run agenda/text on the stage');
  return el;
};
const editing = (m: Mounted) => m.container.querySelector('[data-editing]') !== null;

/** One press and release as the browser sends them; `travel` moves the pointer before the release. */
function click(target: HTMLElement, detail: number, travel = 0): void {
  const at = { clientX: 300, clientY: 240 };
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, ...at }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail, ...at }));
  });
  if (travel > 0)
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: at.clientX + travel, clientY: at.clientY }),
      );
    });
  act(() => {
    target.dispatchEvent(
      new MouseEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: at.clientX + travel,
        clientY: at.clientY,
      }),
    );
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, detail, ...at }));
  });
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

describe('the second click on a selected text box (AMENDMENTS.md A2)', () => {
  it('selects on the first click and opens the text on a later click, writing nothing', () => {
    mounted = mount();
    const m = mounted;
    click(run(m), 1);
    expect(m.container.querySelector('[data-block="agenda"]')).not.toBeNull();
    expect(editing(m)).toBe(false);
    click(run(m), 1);
    /* the stage's session state (its data-editing); jsdom measures no box, so the InlineText
       editable itself is the e2e's and the walk's to read */
    expect(editing(m)).toBe(true);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it('leaves the second press of a double click to the double click entry', () => {
    mounted = mount();
    const m = mounted;
    click(run(m), 1);
    /* the mousedown of the press counts two: the release opens nothing, the dblclick does */
    click(run(m), 2);
    expect(editing(m)).toBe(false);
    act(() => {
      run(m).dispatchEvent(
        new MouseEvent('dblclick', {
          bubbles: true,
          button: 0,
          detail: 2,
          clientX: 300,
          clientY: 240,
        }),
      );
    });
    expect(editing(m)).toBe(true);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it('keeps a double click on the selected box the entry: the second press starts no word selection', () => {
    mounted = mount();
    const m = mounted;
    click(run(m), 1);
    /* the first press of the double click is the second click on the selected box: it opens */
    click(run(m), 1);
    expect(editing(m)).toBe(true);
    /* its second press counts two inside the open run: the browser's word selection is prevented */
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      clientX: 300,
      clientY: 240,
    });
    act(() => {
      run(m).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      run(m).dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    /* a later double click inside the session is the browser's again */
    const later = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    });
    act(() => {
      run(m).dispatchEvent(later);
    });
    expect(later.defaultPrevented).toBe(false);
    expect(editing(m)).toBe(true);
  });

  it('opens nothing when the press on the selected box travels past the move threshold', () => {
    mounted = mount();
    const m = mounted;
    click(run(m), 1);
    click(run(m), 1, 24);
    expect(editing(m)).toBe(false);
  });
});
