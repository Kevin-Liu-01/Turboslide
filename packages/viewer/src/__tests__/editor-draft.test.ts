// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { emptyTable } from '@turboslide/schema/blocks/table';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';

import { Editor } from '../Editor';
import type { EditorHandle, EditorOverlayView } from '../Editor';
import { gestureClock } from '../gesture-frame';
import { drawDraftMutation } from '../Gestures';
import type { Handle } from '../Gestures';

// The draft path of a live gesture on the stage (docs/OBJECTS.md 2.4; the objects round, B1),
// with the stage mounted in jsdom over a fake animation frame: a burst of pointermoves inside one
// frame renders the sheet once with the last position; the preview of a move re-routes the
// connector attached to the moved shape at that frame, not at the release; Escape clears the
// draft; a shape drawn with the Insert > Shape tool is on the sheet from the press, at the
// default box, then grows with the pointer, and the release commits the same block under the
// same id; the record of the frames is published through the handle.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const rect = (id: string, x: number, y: number, z: number): Block => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  fill: 'plate',
  stroke: 'ink',
  text: '',
  pos: { x, y, w: 240, h: 160, z },
});

function documentOf(slide: Slide): DeckDocument {
  return {
    deck: {
      schemaVersion: 1,
      id: 'objects',
      title: 'Objects',
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: [slide.id] }],
      assets: {},
      revision: 1,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    },
    slides: { [slide.id]: slide },
  };
}

/** Two rectangles joined by an elbow connector from a's right site to b's left site. */
function joinedSlide(): Slide {
  const base: Slide = {
    schemaVersion: 1,
    id: 'free',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: [rect('a', 200, 200, 1), rect('b', 700, 200, 2)] },
  };
  const link = drawDraftMutation(
    base,
    { kind: 'line', line: 'elbow' },
    'link',
    [440, 280, 260, 1],
    {
      grid: false,
      dragged: true,
      start: { x: 441, y: 281 },
      end: { x: 699, y: 281 },
    },
  );
  if (!link) throw new Error('no link');
  const slide = applyMutations(documentOf(base), [link]).document.slides['free'];
  if (!slide) throw new Error('no slide');
  return slide;
}

/**
 * The layout jsdom does not do: the sheet body and the stage at 1600 by 900 from the origin, so
 * sheet px equal client px, and a positioned object's wrapper at its inline box (against the
 * content origin inside the content layer, the sheet origin on the sheet layer, slide.ts
 * renderFreeform), so `measureBoxes` reads the object boxes the handles need.
 */
function stubRects(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  const box = (left: number, top: number, width: number, height: number): DOMRect => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const el = this as HTMLElement;
    if (el.classList.contains('pt-slide') || el.querySelector(':scope > .pt-slide') !== null)
      return box(0, 0, 1600, 900);
    if (el.classList.contains('free')) {
      const onSheet = el.parentElement?.classList.contains('freeform-sheet') === true;
      const left = parseFloat(el.style.left) + (onSheet ? 0 : 137);
      const top = parseFloat(el.style.top) + (onSheet ? 0 : 129);
      return box(left, top, parseFloat(el.style.width), parseFloat(el.style.height));
    }
    return box(0, 0, 0, 0);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/** The frame record's clock advancing `stepMs` per read, so a frame's recorded cost is deterministic (gesture-frame.ts gestureClock). */
const realClock = gestureClock.now;
function fakeClock(stepMs: number): void {
  let clock = 0;
  gestureClock.now = () => {
    clock += stepMs;
    return clock;
  };
}

/** A fake animation frame: the callbacks queue until `flush` runs them. */
function fakeFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const handle = next;
    next += 1;
    queue.set(handle, callback);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    queue.delete(handle);
  });
  return {
    pending: () => queue.size,
    flush: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      act(() => {
        for (const callback of callbacks) callback(performance.now());
      });
    },
  };
}

type Mounted = {
  root: Root;
  container: HTMLElement;
  view: () => EditorOverlayView;
  handle: () => EditorHandle;
  calls: { id: string; input: Record<string, unknown> }[];
  doc: () => DeckDocument;
  rerender: (props: Partial<Parameters<typeof Editor>[0]>) => void;
};

/**
 * The stage mounted over the document with a controlled selection: the fake dispatch applies
 * the write through the reducer and re-renders, the way the page's store does; the stage box is
 * stubbed to the sheet's size so sheet px equal client px.
 */
