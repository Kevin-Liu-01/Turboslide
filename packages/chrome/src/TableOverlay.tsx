import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useContext, useEffect, useRef, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { Position } from '@turboslide/schema/position';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';
import type { Box } from '@turboslide/viewer/Gestures';

import { EditorShellContext } from './editor-shell-context';
import type { EditorShellState } from './editor-shell-context';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { findItem } from './menus/model';
import type { MenuItem } from './menus/model';
import { CANVAS } from './menus/strings';
import { isParked } from './parked-controls';
import {
  edgeInsert,
  headRange,
  isHeaderRow,
  tableCommandOfItem,
  tablePlan,
  tableWriteInput,
} from './table-tools';
import type { HeadAxis, TableCommandId, TablePlan } from './table-tools';
import { tipProps } from './Tooltip';

/**
 * The table's own controls in the overlay (docs/OBJECTS.md 3.3 items 1 and 4; docs/FEATURES.md
 * 2.3 items 1 and 2; Google resizes by its gridlines and selects rows and columns by their bands,
 * the "+" is Notion's and Pitch's): drawn from the measured cell boxes (`boxes.runs`, keyed
 * `<block>/rows/<r>/cells/<c>`) whenever one table is selected, a cell open or not.
 *
 * - The cell ring: a 1 px ink rule on the open cell's grid area (the column's width, the row's
 *   height) inside the table's ring, `.ts-cell-ring[data-cell="r,c"]`, so the caret's cell reads
 *   inside the table Kevin's screenshot missed (3.2).
 * - The heads: a 12 px band above every column (`handle.<block>.head.column.<c>`) and left of
 *   every row (`.head.row.<r>`); a click selects the whole column or row as a range through the
 *   editor's `selectCells` (build/b5.md R2), a right click opens the head's menu: on a row head
 *   the Header row check (`format.table.headerRow`, writing `rows[0].header`), Insert row above and
 *   below, Delete row and Distribute rows; on a column head the column rows. The menu's rows run
 *   the table plans over the head's own range, so they act before the range API lands.
 * - The "+" affordances: a 16 px circle with the sprite's plus, ink on paper, centred on the ring's
 *   right edge (`handle.<block>.add.column`) or bottom edge (`.add.row`) at the pointer while it is
 *   within EDGE_BAND_PX of that edge; one click inserts a column right of the last one (a row under
 *   the last) in one commit that also grows the table's box by the new column's width (the last
 *   row's height), so every other column keeps its width (the row `tables.edge.add-row-column`);
 *   without the shell's `commit` the click falls back to the `table.insertColumns` plan.
 *
 * Every control is a button with the chrome's tooltip and a `data-control` id in the shape of
 * model.ts's ids; a parked control (parked-controls.ts) is not drawn while Tools > Advanced tools
 * is off, read by the family the matrix declares (`handle.table.<part>`, the block type in place
 * of the block id, since the committed set names the family and a block's id is the seller's:
 * objects/build/b4.md, b5.md R7). Pointer downs stop at the control so the stage starts no
 * marquee under them; the right
 * click on a head is answered here (`preventDefault`), which the stage's own handler respects.
 */
export type TableOverlayProps = {
  view: EditorOverlayView;
  /** the selected table's measured box (the ring's box) */
  tableBox: Box;
  blockId: string;
};

/**
 * The height of a head band and the gap it keeps from the ring, in CSS pixels: the gap is the
 * half width of a frame edge strip (Overlay.tsx FRAME_EDGE_PX / 2), so a band never covers the
 * strip and a drag from the ring line still moves the table.
 */
export const HEAD_PX = 12;
export const HEAD_GAP = 4;
/** The pointer is within this many CSS pixels of the ring's right or bottom edge: the "+" shows. */
export const EDGE_BAND_PX = 12;
/** The "+" circle's diameter in CSS pixels. */
export const ADD_PX = 16;
/**
 * The reach of a resize square from its centre in CSS px, kept clear by the "+": the corner
 * squares at the ends of an edge and the middle square (s on the bottom edge, e on the right)
 * sit on the same edges, and the "+" (z-index 3, above the squares) took the press meant for
 * the se square, so no resize started (the integrator's walk on the merged tree, the row
 * tables.resize.rows-share-extra: no readout, the rows unchanged). Within this reach of a square
 * the "+" is not drawn and the square takes the pointer.
 */
export const SQUARE_CLEAR_PX = 14;

