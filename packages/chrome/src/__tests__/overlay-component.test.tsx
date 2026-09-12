// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide } from '@turboslide/schema/deck';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';
import { handlesFor } from '@turboslide/viewer/Gestures';
import type { MeasuredBoxes } from '@turboslide/viewer/Gestures';

import { handleDoc, handleTitle, Overlay } from '../Overlay';
import { TIP_ID, hideTooltip } from '../Tooltip';

// The overlay in edit mode (SPEC 6.4) on a freeform slide (this round): the rings of a
// multi-selection, the eight resize squares, the guides, the marquee, the target slot of a drag
// and the arrange bar, every control with the chrome's tooltip (Tooltip.tsx, never a native
// title) that names it, what it does and its key; Alt with Up or Down on a move chip changes the
// order through onHandleOrder instead of nudging.

/** The tooltip plate a focused control shows: its name and its sentence. */
function tipShown(el: HTMLElement): { name: string; doc: string } {
  fireEvent.focus(el);
  const layer = document.getElementById(TIP_ID);
  return {
    name: layer?.querySelector('.pt-tip-name')?.textContent ?? '',
    doc: layer?.querySelector('.pt-tip-doc')?.textContent ?? '',
  };
}

function placed(id: string, pos: { x: number; y: number; w: number; h: number; z: number }): Block {
  return { id, type: 'paragraph', text: id, pos };
}

const slide: ContentSlide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      placed('a', { x: 200, y: 200, w: 300, h: 100, z: 0 }),
      placed('b', { x: 600, y: 240, w: 200, h: 60, z: 1 }),
    ],
  },
};

const boxes: MeasuredBoxes = {
  blocks: { a: [200, 200, 300, 100], b: [600, 240, 200, 60] },
  slots: { main: [137, 129, 1326, 642] },
  runs: {},
  parts: {},
};