function mount(initial: DeckDocument, props: Partial<Parameters<typeof Editor>[0]> = {}): Mounted {
  const container = document.createElement('div');
  document.body.append(container);
  let latestView: EditorOverlayView | null = null;
  let latestHandle: EditorHandle | null = null;
  let doc = initial;
  const calls: Mounted['calls'] = [];
  const root = createRoot(container);
  let extra = props;
  const render = () => {
    act(() => {
      root.render(
        createElement(Editor, {
          document: doc,
          slideId: 'free',
          theme: 'light',
          assetBase: '/decks/objects/',
          stageSize: { width: 1600, height: 900 },
          index: 0,
          total: 1,
          narrow: false,
          /* no snap, so a move lands where the pointer says and the numbers below are exact */
          snapGuides: false,
          snapGrid: false,
          dispatch: (id, input) => {
            calls.push({ id, input });
            const mutations =
              id === 'slide.update'
                ? (input['mutations'] as Mutation[])
                : id === 'block.set'
                  ? [
                      {
                        op: 'block.set',
                        slideId: input['slideId'] as string,
                        blockId: input['blockId'] as string,
                        path: input['path'] as string,
                        value: input['value'],
                      } satisfies Mutation,
                    ]
                  : id === 'block.insert'
                    ? [
                        {
                          op: 'block.insert',
                          slideId: input['slideId'] as string,
                          slot: input['slot'] as 'main',
                          ...(input['after'] !== undefined
                            ? { after: input['after'] as string }
                            : {}),
                          block: input['block'] as Block,
                        } satisfies Mutation,
                      ]
                    : [];
            doc = applyMutations(doc, mutations).document;
            queueMicrotask(render);
            return undefined;
          },
          overlay: (view) => {
            latestView = view;
            return null;
          },
          handle: (handle) => {
            latestHandle = handle;
          },
          ...extra,
        }),
      );
    });
  };
  render();
  return {
    root,
    container,
    view: () => {
      if (!latestView) throw new Error('no view');
      return latestView;
    },
    handle: () => {
      if (!latestHandle) throw new Error('no handle');
      return latestHandle;
    },
    calls,
    doc: () => doc,
    rerender: (next) => {
      extra = { ...extra, ...next };
      render();
    },
  };
}

const wrapperOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`.pt-slide .free[data-free="${id}"]`);

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });

const moveHandleOf = (view: EditorOverlayView, blockId: string): Handle => {
  const found = view.handles.find((h) => h.kind === 'free-move' && h.blockId === blockId);
  if (!found)
    throw new Error(`no move handle for ${blockId}: ${view.handles.map((h) => h.id).join(', ')}`);
  return found;
};

let mounted: Mounted | null = null;
let restoreRects: (() => void) | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restoreRects = stubRects();
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
  restoreRects?.();
  restoreRects = null;
  gestureClock.now = realClock;
  vi.unstubAllGlobals();
});

