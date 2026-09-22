// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide } from '@turboslide/schema/deck';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';
import { CHART_CELL_EVENT } from '@turboslide/viewer/Editor';
import { handlesFor } from '@turboslide/viewer/Gestures';
import type { MeasuredBoxes } from '@turboslide/viewer/Gestures';

import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { FRAME_EDGE_PX, handleDoc, handleTitle, Overlay } from '../Overlay';

/* the collaboration layer reads the viewer shell and the room; the button and the event under
   test read the editor shell's openPanel alone */
vi.mock('../CollabLayer', () => ({ CollabLayer: () => null }));
import { TIP_ID, hideTooltip } from '../Tooltip';

// The overlay in edit mode (SPEC 6.4) on a freeform slide: the rings of a multi-selection, the
// eight resize squares, the guides, the marquee, the target slot of a drag and the frame edges
// that drag a positioned block (gslides-parity SPEC 10.2), every control with the chrome's
// tooltip (Tooltip.tsx, never a native title) that names it, what it does and its key; Cmd Up or
// Cmd Down on a move chip (Ctrl on Windows) changes the order through onHandleOrder instead of
// nudging, Shift for the ends (gslides-parity SPEC 10.1), and Alt with an arrow is retired (SPEC
// 10.2). The
// arrange bar of the editor depth round is gone (SPEC 4.3: the Arrange menu and the right-click
// menu carry align, distribute and order).

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
    body: null,
    hover: null,
    selection: { kind: 'block', blockId: 'a' },
    selectionBox: boxes.blocks['a'] ?? null,
    chip: 'Text',
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
    paint: false,
    /* round two (gslides-parity SPEC-2 section 6) */
    selectionPos: null,
    groupTag: null,
    groupMembers: [],
    rotation: null,
    sizeReadout: null,
    widthReadout: null,
    /* the features round (docs/FEATURES.md 2.1, 2.2 rank 7) */
    tableFrame: false,
    editData: null,
    valueReadout: null,
    rulers: null,
    deckGuides: null,
    draggingGuide: null,
    crop: null,
    sites: [],
    drawPoints: [],
    onHandleDown: vi.fn(),
    onHandleNudge: vi.fn(),
    onHandleOrder: vi.fn(),
    onGuideDown: vi.fn(),
    onGuideContextMenu: vi.fn(),
    onRulerDown: vi.fn(),
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
    expect(chipTip.doc).toMatch(/Drag the frame or the chip anywhere/);
    /* Shift nudges 10 px since gslides-parity SPEC-2 0.87 */
    expect(chipTip.doc).toMatch(/Arrows nudge 1 px, Shift 10 px/);
    /* the chip names the block in Google's words, never its id (SPEC 13.7) */
    expect(chip.textContent).toBe('Text');
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

  it('changes the order with Cmd or Ctrl and Up or Down on a move chip, Shift for the ends, and nudges with the plain arrows', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    const chip = container.querySelector<HTMLButtonElement>('.ts-select-chip');
    if (!chip) throw new Error('no chip');
    fireEvent.keyDown(chip, { key: 'ArrowUp', metaKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowDown', metaKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowUp', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowDown', ctrlKey: true, shiftKey: true });
    const order = (view.onHandleOrder as ReturnType<typeof vi.fn>).mock.calls;
    expect(order.map((call) => call[1])).toEqual(['forward', 'backward', 'front', 'back']);
    expect(view.onHandleNudge).not.toHaveBeenCalled();
    // the tooltip names the keys, never the retired Alt chord (SPEC 10.2)
    expect(chip.getAttribute('data-tip')).toBe('a: Move');
    // Cmd with a sideways arrow, Cmd with Alt, Alt with an arrow (retired), or Cmd Up on a
    // resize square, is nothing
    fireEvent.keyDown(chip, { key: 'ArrowLeft', metaKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowUp', metaKey: true, altKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowDown', altKey: true });
    const se = container.querySelector<HTMLButtonElement>('[data-control="handle.a.resize.se"]');
    if (!se) throw new Error('no se square');
    fireEvent.keyDown(se, { key: 'ArrowUp', metaKey: true });
    expect(view.onHandleOrder).toHaveBeenCalledTimes(4);
    expect(view.onHandleNudge).not.toHaveBeenCalled();
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    expect(view.onHandleNudge).toHaveBeenCalledWith(expect.anything(), 1, 'y');
  });

  it('nudges an object by ten with Shift and by one otherwise, on both axes (SPEC-2 0.87)', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    const chip = container.querySelector<HTMLButtonElement>('.ts-select-chip');
    if (!chip) throw new Error('no chip');
    fireEvent.keyDown(chip, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    const calls = (view.onHandleNudge as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((call) => [call[1], call[2]])).toEqual([
      [10, 'x'],
      [1, 'y'],
    ]);
  });

  it('draws the rotation ring as a slider above the top centre, stepping a degree and fifteen with Shift (SPEC-2 6.1 row 11)', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    const ring = container.querySelector<HTMLButtonElement>('[data-control="handle.a.rotate"]');
    if (!ring) throw new Error('no rotation ring');
    expect(ring.getAttribute('role')).toBe('slider');
    expect(ring.getAttribute('aria-valuenow')).toBe('0');
    expect(ring.dataset['shape']).toBe('ring');
    /* the box a is 200..500 by 200..300 at k 0.5: the ring sits 24 px above the top centre */
    expect(ring.style.left).toBe('175px');
    expect(ring.style.top).toBe(`${100 - 24}px`);
    fireEvent.keyDown(ring, { key: 'ArrowRight' });
    fireEvent.keyDown(ring, { key: 'ArrowLeft', shiftKey: true });
    const calls = (view.onHandleNudge as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((call) => call[1])).toEqual([1, -15]);
    expect(tipShown(ring).doc).toMatch(/Shift snaps to 15 degrees/);
  });

  it('turns the ring and the handles with a rotated object and shows the angle and size readouts', () => {
    const turned = viewOf({
      selectionPos: { x: 200, y: 200, w: 300, h: 100, z: 0, rotate: 37 },
      rotation: 37,
    });
    const { container } = render(<Overlay view={turned} />);
    const layer = container.querySelector<HTMLElement>('.ts-turn');
    if (!layer) throw new Error('no turning layer');
    expect(layer.style.transform).toBe('rotate(37deg)');
    expect(layer.querySelectorAll('.ts-handle[data-kind="free-resize"]')).toHaveLength(8);
    expect(container.querySelector('.ts-readout')?.textContent).toBe('37°');
    cleanup();
    const sized = render(<Overlay view={viewOf({ sizeReadout: { w: 480, h: 64 } })} />);
    expect(sized.container.querySelector('.ts-readout')?.textContent).toBe('480 × 64');
  });

  it('names a group with role="group" and the chip "Group", and a multi selection "3 objects"', () => {
    const grouped = viewOf({
      extraBoxes: [boxes.blocks['b'] ?? [0, 0, 0, 0]],
      groupBox: [200, 200, 600, 100],
      groupTag: 'pair',
      groupMembers: ['Text', 'Text'],
      count: 2,
    });
    const { container } = render(<Overlay view={grouped} />);
    const ring = container.querySelector('.ts-group[role="group"]');
    expect(ring?.getAttribute('aria-label')).toBe('Group: Text, Text');
    expect(container.querySelector('.ts-select-chip')?.textContent).toBe('Group');
    cleanup();
    const three = render(
      <Overlay view={viewOf({ groupBox: [200, 200, 600, 100], count: 3, extraBoxes: [] })} />,
    );
    expect(three.container.querySelector('.ts-select-chip')?.textContent).toBe('3 objects');
  });

  it('draws crop mode: the dimmed picture, the frame, the black handles and the chip sentence', () => {
    const cropping = viewOf({
      crop: {
        blockId: 'a',
        frame: [200, 200, 300, 100],
        full: [100, 200, 500, 100],
        trim: { left: 0.2, right: 0.2, top: 0, bottom: 0 },
      },
      handles: handlesFor(
        slide,
        boxes,
        { kind: 'block', blockId: 'a' },
        { crop: { frame: [200, 200, 300, 100] } },
      ),
    });
    const { container } = render(<Overlay view={cropping} />);
    expect(container.querySelector<HTMLElement>('.ts-crop-full')?.style.width).toBe('250px');
    expect(container.querySelector('.ts-crop-frame')).not.toBeNull();
    expect(container.querySelectorAll('.ts-handle[data-kind="crop-edge"]')).toHaveLength(8);
    expect(container.querySelector('.ts-select-chip.is-crop')?.textContent).toBe(
      'Drag the handles to crop. Press Enter to finish',
    );
    /* no rotation ring and no frame edges in crop mode */
    expect(container.querySelector('[data-kind="free-rotate"]')).toBeNull();
    expect(container.querySelector('.ts-frame-edge')).toBeNull();
  });

  it('draws the connection sites, the deck guides and the rulers when the view carries them', () => {
    const view = viewOf({
      sites: [{ x: 600, y: 200 }],
      deckGuides: { x: [800], y: [450] },
      rulers: { on: true, pointer: { x: 400, y: 300 }, selection: [200, 200, 300, 100] },
    });
    const { container } = render(<Overlay view={view} />);
    expect(container.querySelectorAll('.ts-site')).toHaveLength(1);
    expect(container.querySelectorAll('.ts-deck-guide')).toHaveLength(2);
    expect(container.querySelectorAll('.ts-ruler')).toHaveLength(2);
    const guide = container.querySelector<HTMLElement>('[data-control="guide.x.800"]');
    if (!guide) throw new Error('no guide');
    fireEvent.pointerDown(guide, { button: 0 });
    expect(view.onGuideDown).toHaveBeenCalledWith('x', 800, expect.anything());
    fireEvent.contextMenu(guide);
    expect(view.onGuideContextMenu).toHaveBeenCalledWith('x', 800, expect.anything());
    const ruler = container.querySelector<HTMLElement>('[data-control="ruler.x"]');
    if (!ruler) throw new Error('no ruler');
    fireEvent.pointerDown(ruler, { button: 0 });
    expect(view.onRulerDown).toHaveBeenCalledWith('x', expect.anything());
  });

  it('draws four frame edges around a positioned block that start its move gesture, and no arrange bar', () => {
    const view = viewOf();
    const { container } = render(<Overlay view={view} />);
    expect(container.querySelector('.ts-arrange')).toBeNull();
    const edges = container.querySelectorAll<HTMLElement>('.ts-frame-edge');
    expect(edges).toHaveLength(4);
    const sides = [...edges].map((edge) => edge.dataset['side']).sort();
    expect(sides).toEqual(['e', 'n', 's', 'w']);
    /* the north edge is centred on the ring's top: 200 * 0.5 minus half the strip */
    const north = [...edges].find((edge) => edge.dataset['side'] === 'n');
    expect(north?.style.top).toBe(`${100 - FRAME_EDGE_PX / 2}px`);
    expect(north?.style.left).toBe(`${100 - FRAME_EDGE_PX / 2}px`);
    expect(north?.style.width).toBe(`${150 + FRAME_EDGE_PX}px`);
    fireEvent.pointerDown(north!, { button: 0 });
    expect(view.onHandleDown).toHaveBeenCalledTimes(1);
    expect((view.onHandleDown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      kind: 'free-move',
    });
    /* while a run is edited the frame edges leave with the chip */
    cleanup();
    const editing = render(<Overlay view={viewOf({ editing: true })} />);
    expect(editing.container.querySelector('.ts-frame-edge')).toBeNull();
    /* a grammar slide's block-move chip has no frame edges: the body drag reorders */
    cleanup();
    const grammar = render(
      <Overlay
        view={viewOf({
          freeform: false,
          handles: [
            {
              id: 'block-move:a',
              kind: 'block-move',
              box: boxes.blocks['a'] ?? [0, 0, 0, 0],
              blockId: 'a',
              cursor: 'grab',
              label: 'a: Move',
              control: 'handle.a.move',
              shape: 'chip',
              axis: 'y',
              sign: 1,
            },
          ],
        })}
      />,
    );
    expect(grammar.container.querySelector('.ts-frame-edge')).toBeNull();
    expect(grammar.container.querySelector('.ts-select-chip')).not.toBeNull();
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
    /* the multi selection chip counts objects in Google's words (SPEC-2 6.1 row 2) */
    expect(container.querySelector('.ts-select-chip')?.textContent).toBe('2 objects');
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

describe('the table frame and the Edit data button (docs/FEATURES.md 2.1, 2.2 rank 7)', () => {
  it('keeps the chip and the frame edges as the move surface while a table cell is open', () => {
    render(<Overlay view={viewOf({ editing: true, tableFrame: true })} />);
    const chip = document.querySelector('.ts-select-chip') as HTMLElement;
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('data-control')).toBe('handle.a.move');
    expect(document.querySelectorAll('.ts-frame-edge')).toHaveLength(4);
    /* the ring still reads as editing */
    expect(document.querySelector('.ts-select.is-editing')).not.toBeNull();
  });

  it('draws a static chip and no frame edges while another run is being edited', () => {
    render(<Overlay view={viewOf({ editing: true })} />);
    expect(document.querySelector('.ts-select-chip')?.tagName).toBe('SPAN');
    expect(document.querySelectorAll('.ts-frame-edge')).toHaveLength(0);
  });

  it('draws the Edit data button under a selected chart inside the shell and opens Format options on Chart data', () => {
    const openPanel = vi.fn();
    const shell = { openPanel, settings: {}, input: {} } as unknown as EditorShellState;
    render(
      <EditorShellContext.Provider value={shell}>
        <Overlay view={viewOf({ editData: { blockId: 'a' }, chip: 'Chart' })} />
      </EditorShellContext.Provider>,
    );
    const button = document.querySelector('[data-control="bar.chart.editData"]') as HTMLElement;
    expect(button.textContent).toBe('Edit data');
    expect(button.hasAttribute('title')).toBe(false);
    expect(tipShown(button).name).toBe('Edit data');
    fireEvent.click(button);
    expect(openPanel).toHaveBeenCalledWith('formatOptions', { section: 'chart' });
    /* the button sits under the ring's bottom left */
    expect(button.style.left).toBe(`${200 * 0.5}px`);
    expect(Number.parseFloat(button.style.top)).toBeGreaterThan((200 + 100) * 0.5);
  });

  it('draws no Edit data button without a chart or outside the shell', () => {
    render(<Overlay view={viewOf()} />);
    expect(document.querySelector('[data-control="bar.chart.editData"]')).toBeNull();
    cleanup();
    render(<Overlay view={viewOf({ editData: { blockId: 'a' } })} />);
    expect(document.querySelector('[data-control="bar.chart.editData"]')).toBeNull();
  });

  it('shows a tapped chart mark’s value in the readout chip', () => {
    render(<Overlay view={viewOf({ valueReadout: 'Q2: 1,350' })} />);
    expect(document.querySelector('.ts-readout')?.textContent).toBe('Q2: 1,350');
  });

  it('opens Format options on Chart data when the stage asks for a chart cell with open set', () => {
    const openPanel = vi.fn();
    const shell = { openPanel, settings: {}, input: {} } as unknown as EditorShellState;
    render(
      <EditorShellContext.Provider value={shell}>
        <Overlay view={viewOf()} />
      </EditorShellContext.Provider>,
    );
    window.dispatchEvent(
      new CustomEvent(CHART_CELL_EVENT, {
        detail: { deckId: 'd', slideId: 'free', blockId: 'c', row: 1, column: 1, open: true },
      }),
    );
    expect(openPanel).toHaveBeenCalledWith('formatOptions', { section: 'chart' });
    /* a request for another slide, or one without open, opens nothing */
    openPanel.mockClear();
    window.dispatchEvent(
      new CustomEvent(CHART_CELL_EVENT, {
        detail: { deckId: 'd', slideId: 'other', blockId: 'c', row: 1, column: 1, open: true },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(CHART_CELL_EVENT, {
        detail: { deckId: 'd', slideId: 'free', blockId: 'c', row: 2, column: 1, open: false },
      }),
    );
    expect(openPanel).not.toHaveBeenCalled();
  });
});