function viewOf(over: Partial<EditorOverlayView> = {}): EditorOverlayView {
  return {
    slideId: 'free',
    k: 0.5,
    boxes,
    hover: null,
    selection: { kind: 'block', blockId: 'a' },
    selectionBox: boxes.blocks['a'] ?? null,
    chip: 'paragraph · a',
    handles: handlesFor(slide, boxes, { kind: 'block', blockId: 'a' }),
    activeHandle: null,
    drop: null,
    dropSlot: null,
    lint: [],
    editing: false,
    alt: false,
    clearance: null,
    freeform: true,
    extraBoxes: [],
    groupBox: null,
    count: 1,
    marquee: null,
    guides: [],
    arrange: {
      count: 1,
      canDistribute: false,
      align: vi.fn(),
      distribute: vi.fn(),
      zOrder: vi.fn(),
    },
    onHandleDown: vi.fn(),
    onHandleNudge: vi.fn(),
    onHandleOrder: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('Overlay on a freeform slide', () => {
  it('draws the ring, the move chip and the eight resize squares with tooltips and controls', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    expect(container.querySelector('.ts-select.is-selected')).not.toBeNull();
    const chip = container.querySelector<HTMLButtonElement>('.ts-select-chip');
    if (!chip) throw new Error('no chip');
    expect(chip.dataset['control']).toBe('handle.a.move');
    expect(chip.dataset['kind']).toBe('free-move');
    expect(chip.getAttribute('data-tip')).toBe('a: Move');
    const chipTip = tipShown(chip);
    expect(chipTip.name).toBe('a: Move');
    expect(chipTip.doc).toMatch(/Drag the chip or the block anywhere/);
    expect(chipTip.doc).toMatch(/Arrows nudge 1 px, Shift 8 px/);
    const squares = container.querySelectorAll<HTMLButtonElement>(
      '.ts-handle[data-kind="free-resize"]',
    );
    expect(squares).toHaveLength(8);
    const se = container.querySelector<HTMLButtonElement>('[data-control="handle.a.resize.se"]');
    if (!se) throw new Error('no se square');
    expect(se.style.cursor).toBe('nwse-resize');
    const seTip = tipShown(se);
    expect(seTip.doc).toMatch(/bottom right corner/);
    expect(seTip.doc).toMatch(/Shift keeps the aspect/);
    // the se square sits on the block's bottom right corner, at the stage scale
    expect(se.style.left).toBe('250px');
    expect(se.style.top).toBe('150px');
    // every control carries the tooltip primitive and no native title
    for (const button of container.querySelectorAll<HTMLButtonElement>('button')) {
      expect(button.getAttribute('data-tip')).toBeTruthy();
      expect(button.hasAttribute('title')).toBe(false);
      expect(button.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('changes the order with Alt and Up or Down on a move chip, and nudges with the plain arrows', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    const chip = container.querySelector<HTMLButtonElement>('.ts-select-chip');
    if (!chip) throw new Error('no chip');
    fireEvent.keyDown(chip, { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowDown', altKey: true });
    const order = (view.onHandleOrder as ReturnType<typeof vi.fn>).mock.calls;
    expect(order.map((call) => call[1])).toEqual(['forward', 'backward']);
    expect(view.onHandleNudge).not.toHaveBeenCalled();
    // Alt with a sideways arrow, or on a resize square, is nothing
    fireEvent.keyDown(chip, { key: 'ArrowLeft', altKey: true });
    const se = container.querySelector<HTMLButtonElement>('[data-control="handle.a.resize.se"]');
    if (!se) throw new Error('no se square');
    fireEvent.keyDown(se, { key: 'ArrowUp', altKey: true });
    expect(view.onHandleOrder).toHaveBeenCalledTimes(2);
    expect(view.onHandleNudge).not.toHaveBeenCalled();
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    expect(view.onHandleNudge).toHaveBeenCalledWith(expect.anything(), 1, 'y');
  });

  it('nudges a positioned block by eight with Shift and by one otherwise, on both axes', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    const chip = container.querySelector<HTMLButtonElement>('.ts-select-chip');
    if (!chip) throw new Error('no chip');
    fireEvent.keyDown(chip, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    const calls = (view.onHandleNudge as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((call) => [call[1], call[2]])).toEqual([
      [8, 'x'],
      [1, 'y'],
    ]);
  });

  it('shows the arrange bar with the two distribute buttons disabled under three blocks', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    const bar = container.querySelector('.ts-arrange');
    expect(bar).not.toBeNull();
    const buttons = container.querySelectorAll<HTMLButtonElement>('.ts-arrange button');
    expect(buttons).toHaveLength(10);
    expect(
      [...buttons].filter((button) => button.disabled).map((button) => button.dataset['control']),
    ).toEqual(['arrange.distribute.x', 'arrange.distribute.y']);
    const left = container.querySelector<HTMLButtonElement>('[data-control="arrange.align.left"]');
    if (!left) throw new Error('no align left');
    expect(left.getAttribute('data-tip')).toBe('Align left');
    expect(left.hasAttribute('title')).toBe(false);
    const leftTip = tipShown(left);
    expect(leftTip.name).toBe('Align left');
    expect(leftTip.doc).toMatch(/left edges meet the leftmost one/);
    fireEvent.click(left);
    expect(view.arrange?.align).toHaveBeenCalledWith('left');
    const forward = container.querySelector<HTMLButtonElement>(
      '[data-control="arrange.z.forward"]',
    );
    if (!forward) throw new Error('no bring forward');
    fireEvent.focus(forward);
    expect(document.getElementById(TIP_ID)?.querySelector('kbd')?.textContent).toMatch(
      /\] or Alt Up$/,
    );
    fireEvent.click(forward);
    expect(view.arrange?.zOrder).toHaveBeenCalledWith('forward');
    // the align glyphs are sprite symbols, not inlined paths
    const uses = [...bar!.querySelectorAll('svg use')].map((use) => use.getAttribute('href'));
    expect(uses.slice(0, 6)).toEqual([
      '#i-bars-3-bottom-left',
      '#i-bars-3-center-left',
      '#i-bars-3-bottom-right',
      '#i-bars-3-bottom-left',
      '#i-bars-3-center-left',
      '#i-bars-3-bottom-right',
    ]);
    expect(bar!.querySelector('svg path')).toBeNull();
    // under the ring: the ring's bottom is 300 * 0.5 plus the 6px gap
    expect((bar as HTMLElement).style.top).toBe('156px');
  });

  it('draws every ring of a multi-selection, the group box and a count in the chip', () => {
    const view = viewOf({
      extraBoxes: [boxes.blocks['b'] ?? [0, 0, 0, 0]],
      groupBox: [200, 200, 600, 100],
      count: 2,
      arrange: {
        count: 2,
        canDistribute: false,
        align: vi.fn(),
        distribute: vi.fn(),
        zOrder: vi.fn(),
      },
    });
    const { container } = render(<Overlay view={view} />);
    expect(container.querySelectorAll('.ts-select.is-selected')).toHaveLength(2);
    expect(container.querySelector('.ts-group')).not.toBeNull();
    expect(container.querySelector('.ts-select-chip')?.textContent).toBe(
      '2 blocks · paragraph · a',
    );
  });

  it('draws the guides, the marquee and the target slot of a drag, and hides the bar meanwhile', () => {
    const view = viewOf({
      guides: [
        { axis: 'x', at: 600, kind: 'edge', from: 200, to: 300 },
        { axis: 'y', at: 129, kind: 'content', from: 137, to: 1463 },
      ],
      marquee: [100, 100, 200, 50],
      dropSlot: [137, 129, 1326, 642],
      activeHandle: 'free-move:a',
    });
    const { container } = render(<Overlay view={view} />);
    const guides = container.querySelectorAll<HTMLElement>('.ts-guide');
    expect(guides).toHaveLength(2);
    expect(guides[0]?.style.left).toBe('300px');
    expect(guides[1]?.style.top).toBe('65px');
    expect(container.querySelector<HTMLElement>('.ts-marquee')?.style.width).toBe('100px');
    expect(container.querySelector('.ts-drop-slot')).not.toBeNull();
    expect(container.querySelector('.ts-arrange')).toBeNull();
  });

  it('names every handle kind in plain sentences without em dashes', () => {
    for (const handle of handlesFor(slide, boxes, { kind: 'block', blockId: 'a' })) {
      const title = handleTitle(handle);
      expect(title).toBe(`${handle.label}. ${handleDoc(handle)}`);
      expect(handleDoc(handle)).toMatch(/^[A-Z].*\.$/);
      expect(title).not.toMatch(/—/);
    }
  });
});
