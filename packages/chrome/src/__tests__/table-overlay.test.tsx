// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import { emptyTable } from '@turboslide/schema/blocks/table';
import type { ContentSlide, DeckDocument } from '@turboslide/schema/deck';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';
import type { Box, MeasuredBoxes } from '@turboslide/viewer/Gestures';

import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { forbiddenWordsIn } from '../menus/strings';
import {
  TableOverlay,
  cellOfPointer,
  cellRingBox,
  edgeAt,
  headMenuItems,
  headStyle,
  tableGridOf,
} from '../TableOverlay';
import { TIP_ID, hideTooltip } from '../Tooltip';

// The table's own controls in the overlay (docs/OBJECTS.md 3.3 items 1 and 4; the rows
// tables.cell.ring-on-cell, tables.heads.select-row-column, tables.heads.header-toggle,
// tables.edge.add-row-column): the grid areas read from the measured cells, the cell ring on the
// open cell's grid area, the head bands with their ids and tooltips, the head's click selecting
// the column or row through the editor's selectCells and its right click menu with the Header row
// check, and the "+" that follows the pointer along the right and the bottom edge and inserts in
// one commit that grows the box. The parked ids stay hidden while the switch is off.

/** A 3 by 3 table at 320,129 960 by 320 with 53 px cells at the top of 107 px rows (audit b02). */
const TABLE: Box = [320, 129, 960, 320];
const runs: Record<string, Box> = {};
for (let r = 0; r < 3; r += 1)
  for (let c = 0; c < 3; c += 1)
    runs[`t/rows/${r}/cells/${c}`] = [320 + c * 320, 129 + r * 107, 320, 53];

const boxes: MeasuredBoxes = {
  blocks: { t: TABLE },
  slots: { main: [137, 129, 1326, 642] },
  runs,
  parts: {},
};

function block(): TableBlock {
  return { ...emptyTable('t', 3, 3), pos: { x: 320, y: 129, w: 960, h: 320, z: 0 } } as TableBlock;
}

const slide: ContentSlide = {
  schemaVersion: 1,
  id: 's',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: { main: [block()] },
};

function viewOf(over: Partial<EditorOverlayView> = {}): EditorOverlayView {
  return {
    slideId: 's',
    k: 0.5,
    boxes,
    body: null,
    hover: null,
    selection: { kind: 'block', blockId: 't' },
    selectionBox: TABLE,
    chip: 'Table',
    handles: [],
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
    arrange: null,
    paint: false,
    selectionPos: null,
    groupTag: null,
    groupMembers: [],
    rotation: null,
    sizeReadout: null,
    widthReadout: null,
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
  } as EditorOverlayView;
}

function shellOf(over: {
  selectCells?: ReturnType<typeof vi.fn>;
  commit?: ReturnType<typeof vi.fn>;
  dispatch?: ReturnType<typeof vi.fn>;
  advanced?: boolean;
}): EditorShellState {
  const document = { slides: { s: slide } } as unknown as DeckDocument;
  const dispatch = over.dispatch ?? vi.fn(() => Promise.resolve({}));
  return {
    input: {
      document,
      slideId: 's',
      revision: 4,
      dispatch,
      ...(over.commit === undefined ? {} : { commit: over.commit }),
      editor: over.selectCells === undefined ? {} : { selectCells: over.selectCells },
    },
    /* the switch on unless a test says off: the committed set parks the handle.table.* families
       (parked-controls.ts), read by the family for every table since the integrator's seam of the
       objects round (build/b4.md, b5.md R7), so the heads and the "+" are hidden while it is off */
    settings: over.advanced === false ? {} : { advancedTools: true },
    menuContext: {
      platform: 'mac',
      focus: 'canvas',
      slide: { index: 0, count: 1, skipped: false, freeform: true, pictureLayout: false },
      selection: {
        blocks: 1,
        textBlock: false,
        listItem: false,
        tableCell: false,
        linked: false,
        order: { forward: false, backward: false, front: false, back: false },
      },
      clipboard: 'empty',
      history: { undo: false, redo: false },
      sections: 1,
      guides: 0,
      settings: {},
    },
    say: vi.fn(),
  } as unknown as EditorShellState;
}

function mount(view: EditorOverlayView, shell: EditorShellState | null = shellOf({})) {
  return render(
    shell === null ? (
      <TableOverlay view={view} tableBox={TABLE} blockId="t" />
    ) : (
      <EditorShellContext.Provider value={shell}>
        <TableOverlay view={view} tableBox={TABLE} blockId="t" />
      </EditorShellContext.Provider>
    ),
  );
}