describe('the draft of a move (docs/OBJECTS.md 2.4)', () => {
  it('renders a pointermove burst inside one frame once, with the last position, and the connector follows', async () => {
    const frames = fakeFrames();
    /* jsdom renders slowly on a loaded machine; the budget's verdict is pinned by the fake clock */
    fakeClock(1);
    mounted = mount(documentOf(joinedSlide()), { selection: { kind: 'block', blockId: 'b' } });
    const { container, view, handle } = mounted;
    const before = wrapperOf(container, 'b');
    const linkBefore = wrapperOf(container, 'link');
    expect(before?.style.left).toBe('563px');
    expect(linkBefore?.style.width).toBe('260px');
    const chip = moveHandleOf(view(), 'b');
    act(() => view().onHandleDown(chip, pointer('pointerdown', 820, 280)));
    /* five moves inside one frame: nothing renders until the frame */
    for (let i = 1; i <= 5; i += 1)
      act(() => window.dispatchEvent(pointer('pointermove', 820 + i * 12, 280 + i * 4)));
    expect(frames.pending()).toBe(1);
    expect(wrapperOf(container, 'b')).toBe(before);
    frames.flush();
    /* one render: a fresh wrapper at the last position, 60 by 20 on */
    const after = wrapperOf(container, 'b');
    expect(after).not.toBe(before);
    expect(after?.style.left).toBe('623px');
    expect(after?.style.top).toBe('91px');
    expect(view().selectionPos).toEqual({ x: 760, y: 220, w: 240, h: 160, z: 2 });
    expect(view().selectionBox).toEqual([760, 220, 240, 160]);
    /* the connector attached to b re-routed in the same frame, not at the release */
    const linkAfter = wrapperOf(container, 'link');
    expect(linkAfter?.style.width).toBe('320px');
    expect(handle().gestureRecord()).toMatchObject({ frames: 1, skipped: 0, degraded: false });
    /* a second burst, a second render */
    for (let i = 6; i <= 8; i += 1)
      act(() => window.dispatchEvent(pointer('pointermove', 820 + i * 12, 280 + i * 4)));
    expect(frames.pending()).toBe(1);
    frames.flush();
    expect(wrapperOf(container, 'b')).not.toBe(after);
    expect(wrapperOf(container, 'b')?.style.left).toBe('659px');
    expect(handle().gestureRecord()?.frames).toBe(2);
    /* the release commits once: b's pos and the connector's follow in one write */
    act(() => window.dispatchEvent(pointer('pointerup', 916, 312)));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.calls).toHaveLength(1);
    const call = mounted.calls[0];
    expect(call?.id).toBe('slide.update');
    const written = (call?.input['mutations'] as Mutation[]).map(
      (m) => `${m.op} ${'blockId' in m ? m.blockId : ''} ${'path' in m ? m.path : ''}`,
    );
    expect(written).toContain('block.set b /pos');
    expect(written.some((w) => w.startsWith('block.set link'))).toBe(true);
    const report = handle().gestureRecord();
    expect(report).toMatchObject({ frames: 2, skipped: 0, degraded: false });
    /* nothing is pending after the release */
    expect(frames.pending()).toBe(0);
  });

  it('Escape clears the draft and the object returns to its committed box', () => {
    const frames = fakeFrames();
    mounted = mount(documentOf(joinedSlide()), { selection: { kind: 'block', blockId: 'b' } });
    const { container, view } = mounted;
    const chip = moveHandleOf(view(), 'b');
    act(() => view().onHandleDown(chip, pointer('pointerdown', 820, 280)));
    act(() => window.dispatchEvent(pointer('pointermove', 900, 300)));
    frames.flush();
    expect(wrapperOf(container, 'b')?.style.left).toBe('643px');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(wrapperOf(container, 'b')?.style.left).toBe('563px');
    expect(wrapperOf(container, 'link')?.style.width).toBe('260px');
    expect(mounted.calls).toHaveLength(0);
    /* a move after the cancel renders nothing */
    act(() => window.dispatchEvent(pointer('pointermove', 950, 300)));
    expect(frames.pending()).toBe(0);
  });
});

describe('the rotated ring (docs/OBJECTS.md 2.4; selection-box.ts)', () => {
  it('turns the ring with the object during the drag: the ring box stays the pos box and the angle follows the draft', () => {
    const frames = fakeFrames();
    mounted = mount(documentOf(joinedSlide()), { selection: { kind: 'block', blockId: 'b' } });
    const { container, view } = mounted;
    const ring = view().handles.find((h) => h.kind === 'free-rotate' && h.blockId === 'b');
    if (!ring) throw new Error('no rotate handle');
    const from = { x: ring.box[0] + ring.box[2] / 2, y: ring.box[1] + ring.box[3] / 2 };
    act(() => view().onHandleDown(ring, pointer('pointerdown', from.x, from.y)));
    /* the pointer swept 45 degrees clockwise about b's centre (820, 280) */
    act(() => window.dispatchEvent(pointer('pointermove', 820 + 100, 280 - 100)));
    frames.flush();
    expect(view().selectionPos).toMatchObject({ x: 700, y: 200, w: 240, h: 160, rotate: 45 });
    /* the ring is the object's own box, never the measured bounding box of the turned wrapper */
    expect(view().selectionBox).toEqual([700, 200, 240, 160]);
    expect(wrapperOf(container, 'b')?.getAttribute('data-rotate')).toBe('45');
    expect(view().rotation).toBe(45);
    /* the eight squares sit on the object's own box (the overlay turns them with the ring), never
       on the corners of the turned wrapper's bounding box */
    const nw = view().handles.find((h) => h.kind === 'free-resize' && h.dir === 'nw');
    const se = view().handles.find((h) => h.kind === 'free-resize' && h.dir === 'se');
    expect(nw && [nw.box[0] + nw.box[2] / 2, nw.box[1] + nw.box[3] / 2]).toEqual([700, 200]);
    expect(se && [se.box[0] + se.box[2] / 2, se.box[1] + se.box[3] / 2]).toEqual([940, 360]);
    act(() => window.dispatchEvent(pointer('pointerup', 920, 180)));
    expect(view().selectionBox).toEqual([700, 200, 240, 160]);
  });
});