/** The grid areas of a table as measured: one box per row (the table's width) and per column (its height), in sheet px. */
export type TableGrid = { rows: Box[]; columns: Box[] };

/** The row and column of a cell's run pointer (`rows/<r>/cells/<c>`), or null for another run. */
export function cellOfPointer(pointer: string): { row: number; column: number } | null {
  const match = /^rows\/(\d+)\/cells\/(\d+)$/.exec(pointer);
  if (match === null) return null;
  return { row: Number(match[1]), column: Number(match[2]) };
}

/**
 * The grid areas of a table from its measured cells: row `r` spans from the top of its cells to
 * the top of the next row's (the last to the table's bottom), column `c` from the left of its
 * cells to the left of the next column's (the last to the table's right). A cell shorter than its
 * row (the content height at the row's top, sheet.css) still names the whole row this way.
 */
export function tableGridOf(
  blockId: string,
  tableBox: Box,
  runs: Readonly<Record<string, Box>>,
): TableGrid {
  const prefix = `${blockId}/`;
  const tops = new Map<number, number>();
  const lefts = new Map<number, number>();
  for (const [key, box] of Object.entries(runs)) {
    if (!key.startsWith(prefix)) continue;
    const cell = cellOfPointer(key.slice(prefix.length));
    if (cell === null) continue;
    tops.set(cell.row, Math.min(tops.get(cell.row) ?? Infinity, box[1]));
    lefts.set(cell.column, Math.min(lefts.get(cell.column) ?? Infinity, box[0]));
  }
  const [x, y, w, h] = tableBox;
  const rowTops = [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, top]) => top);
  const colLefts = [...lefts.entries()].sort((a, b) => a[0] - b[0]).map(([, left]) => left);
  const rows = rowTops.map((top, i): Box => {
    const next = rowTops[i + 1] ?? y + h;
    return [x, top, w, Math.max(0, next - top)];
  });
  const columns = colLefts.map((left, i): Box => {
    const next = colLefts[i + 1] ?? x + w;
    return [left, y, Math.max(0, next - left), h];
  });
  return { rows, columns };
}

/** The open cell's grid area: the cell's own width (a merged cell spans its columns), the row's height. */
export function cellRingBox(grid: TableGrid, cell: Box, row: number): Box | null {
  const area = grid.rows[row];
  if (area === undefined) return null;
  const bottom = Math.max(cell[1] + cell[3], area[1] + area[3]);
  return [cell[0], area[1], cell[2], bottom - area[1]];
}

/** The head band of a column (above the ring) or a row (left of it), in CSS pixels. */
export function headStyle(axis: HeadAxis, area: Box, tableBox: Box, k: number): CSSProperties {
  if (axis === 'column')
    return {
      left: area[0] * k,
      top: tableBox[1] * k - HEAD_GAP - HEAD_PX,
      width: area[2] * k,
      height: HEAD_PX,
    };
  return {
    left: tableBox[0] * k - HEAD_GAP - HEAD_PX,
    top: area[1] * k,
    width: HEAD_PX,
    height: area[3] * k,
  };
}

/**
 * Where the "+" sits for a pointer at (x, y) in CSS pixels over a ring box in CSS pixels: on the
 * right edge at the pointer's y when the pointer is within the band of that edge, else on the
 * bottom edge at the pointer's x, else nowhere. The circle stays inside the edge's run.
 */
export function edgeAt(
  x: number,
  y: number,
  ring: { left: number; top: number; width: number; height: number },
): { axis: HeadAxis; at: number } | null {
  const right = ring.left + ring.width;
  const bottom = ring.top + ring.height;
  const half = ADD_PX / 2;
  /* inside the edge's run and clear of its three squares (the two corners, the middle) */
  const inRun = (v: number, from: number, to: number) =>
    v >= from + SQUARE_CLEAR_PX &&
    v <= to - SQUARE_CLEAR_PX &&
    Math.abs(v - (from + to) / 2) > SQUARE_CLEAR_PX;
  if (Math.abs(x - right) <= EDGE_BAND_PX && inRun(y, ring.top, bottom))
    return { axis: 'column', at: Math.min(bottom - half, Math.max(ring.top + half, y)) };
  if (Math.abs(y - bottom) <= EDGE_BAND_PX && inRun(x, ring.left, right))
    return { axis: 'row', at: Math.min(right - half, Math.max(ring.left + half, x)) };
  return null;
}