const control = (id: string) => document.querySelector<HTMLElement>(`[data-control="${id}"]`);

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('the grid areas and the cell ring', () => {
  it('reads the rows and the columns of a table from its measured cells to the table’s edges', () => {
    const grid = tableGridOf('t', TABLE, runs);
    expect(grid.rows).toEqual([
      [320, 129, 960, 107],
      [320, 236, 960, 107],
      [320, 343, 960, 106],
    ]);
    expect(grid.columns).toEqual([
      [320, 129, 320, 320],
      [640, 129, 320, 320],
      [960, 129, 320, 320],
    ]);
    /* another block's runs and a block's other runs are not cells */
    expect(tableGridOf('u', TABLE, { ...runs, 'u/items/0/key': [0, 0, 1, 1] }).rows).toEqual([]);
    expect(cellOfPointer('rows/1/cells/2')).toEqual({ row: 1, column: 2 });
    expect(cellOfPointer('items/0/key')).toBeNull();
  });

  it('draws the open cell’s ring on its grid area: the cell’s width, the row’s full height', () => {
    const grid = tableGridOf('t', TABLE, runs);
    expect(cellRingBox(grid, runs['t/rows/1/cells/1']!, 1)).toEqual([640, 236, 320, 107]);
    mount(
      viewOf({
        selection: { kind: 'run', blockId: 't', pointer: 'rows/1/cells/1' },
        editing: true,
        tableFrame: true,
      }),
    );
    const ring = document.querySelector<HTMLElement>('.ts-cell-ring');
    expect(ring?.getAttribute('data-cell')).toBe('1,1');
    expect(ring?.style.left).toBe('320px');
    expect(ring?.style.top).toBe('118px');
    expect(ring?.style.width).toBe('160px');
    expect(ring?.style.height).toBe('53.5px');
  });

  it('draws no cell ring while a range is active: the view’s cellRing is the range’s box, not the cell’s', () => {
    mount(
      viewOf({
        selection: { kind: 'run', blockId: 't', pointer: 'rows/1/cells/1' },
        tableFrame: true,
        cellRing: [640, 236, 640, 213],
      } as Partial<EditorOverlayView>),
    );
    expect(document.querySelector('.ts-cell-ring')).toBeNull();
    cleanup();
    /* the same box as the cell's run: the cell ring draws */
    mount(
      viewOf({
        selection: { kind: 'run', blockId: 't', pointer: 'rows/1/cells/1' },
        tableFrame: true,
        cellRing: runs['t/rows/1/cells/1'],
      } as Partial<EditorOverlayView>),
    );
    expect(document.querySelector('.ts-cell-ring')).not.toBeNull();
  });

  it('draws no cell ring and no controls for a selected block that is no table', () => {
    const other: ContentSlide = {
      ...slide,
      slots: {
        main: [{ id: 'p', type: 'paragraph', text: 'p', pos: { x: 0, y: 0, w: 10, h: 10, z: 0 } }],
      },
    };
    const shell = shellOf({});
    (shell.input.document as unknown as { slides: Record<string, ContentSlide> }).slides.s = other;
    const { container } = render(
      <EditorShellContext.Provider value={shell}>
        <TableOverlay
          view={viewOf({ selection: { kind: 'block', blockId: 'p' } })}
          tableBox={TABLE}
          blockId="p"
        />
      </EditorShellContext.Provider>,
    );
    expect(container.querySelector('.ts-table-tools')).toBeNull();
  });
});