describe('the budget (docs/OBJECTS.md 2.4; gesture-frame.ts)', () => {
  it('degrades a move after two slow frames: the wrappers move inline, the sheet keeps its markup, the ring follows', async () => {
    const frames = fakeFrames();
    /* every read of the clock advances 40 ms, so each rendered frame reads as over the budget */
    fakeClock(40);
    mounted = mount(documentOf(joinedSlide()), { selection: { kind: 'block', blockId: 'b' } });
    const { container, view, handle } = mounted;
    const chip = moveHandleOf(view(), 'b');
    act(() => view().onHandleDown(chip, pointer('pointerdown', 820, 280)));
    act(() => window.dispatchEvent(pointer('pointermove', 840, 290)));
    frames.flush();
    act(() => window.dispatchEvent(pointer('pointermove', 860, 300)));
    frames.flush();
    expect(handle().gestureRecord()).toMatchObject({ frames: 2, skipped: 0, degraded: true });
    const rendered = wrapperOf(container, 'b');
    expect(rendered?.style.left).toBe('603px');
    /* the third frame takes the wrapper path: the same wrapper element, placed inline, no render */
    act(() => window.dispatchEvent(pointer('pointermove', 880, 310)));
    frames.flush();
    expect(wrapperOf(container, 'b')).toBe(rendered);
    expect(rendered?.style.left).toBe('623px');
    expect(rendered?.style.top).toBe('101px');
    expect(handle().gestureRecord()).toMatchObject({ frames: 2, skipped: 1, degraded: true });
    /* the ring, the handles and the readout still follow the draft's pos */
    expect(view().selectionBox).toEqual([760, 230, 240, 160]);
    expect(view().boxes.blocks['b']).toEqual([760, 230, 240, 160]);
    /* the release commits the last position and the sheet renders it */
    act(() => window.dispatchEvent(pointer('pointerup', 880, 310)));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.calls).toHaveLength(1);
    expect(wrapperOf(container, 'b')).not.toBe(rendered);
    expect(wrapperOf(container, 'b')?.style.left).toBe('623px');
    expect(handle().gestureRecord()).toMatchObject({ frames: 2, skipped: 1, degraded: true });
  });
});