/** The view with B1's `cellRing` (build/b5.md R4): the open cell's box, or a range's box while one is active. */
type ViewWithCellRing = EditorOverlayView & { cellRing?: Box | null };

function sameBox(a: Box, b: Box): boolean {
  return a.every((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) < 0.5);
}

/** The editor handle with the range API the heads call once B1 lands it (build/b5.md R2). */
type HeadEditor = NonNullable<EditorShellState['input']['editor']> & {
  selectCells?: (
    blockId: string,
    cells: { r0: number; c0: number; r1: number; c1: number },
  ) => void;
};

/** The id the parked set names for a table control (the family of docs/FEATURES.md 7.2: `handle.table.<part>`). */
export const parkedFamily = (part: string): string => `handle.table.${part}`;

/** The row ids of a head's menu, in order; the Header row check leads a row head's. */
export const HEAD_MENU_ROWS: Readonly<Record<HeadAxis, ReadonlyArray<string>>> = {
  row: [
    'format.table.headerRow',
    'format.table.insertRowAbove',
    'format.table.insertRowBelow',
    'format.table.deleteRow',
    'format.table.distributeRows',
  ],
  column: [
    'format.table.insertColumnLeft',
    'format.table.insertColumnRight',
    'format.table.deleteColumn',
    'format.table.distributeColumns',
  ],
};

/**
 * The items of a head's menu: the model's rows by id with their predicates dropped (the head's
 * own range enables them), and the Header row check, whose state the menu's context carries as
 * a private flag read from the table's first row, the way the tail's list plates carry a check
 * (ToolbarTail.tsx). Ids the model does not carry yet (build/b5.md R1) are drawn from here.
 */
export function headMenuItems(axis: HeadAxis): MenuItem[] {
  return HEAD_MENU_ROWS[axis].map((id): MenuItem => {
    const found = findItem(id);
    if (id === 'format.table.headerRow')
      return {
        id,
        label: found?.label ?? CANVAS.headerRow,
        status: 'now',
        effect: { kind: 'client', handler: 'runAction' },
        /* a check row: the setting is read as a flag in the menu's private context below */
        checked: { setting: 'zoom' },
        doc: found?.doc ?? CANVAS.headerRowDoc,
      };
    const {
      enabled: _enabled,
      disabledReason: _reason,
      advanced: _advanced,
      dividerBefore: _divider,
      ...rest
    } = found ?? { id, label: id, status: 'now' as const };
    const item: MenuItem = { ...rest, effect: { kind: 'client', handler: 'runAction' } };
    if (HEAD_MENU_DIVIDERS.has(id)) item.dividerBefore = true;
    return item;
  });
}

/** The rows a divider precedes in a head's menu: the inserts after the check, then the delete, then the distribute. */
const HEAD_MENU_DIVIDERS: ReadonlySet<string> = new Set([
  'format.table.insertRowAbove',
  'format.table.deleteRow',
  'format.table.distributeRows',
  'format.table.deleteColumn',
  'format.table.distributeColumns',
]);

/** The selected table block of the shown slide (its fields with the canvas box), when the selection names one. */
function tableBlockOf(
  shell: EditorShellState | null,
  slideId: string,
  blockId: string,
): (TableBlock & { pos?: Position }) | null {
  /* a shell without a document (a test's stub) draws the stage's table by its frame alone */
  const slide = (shell?.input as { document?: { slides?: Record<string, unknown> } } | undefined)
    ?.document?.slides?.[slideId] as Parameters<typeof slideBlocks>[0] | undefined;
  if (slide === undefined) return null;
  const found: Block | undefined = slideBlocks(slide).find(
    ({ block }) => block.id === blockId,
  )?.block;
  return found?.type === 'table' ? found : null;
}