describe('the heads', () => {
  it('draws a band above every column and left of every row with the window API ids and a tooltip', () => {
    mount(viewOf());
    const heads = [...document.querySelectorAll<HTMLElement>('.ts-table-head')];
    expect(heads.map((head) => head.getAttribute('data-control'))).toEqual([
      'handle.t.head.column.0',
      'handle.t.head.column.1',
      'handle.t.head.column.2',
      'handle.t.head.row.0',
      'handle.t.head.row.1',
      'handle.t.head.row.2',
    ]);
    expect(headStyle('column', [640, 129, 320, 320], TABLE, 0.5)).toEqual({
      left: 320,
      top: 64.5 - 16,
      width: 160,
      height: 12,
    });
    expect(headStyle('row', [320, 236, 960, 107], TABLE, 0.5)).toEqual({
      left: 160 - 16,
      top: 118,
      width: 12,
      height: 53.5,
    });
    const head = control('handle.t.head.column.1')!;
    expect(head.tagName).toBe('BUTTON');
    expect(head.getAttribute('aria-label')).toBe('Column 2');
    expect(head.hasAttribute('title')).toBe(false);
    fireEvent.focus(head);
    expect(document.getElementById(TIP_ID)?.querySelector('.pt-tip-name')?.textContent).toBe(
      'Column 2',
    );
  });

  it('a click selects the whole column or row through the editor’s selectCells (build/b5.md R2)', () => {
    const selectCells = vi.fn();
    mount(viewOf(), shellOf({ selectCells }));
    fireEvent.click(control('handle.t.head.column.2')!);
    expect(selectCells).toHaveBeenLastCalledWith('t', { r0: 0, c0: 2, r1: 2, c1: 2 });
    fireEvent.click(control('handle.t.head.row.1')!);
    expect(selectCells).toHaveBeenLastCalledWith('t', { r0: 1, c0: 0, r1: 1, c1: 2 });
  });

  it('a right click on a row head lists Header row checked and the row commands; the click writes /rows once', () => {
    const dispatch = vi.fn(() => Promise.resolve({}));
    mount(viewOf(), shellOf({ dispatch }));
    fireEvent.contextMenu(control('handle.t.head.row.0')!, { clientX: 300, clientY: 200 });
    const rows = [
      ...document.querySelectorAll<HTMLElement>('.ts-table-head-menu [data-menu-item]'),
    ];
    expect(rows.map((row) => row.getAttribute('data-menu-item'))).toEqual([
      'format.table.headerRow',
      'format.table.insertRowAbove',
      'format.table.insertRowBelow',
      'format.table.deleteRow',
      'format.table.distributeRows',
    ]);
    const header = control('menu.format.table.headerRow')!;
    expect(header.getAttribute('role')).toBe('menuitemcheckbox');
    expect(header.getAttribute('aria-checked')).toBe('true');
    expect(rows.every((row) => row.getAttribute('aria-disabled') === null)).toBe(true);
    fireEvent.click(header);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, input] = dispatch.mock.calls[0] as unknown as [
      string,
      { path: string; value: TableBlock['rows'] },
    ];
    expect(action).toBe('block.set');
    expect(input.path).toBe('/rows');
    expect(input.value[0]?.header).toBeUndefined();
    expect(document.querySelector('.ts-table-head-menu')).toBeNull();
  });

  it('a column head’s menu inserts and deletes over the column’s own range', () => {
    const dispatch = vi.fn(() => Promise.resolve({}));
    mount(viewOf(), shellOf({ dispatch }));
    fireEvent.contextMenu(control('handle.t.head.column.1')!, { clientX: 300, clientY: 100 });
    expect(
      [...document.querySelectorAll<HTMLElement>('.ts-table-head-menu [data-menu-item]')].map(
        (row) => row.getAttribute('data-menu-item'),
      ),
    ).toEqual([
      'format.table.insertColumnLeft',
      'format.table.insertColumnRight',
      'format.table.deleteColumn',
      'format.table.distributeColumns',
    ]);
    fireEvent.click(control('menu.format.table.deleteColumn')!);
    expect(dispatch).toHaveBeenLastCalledWith('table.deleteColumns', {
      slideId: 's',
      blockId: 't',
      from: 1,
      baseRevision: 4,
    });
    const items = headMenuItems('row');
    expect(items[0]?.checked).toEqual({ setting: 'zoom' });
    for (const item of items) {
      expect(forbiddenWordsIn(item.label), item.id).toEqual([]);
      if (item.doc !== undefined) expect(forbiddenWordsIn(item.doc), item.id).toEqual([]);
    }
  });
});