describe('the draft of a draw (docs/OBJECTS.md 2.4)', () => {
  it('draws the shape at the default box from the press, grows it with the pointer and commits the same block', async () => {
    const frames = fakeFrames();
    mounted = mount(documentOf(joinedSlide()), { tool: { kind: 'shape', shape: 'hexagon' } });
    const { container } = mounted;
    const sheet = container.querySelector<HTMLElement>('.pt-slide');
    if (!sheet) throw new Error('no sheet');
    expect(wrapperOf(container, 'shape')).toBeNull();
    /* the press: the hexagon at 240 by 160 from the press point, drawn on the next frame */
    act(() => sheet.dispatchEvent(pointer('pointerdown', 300, 500)));
    expect(frames.pending()).toBe(1);
    frames.flush();
    const pressed = wrapperOf(container, 'shape');
    expect(pressed).not.toBeNull();
    expect(pressed?.style.width).toBe('240px');
    expect(pressed?.style.height).toBe('160px');
    expect(pressed?.style.left).toBe('163px');
    expect(pressed?.style.top).toBe('371px');
    const path = pressed?.querySelector('path');
    expect(path?.getAttribute('d')).toMatch(/^M/);
    expect(pressed?.querySelector('[data-shape="hexagon"]')).not.toBeNull();
    /* the drag: the shape grows with the pointer, re-pathed at each frame */
    act(() => window.dispatchEvent(pointer('pointermove', 433, 583)));
    frames.flush();
    const step5 = wrapperOf(container, 'shape');
    expect(step5?.style.width).toBe('133px');
    expect(step5?.style.height).toBe('83px');
    expect(step5?.querySelector('path')?.getAttribute('d')).not.toBe(path?.getAttribute('d'));
    act(() => window.dispatchEvent(pointer('pointermove', 620, 700)));
    frames.flush();
    expect(wrapperOf(container, 'shape')?.style.width).toBe('320px');
    expect(wrapperOf(container, 'shape')?.style.height).toBe('200px');
    /* the release: one block.insert of the same block under the same id at the drawn box */
    act(() => window.dispatchEvent(pointer('pointerup', 620, 700)));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.calls).toHaveLength(1);
    const call = mounted.calls[0];
    expect(call?.id).toBe('block.insert');
    expect(call?.input['block']).toMatchObject({
      id: 'shape',
      type: 'shape',
      shape: 'hexagon',
      fill: 'plate',
      stroke: 'ink',
      pos: { x: 300, y: 500, w: 320, h: 200 },
    });
    const committed = mounted.doc().slides['free'];
    expect(committed?.kind === 'content' && committed.slots.main?.map((b) => b.id)).toEqual([
      'a',
      'b',
      'link',
      'shape',
    ]);
    expect(wrapperOf(container, 'shape')?.style.width).toBe('320px');
    /* the new shape is the selection after the release (pendingSelect on the markup the commit lands) */
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.view().selection).toEqual({ kind: 'block', blockId: 'shape' });
  });

  it('a text box previews as its frame alone: no text element before the release', () => {
    const frames = fakeFrames();
    mounted = mount(documentOf(joinedSlide()), { tool: { kind: 'text' } });
    const { container } = mounted;
    const sheet = container.querySelector<HTMLElement>('.pt-slide');
    if (!sheet) throw new Error('no sheet');
    act(() => sheet.dispatchEvent(pointer('pointerdown', 300, 500)));
    act(() => window.dispatchEvent(pointer('pointermove', 500, 600)));
    frames.flush();
    expect(wrapperOf(container, 'text')).toBeNull();
    expect(mounted.view().marquee).toEqual([300, 500, 200, 100]);
  });
});

describe('a column seam dragged with a cell open (docs/OBJECTS.md 3.3 item 5; build/b2.md request 1b)', () => {
  it('keeps the seam handles with the cell open, writes the widths and opens the cell again after the release', async () => {
    const frames = fakeFrames();
    fakeClock(1);
    const table: Block = {
      ...emptyTable('table', 3, 3),
      pos: { x: 320, y: 129, w: 960, h: 320, z: 1 },
    };
    const slide: Slide = {
      schemaVersion: 1,
      id: 'free',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: { main: [table] },
    };
    mounted = mount(documentOf(slide));
    const { container, view } = mounted;
    const cell = container.querySelector<HTMLElement>(
      '.pt-slide [data-run="table/rows/1/cells/1"]',
    );
    if (!cell) throw new Error('no cell');
    /* a double click on the cell opens its session (AMENDMENTS.md A1 rule 3) */
    act(() => {
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 800, clientY: 300 }));
    });
    expect(view().editing).toBe(true);
    expect(view().selection).toEqual({ kind: 'run', blockId: 'table', pointer: 'rows/1/cells/1' });
    /* the seam handles are drawn with the cell open */
    const seam = view().handles.find((h) => h.control === 'handle.table.column.0');
    expect(seam).toBeDefined();
    if (!seam) throw new Error('no seam');
    expect(view().handles.some((h) => h.control === 'handle.table.column.1')).toBe(true);
    const from = { x: seam.box[0] + seam.box[2] / 2, y: seam.box[1] + seam.box[3] / 2 };
    act(() => view().onHandleDown(seam, pointer('pointerdown', from.x, from.y)));
    /* the press ends the session with its write; the drag previews the widths */
    expect(view().editing).toBe(false);
    act(() => window.dispatchEvent(pointer('pointermove', from.x + 60, from.y)));
    frames.flush();
    expect(view().widthReadout).not.toBeNull();
    act(() => window.dispatchEvent(pointer('pointerup', from.x + 60, from.y)));
    await act(async () => {
      await Promise.resolve();
    });
    const written = mounted.calls.find(
      (c) => c.id === 'block.set' && c.input['path'] === '/columns',
    );
    expect(written).toBeDefined();
    /* the cell is open again on the markup the widths landed on, the caret at its end */
    expect(view().editing).toBe(true);
    expect(view().selection).toEqual({ kind: 'run', blockId: 'table', pointer: 'rows/1/cells/1' });
  });
});