export function TableOverlay({ view, tableBox, blockId }: TableOverlayProps) {
  const { k } = view;
  const shell = useContext(EditorShellContext);
  const root = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ axis: HeadAxis; at: number } | null>(null);
  const [menu, setMenu] = useState<{
    axis: HeadAxis;
    index: number;
    x: number;
    y: number;
    anchor: HTMLElement;
  } | null>(null);
  const grid = tableGridOf(blockId, tableBox, view.boxes.runs);
  const block = tableBlockOf(shell, view.slideId, blockId);
  /* the stage says the block is a table while a cell is open or a range is active (`tableFrame`);
     for a table selected by one click the shell's document says it, and a selected object of
     another type draws nothing */
  const isTable = view.tableFrame || block !== null;
  const settings = shell?.settings ?? null;
  const busy = shell?.input.busy === true;
  const ring = {
    left: tableBox[0] * k,
    top: tableBox[1] * k,
    width: tableBox[2] * k,
    height: tableBox[3] * k,
  };

  /* the "+" follows the pointer along the right and the bottom edge while it is near them */
  useEffect(() => {
    const el = root.current;
    if (el === null) return undefined;
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const next = edgeAt(event.clientX - rect.left, event.clientY - rect.top, ring);
      setEdge((current) =>
        current === null && next === null
          ? current
          : current !== null &&
              next !== null &&
              current.axis === next.axis &&
              Math.abs(current.at - next.at) < 0.5
            ? current
            : next,
      );
    };
    const onLeave = () => setEdge(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [ring.left, ring.top, ring.width, ring.height]);

  const say = (text: string) => shell?.say(text);
  const runPlan = (plan: TablePlan, label: string) => {
    if (shell === null) return;
    if ('refused' in plan) {
      say(plan.refused);
      return;
    }
    const editor: HeadEditor | undefined = shell.input.editor;
    const input = tableWriteInput(plan, view.slideId, shell.input.revision);
    if (editor?.tableCommand !== undefined) {
      editor.tableCommand({ action: plan.action, input });
      return;
    }
    shell.input
      .dispatch(plan.action, input)
      .catch((error: unknown) =>
        say(`${label}: ${error instanceof Error ? error.message : String(error)}`),
      );
  };

  /* the head's click: the whole column or row as a range (build/b5.md R2) */
  const selectHead = (axis: HeadAxis, index: number) => {
    if (block === null) return;
    const range = headRange(block, axis, index);
    if (range === null) return;
    const editor: HeadEditor | undefined = shell?.input.editor;
    editor?.selectCells?.(blockId, range);
  };

  /* the head's menu row: the plan over the head's own range */
  const runHeadRow = (axis: HeadAxis, index: number, itemId: string) => {
    if (block === null) return;
    const command: TableCommandId | null = tableCommandOfItem(itemId);
    if (command === null) return;
    const range = headRange(block, axis, index);
    runPlan(
      tablePlan(block, range === null ? {} : { cells: range }, command),
      findItem(itemId)?.label ?? 'Table',
    );
  };

  /* the "+" click: one commit that inserts and grows the box, else the plan */
  const addAtEdge = (axis: HeadAxis) => {
    if (block === null || shell === null) return;
    const last =
      axis === 'column' ? grid.columns[grid.columns.length - 1] : grid.rows[grid.rows.length - 1];
    const size =
      last === undefined
        ? axis === 'column'
          ? tableBox[2] / Math.max(1, block.columns.length)
          : tableBox[3] / Math.max(1, block.rows.length)
        : axis === 'column'
          ? last[2]
          : last[3];
    const commit = shell.input.commit;
    const label = axis === 'column' ? CANVAS.addColumn : CANVAS.addRow;
    if (commit !== undefined && block.pos !== undefined) {
      const insert = edgeInsert(block, block.pos, axis, size, tableBox[2]);
      if (insert === null) {
        say(axis === 'column' ? CANVAS.tableFullColumns : CANVAS.tableFullRows);
        return;
      }
      const mutations: Mutation[] = insert.writes.map((write) => ({
        op: 'block.set',
        slideId: view.slideId,
        blockId,
        path: write.path,
        ...(write.value === undefined ? {} : { value: write.value }),
      }));
      commit(mutations, label).catch((error: unknown) =>
        say(`${label}: ${error instanceof Error ? error.message : String(error)}`),
      );
      return;
    }
    const at: [number, number] =
      axis === 'column' ? [0, block.columns.length - 1] : [block.rows.length - 1, 0];
    runPlan(
      tablePlan(block, { cell: at }, axis === 'column' ? 'insertColumnsRight' : 'insertRowsBelow'),
      label,
    );
  };

  const openMenu = (event: ReactMouseEvent<HTMLButtonElement>, axis: HeadAxis, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    selectHead(axis, index);
    setMenu({ axis, index, x: event.clientX, y: event.clientY, anchor: event.currentTarget });
  };

  /* the open cell's ring on its grid area (3.3 item 1): from the selection's run; none while a
     range is active, since the stage draws the range's own ring (Editor.tsx `.is-cells`), which
     the view's `cellRing` (B1's field, the range's box then) tells apart from the cell's box */
  const cell =
    view.selection !== null && view.selection.kind === 'run' && view.selection.blockId === blockId
      ? cellOfPointer(view.selection.pointer)
      : null;
  const cellBox =
    cell === null
      ? undefined
      : view.boxes.runs[
          `${blockId}/${view.selection?.kind === 'run' ? view.selection.pointer : ''}`
        ];
  const withRing: ViewWithCellRing = view;
  const rangeActive =
    withRing.cellRing !== undefined &&
    withRing.cellRing !== null &&
    cellBox !== undefined &&
    !sameBox(withRing.cellRing, cellBox);
  const cellRing =
    cell !== null && cellBox !== undefined && !rangeActive && withRing.cellRing !== null
      ? cellRingBox(grid, cellBox, cell.row)
      : null;

  const headTip = (axis: HeadAxis, index: number) =>
    tipProps({
      name: axis === 'column' ? CANVAS.columnHead(index + 1) : CANVAS.rowHead(index + 1),
      doc: CANVAS.headDoc,
    });
  const heads = !isTable
    ? []
    : [
        ...grid.columns.map((area, index) => ({ axis: 'column' as const, index, area })),
        ...grid.rows.map((area, index) => ({ axis: 'row' as const, index, area })),
      ];
  const addControl = edge === null ? null : `handle.${blockId}.add.${edge.axis}`;
  const addShown =
    addControl !== null &&
    edge !== null &&
    block !== null &&
    !busy &&
    !isParked(parkedFamily(`add.${edge.axis}`), settings);
  const addStyle: CSSProperties | undefined =
    edge === null
      ? undefined
      : edge.axis === 'column'
        ? { left: ring.left + ring.width, top: edge.at }
        : { left: edge.at, top: ring.top + ring.height };

  if (!isTable) return null;
  return (
    <div ref={root} className="ts-table-tools" data-table={blockId}>
      {cellRing !== null && cell !== null ? (
        <div
          className="ts-cell-ring"
          data-cell={`${cell.row},${cell.column}`}
          style={{
            left: cellRing[0] * k,
            top: cellRing[1] * k,
            width: cellRing[2] * k,
            height: cellRing[3] * k,
          }}
          aria-hidden="true"
        />
      ) : null}
      {heads.map(({ axis, index, area }) => {
        const control = `handle.${blockId}.head.${axis}.${index}`;
        if (isParked(parkedFamily(`head.${axis}.${index}`), settings)) return null;
        return (
          <button
            key={control}
            type="button"
            className={cn(
              'ts-table-head',
              menu?.axis === axis && menu.index === index && 'is-open',
            )}
            data-axis={axis}
            data-index={index}
            data-control={control}
            style={headStyle(axis, area, tableBox, k)}
            aria-label={
              axis === 'column' ? CANVAS.columnHead(index + 1) : CANVAS.rowHead(index + 1)
            }
            disabled={busy}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              selectHead(axis, index);
            }}
            onContextMenu={(event) => openMenu(event, axis, index)}
            {...headTip(axis, index)}
          />
        );
      })}
      {addShown ? (
        <button
          type="button"
          className="ts-table-add"
          data-axis={edge.axis}
          data-control={`handle.${blockId}.add.${edge.axis}`}
          style={addStyle}
          aria-label={edge.axis === 'column' ? CANVAS.addColumn : CANVAS.addRow}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            addAtEdge(edge.axis);
          }}
          {...tipProps({
            name: edge.axis === 'column' ? CANVAS.addColumn : CANVAS.addRow,
            doc: edge.axis === 'column' ? CANVAS.addColumnDoc : CANVAS.addRowDoc,
          })}
        >
          <Icon name="plus" size={12} />
        </button>
      ) : null}
      {menu !== null && shell !== null && block !== null ? (
        <Menu
          items={headMenuItems(menu.axis)}
          context={{
            ...shell.menuContext,
            settings: { ...shell.menuContext.settings, zoom: isHeaderRow(block) },
          }}
          label={
            menu.axis === 'column'
              ? CANVAS.columnHead(menu.index + 1)
              : CANVAS.rowHead(menu.index + 1)
          }
          anchor={{ kind: 'point', x: menu.x, y: menu.y }}
          placement="point"
          returnFocusTo={menu.anchor}
          /* the right click menu's class, so the chrome's rules and the walk's readers of a
             context menu (toolkit.mjs contextRows) find it */
          className="ts-context-menu ts-table-head-menu"
          onSelect={(item) => {
            runHeadRow(menu.axis, menu.index, item.id);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