describe('the "+" at the edges', () => {
  const ring = { left: 160, top: 64.5, width: 480, height: 160 };

  it('sits on the right edge at the pointer’s height within the band, on the bottom edge at its x, else nowhere', () => {
    expect(edgeAt(638, 120, ring)).toEqual({ axis: 'column', at: 120 });
    expect(edgeAt(650, 100, ring)).toEqual({ axis: 'column', at: 100 });
    expect(edgeAt(300, 226, ring)).toEqual({ axis: 'row', at: 300 });
    expect(edgeAt(300, 150, ring)).toBeNull();
    expect(edgeAt(700, 120, ring)).toBeNull();
  });

  it('keeps clear of the resize squares: the corners and the middle of an edge take the pointer (the integrator\u2019s walk, tables.resize.rows-share-extra)', () => {
    /* the ne and se corners of the right edge, its e square at the middle (144.5) */
    expect(edgeAt(650, 66, ring)).toBeNull();
    expect(edgeAt(640, 220, ring)).toBeNull();
    expect(edgeAt(638, 150, ring)).toBeNull();
    /* the sw and se corners of the bottom edge, its s square at the middle (400) */
    expect(edgeAt(170, 226, ring)).toBeNull();
    expect(edgeAt(632, 226, ring)).toBeNull();
    expect(edgeAt(408, 226, ring)).toBeNull();
    /* just past the reach the "+" is drawn again */
    expect(edgeAt(638, 80, ring)).toEqual({ axis: 'column', at: 80 });
    expect(edgeAt(420, 226, ring)).toEqual({ axis: 'row', at: 420 });
  });

  it('follows the pointer near the right edge and inserts a column in one commit that grows the box', async () => {
    const commit = vi.fn(() => Promise.resolve({}));
    const { container } = mount(viewOf(), shellOf({ commit }));
    const layer = container.querySelector<HTMLElement>('.ts-table-tools')!;
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 450 }) as DOMRect;
    expect(control('handle.t.add.column')).toBeNull();
    fireEvent.pointerMove(window, { clientX: 638, clientY: 120 });
    const add = control('handle.t.add.column')!;
    expect(add.getAttribute('aria-label')).toBe('Add a column');
    expect(add.style.left).toBe('640px');
    expect(add.style.top).toBe('120px');
    fireEvent.click(add);
    expect(commit).toHaveBeenCalledTimes(1);
    const [mutations, label] = commit.mock.calls[0] as unknown as [
      { op: string; path: string; value?: unknown }[],
      string,
    ];
    expect(label).toBe('Add a column');
    expect(mutations.map((mutation) => mutation.path)).toEqual(['/columns', '/rows', '/pos']);
    expect((mutations[2]?.value as { w: number }).w).toBe(1280);
    expect((mutations[0]?.value as { width: number }[]).map((column) => column.width)).toEqual([
      320, 320, 320, 320,
    ]);
    /* away from the edges the "+" goes */
    fireEvent.pointerMove(window, { clientX: 300, clientY: 150 });
    expect(control('handle.t.add.column')).toBeNull();
    /* the bottom edge adds a row */
    fireEvent.pointerMove(window, { clientX: 300, clientY: 226 });
    fireEvent.click(control('handle.t.add.row')!);
    const [rowMutations] = commit.mock.calls[1] as unknown as [{ path: string; value?: unknown }[]];
    expect(rowMutations.map((mutation) => mutation.path)).toEqual(['/rows', '/pos']);
    expect((rowMutations[1]?.value as { h: number }).h).toBe(320 + 106);
  });

  it('falls back to the insert plan without the shell’s commit', () => {
    const dispatch = vi.fn(() => Promise.resolve({}));
    const { container } = mount(viewOf(), shellOf({ dispatch }));
    const layer = container.querySelector<HTMLElement>('.ts-table-tools')!;
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 450 }) as DOMRect;
    fireEvent.pointerMove(window, { clientX: 638, clientY: 120 });
    fireEvent.click(control('handle.t.add.column')!);
    expect(dispatch).toHaveBeenLastCalledWith('table.insertColumns', {
      slideId: 's',
      blockId: 't',
      at: 2,
      count: 1,
      where: 'right',
      baseRevision: 4,
    });
  });
});

describe('the parked ids', () => {
  it('hides a parked control while the switch is off and draws it with the switch on (parked-controls.ts)', () => {
    /* the committed set names the `handle.table.*` families; the overlay reads them for every
       table (parkedFamily), a block named `table` and a block named otherwise alike */
    const named: ContentSlide = { ...slide, slots: { main: [{ ...block(), id: 'table' }] } };
    const shell = shellOf({ advanced: false });
    (shell.input.document as unknown as { slides: Record<string, ContentSlide> }).slides.s = named;
    const tableRuns: Record<string, Box> = {};
    for (const [key, box] of Object.entries(runs)) tableRuns[key.replace(/^t\//, 'table/')] = box;
    const view = viewOf({
      selection: { kind: 'block', blockId: 'table' },
      boxes: { ...boxes, blocks: { table: TABLE }, runs: tableRuns },
    });
    render(
      <EditorShellContext.Provider value={shell}>
        <TableOverlay view={view} tableBox={TABLE} blockId="table" />
      </EditorShellContext.Provider>,
    );
    expect(document.querySelectorAll('.ts-table-head')).toHaveLength(0);
    cleanup();
    const on = shellOf({ advanced: true });
    (on.input.document as unknown as { slides: Record<string, ContentSlide> }).slides.s = named;
    render(
      <EditorShellContext.Provider value={on}>
        <TableOverlay view={view} tableBox={TABLE} blockId="table" />
      </EditorShellContext.Provider>,
    );
    expect(document.querySelectorAll('.ts-table-head')).toHaveLength(6);
  });

  it('reads the family for a block named otherwise, so the committed set parks every table alike (build/b4.md)', () => {
    mount(viewOf(), shellOf({ advanced: false }));
    expect(document.querySelectorAll('.ts-table-head')).toHaveLength(0);
    expect(document.querySelector('.ts-table-add')).toBeNull();
    cleanup();
    mount(viewOf(), shellOf({}));
    expect(document.querySelectorAll('.ts-table-head')).toHaveLength(6);
  });
});
