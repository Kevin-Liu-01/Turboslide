import type {
  ClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useEffect, useRef, useState } from 'react';

import type { ChartCellDetail } from '@turboslide/viewer/Editor';
import { CHART_CELL_EVENT } from '@turboslide/viewer/Editor';

import type { Block } from '@turboslide/schema/blocks';
import type {
  ChartBlock,
  ChartKind,
  ChartLegend,
  ChartNumberFormat,
} from '@turboslide/schema/blocks/chart';
import {
  CHART_KINDS,
  CHART_KIND_LABELS,
  CHART_LEGENDS,
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  CHART_NUMBER_FORMATS,
  formatChartNumber,
} from '@turboslide/schema/blocks/chart';
import type { Color } from '@turboslide/schema/color';
import { COLOR_TOKENS } from '@turboslide/schema/color';

import {
  CHART_LEGEND_LABELS,
  CHART_NUMBER_FORMAT_LABELS,
  chartDataPlan,
  chartKindPlan,
  chartOptionPlan,
  chartWriteInput,
  droppedNote,
  parseChartPaste,
  seriesSwatch,
} from '../chart-tools';
import type { ChartGridEdit } from '../chart-tools';
import type { EditorDispatch } from '../dispatch';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { PANELS } from '../menus/strings';
import { Seg } from '../Seg';
import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';
import { swatchPaint } from './palette';

import './chart.css';

/**
 * The Chart data section of Format options (gslides-parity SPEC-2 section 5 "Chart data", 4.2
 * the chart tail's Edit data, section 10 accessibility; R11 A10): Google edits a chart's numbers
 * in a linked Sheet, the most cited chart complaint (R07); Turboslide edits them here. Chart type
 * as a segmented control; a data grid whose first column holds the categories and whose other
 * columns hold one series each, the series name and a colour swatch in the column header; Add
 * series, Add category and a Remove per row and column; Title; Legend; Number format; Show values.
 * Every grid edit is one `chart.setData` (chart-tools.ts `chartDataPlan`), the kind one
 * `chart.setKind`, the options one `block.set` each. The grid is a `grid` with row and column
 * headers: Tab and the arrows move the active cell, Enter (or typing) edits it, Esc restores it,
 * and a paste of tab or comma separated rows from a spreadsheet replaces the data. Mounted by
 * FormatOptions through its slots (`chartFormatSlot`) when the selected block is a chart.
 */
export type ChartSectionProps = {
  block: ChartBlock;
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  busy?: boolean;
  onNotice?: (message: string) => void;
};

/** The structural props a Format options slot hands its section; the adapter narrows the block. */
export type FormatSlotLikeProps = {
  block: Block;
  slide: { id: string };
  revision: number;
  dispatch: EditorDispatch;
  busy?: boolean;
  onNotice?: (message: string) => void;
};

/** The Chart data slot: the section for a chart block, nothing for any other block. */
export function chartFormatSlot(props: FormatSlotLikeProps): ReactNode {
  if (props.block.type !== 'chart') return null;
  return (
    <ChartSection
      block={props.block as ChartBlock}
      slideId={props.slide.id}
      revision={props.revision}
      dispatch={props.dispatch}
      busy={props.busy}
      onNotice={props.onNotice}
    />
  );
}

type Active = { row: number; column: number };

/** The grid's cells: row 0 is the header (series names), column 0 the categories, (0, 0) the corner. */
function cellId(prefix: string, row: number, column: number): string {
  return `${prefix}-${row}-${column}`;
}

/**
 * The cell the stage asked for (docs/FEATURES.md 2.2 rank 7; Editor.tsx CHART_CELL_EVENT): a
 * double click on the chart, Enter on it or a click on a bar, a point or a slice names a cell of
 * the grid. A mounted section takes it at once; a section that mounts later (Format options was
 * closed, the Overlay opens it on the same event) reads the last request for its chart on mount,
 * so the first value cell or the tapped mark's cell is active when the grid appears.
 */
const pendingCells = new Map<string, Active>();
const cellListeners = new Set<(detail: ChartCellDetail) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener(CHART_CELL_EVENT, (event) => {
    const detail = (event as CustomEvent<ChartCellDetail>).detail;
    if (detail === undefined) return;
    pendingCells.set(detail.blockId, { row: detail.row, column: detail.column });
    for (const listener of cellListeners) listener(detail);
  });
}

/** The cell a request named, clamped into the grid; the first value cell when none was asked for. */
function requestedCell(blockId: string, rows: number, columns: number): Active {
  const asked = pendingCells.get(blockId);
  pendingCells.delete(blockId);
  return {
    row: Math.max(1, Math.min(rows, asked?.row ?? 1)),
    column: Math.max(1, Math.min(columns, asked?.column ?? 1)),
  };
}

export function ChartSection({
  block,
  slideId,
  revision,
  dispatch,
  busy = false,
  onNotice,
}: ChartSectionProps) {
  const words = PANELS.chart;
  const control = 'formatOptions.chart';
  const rows = block.categories.length;
  const columns = block.series.length;
  const [active, setActive] = useState<Active>(() => requestedCell(block.id, rows, columns));
  const [editing, setEditing] = useState<(Active & { draft: string }) | null>(null);
  const [swatchesFor, setSwatchesFor] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  /* the right click menu of a series or category header: Remove (docs/FEATURES.md 2.2 rank 12) */
  const [menu, setMenu] = useState<(Active & { x: number; y: number }) | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  const focusAfter = useRef<Active | null>(null);

  /* the cell the stage names while the section is mounted (rank 7): active and focused */
  useEffect(() => {
    const listener = (detail: ChartCellDetail) => {
      if (detail.blockId !== block.id) return;
      pendingCells.delete(block.id);
      const next = {
        row: Math.max(1, Math.min(rows, detail.row)),
        column: Math.max(1, Math.min(columns, detail.column)),
      };
      setEditing(null);
      setActive(next);
      focusAfter.current = next;
    };
    cellListeners.add(listener);
    return () => {
      cellListeners.delete(listener);
    };
  }, [block.id, rows, columns]);

  /* the active cell stays inside the grid when a row or a column goes */
  useEffect(() => {
    setActive((current) => ({
      row: Math.min(current.row, rows),
      column: Math.min(current.column, columns),
    }));
  }, [rows, columns]);

  /* focus the cell an edit or a move named once it is drawn */
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    const el = grid.current?.querySelector<HTMLElement>(
      `#${cellId(gridId(block.id), target.row, target.column)}`,
    );
    el?.focus();
  });

  const say = (message: string) => onNotice?.(message);
  const report = (promise: Promise<unknown>) =>
    promise.catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));

  const runEdit = (edit: ChartGridEdit) => {
    try {
      const plan = chartDataPlan(block, edit);
      report(dispatch(plan.action, chartWriteInput(plan, slideId, revision)));
    } catch (error) {
      say(error instanceof Error ? error.message : String(error));
    }
  };

  const setKind = (kind: ChartKind) => {
    if (kind === block.kind) return;
    const plan = chartKindPlan(block, kind);
    const note = droppedNote(plan);
    report(
      dispatch(plan.action, chartWriteInput(plan, slideId, revision)).then((result) => {
        if (note !== null) say(note);
        return result;
      }),
    );
  };

  const setOption = (field: 'legend' | 'numberFormat' | 'labels' | 'title', value: unknown) => {
    const plan = chartOptionPlan(block, field, value);
    report(dispatch(plan.action, chartWriteInput(plan, slideId, revision)));
  };

  /** What a cell holds as text: the header names, the category names, the values in the chart's format. */
  const textOf = (row: number, column: number): string => {
    if (row === 0 && column === 0) return '';
    if (row === 0) return block.series[column - 1]?.name ?? '';
    if (column === 0) return block.categories[row - 1] ?? '';
    return String(block.series[column - 1]?.values[row - 1] ?? 0);
  };

  const shownOf = (row: number, column: number): string => {
    if (row === 0 || column === 0) return textOf(row, column);
    return formatChartNumber(block.series[column - 1]?.values[row - 1] ?? 0, block.numberFormat);
  };

  const startEdit = (row: number, column: number, draft?: string) => {
    if (busy || (row === 0 && column === 0)) return;
    setEditing({ row, column, draft: draft ?? textOf(row, column) });
  };

  const commitEdit = () => {
    if (editing === null) return;
    const { row, column, draft } = editing;
    setEditing(null);
    focusAfter.current = { row, column };
    const before = textOf(row, column);
    if (draft === before) return;
    if (row === 0) {
      runEdit({ kind: 'renameSeries', index: column - 1, name: draft });
      return;
    }
    if (column === 0) {
      runEdit({ kind: 'renameCategory', index: row - 1, name: draft });
      return;
    }
    const value = Number(draft.replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(value)) {
      say('Type a number');
      return;
    }
    runEdit({ kind: 'cell', row: row - 1, column: column - 1, value });
  };

  const cancelEdit = () => {
    if (editing === null) return;
    focusAfter.current = { row: editing.row, column: editing.column };
    setEditing(null);
  };

  const move = (row: number, column: number) => {
    const next = {
      row: Math.max(0, Math.min(rows, row)),
      column: Math.max(0, Math.min(columns, column)),
    };
    setActive(next);
    focusAfter.current = next;
  };

  const onCellKey = (event: ReactKeyboardEvent<HTMLElement>, row: number, column: number) => {
    if (editing !== null) return;
    switch (event.key) {
      case 'ArrowRight':
        move(row, column + 1);
        break;
      case 'ArrowLeft':
        move(row, column - 1);
        break;
      case 'ArrowDown':
        move(row + 1, column);
        break;
      case 'ArrowUp':
        move(row - 1, column);
        break;
      case 'Home':
        move(row, 0);
        break;
      case 'End':
        move(row, columns);
        break;
      case 'Tab': {
        const flat = row * (columns + 1) + column + (event.shiftKey ? -1 : 1);
        const last = (rows + 1) * (columns + 1) - 1;
        if (flat < 0 || flat > last) return;
        move(Math.floor(flat / (columns + 1)), flat % (columns + 1));
        break;
      }
      case 'Enter':
      case 'F2':
        startEdit(row, column);
        break;
      case 'Escape':
        /* the grid owns its keys (docs/FEATURES.md 2.2 rank 1; audit-objects 1): Escape on the
           active cell with no open field leaves the grid and keeps the chart selected and the
           panel open; the stage's Escape never sees it, so the selection stands */
        event.currentTarget.blur();
        break;
      case 'Backspace':
      case 'Delete':
        startEdit(row, column, '');
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          startEdit(row, column, event.key);
          break;
        }
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (editing !== null) return;
    const text = event.clipboardData.getData('text/plain');
    const pasted = parseChartPaste(text);
    if (pasted === null) return;
    event.preventDefault();
    runEdit({ kind: 'replace', ...pasted });
  };

  /**
   * A right click on a series or a category header lists Remove (docs/FEATURES.md 2.2 rank 12;
   * audit-objects 21: no right click row named a series). One row, the product's own menu, the
   * browser's never; Escape or a click elsewhere closes it.
   */
  const onHeaderContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    row: number,
    column: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setActive({ row, column });
    setMenu({ row, column, x: event.clientX, y: event.clientY });
  };
  useEffect(() => {
    if (menu === null) return undefined;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);
  const menuTarget =
    menu === null
      ? null
      : menu.row === 0
        ? {
            kind: 'series' as const,
            index: menu.column - 1,
            name: block.series[menu.column - 1]?.name ?? '',
          }
        : {
            kind: 'category' as const,
            index: menu.row - 1,
            name: block.categories[menu.row - 1] ?? '',
          };
  const menuCanRemove =
    menuTarget !== null && (menuTarget.kind === 'series' ? columns > 1 : rows > 1);

  const gridTip = tipProps({
    name: words.title,
    doc: 'The categories down the first column and one series per column. Arrows move, Enter edits, Esc restores; paste rows from a spreadsheet',
  });

  const cell = (
    row: number,
    column: number,
    content: ReactNode,
    extra?: { className?: string; header?: 'row' | 'column' },
  ) => {
    const isActive = active.row === row && active.column === column;
    const isEditing = editing !== null && editing.row === row && editing.column === column;
    /* the header of the active cell's row or column: its remove control is drawn (rank 12) */
    const isActiveLine =
      extra?.header !== undefined &&
      !(row === 0 && column === 0) &&
      ((row === 0 && active.column === column) || (column === 0 && active.row === row));
    const role =
      extra?.header === 'column'
        ? 'columnheader'
        : extra?.header === 'row'
          ? 'rowheader'
          : 'gridcell';
    const Tag = extra?.header === undefined ? 'td' : 'th';
    return (
      <Tag
        key={column}
        id={cellId(gridId(block.id), row, column)}
        role={role}
        className={cn(
          'ts-chartgrid-cell',
          extra?.className,
          isActive && 'is-active',
          isActiveLine && 'is-active-line',
          isEditing && 'is-editing',
        )}
        tabIndex={row === 0 && column === 0 ? -1 : isActive ? 0 : -1}
        aria-selected={row === 0 && column === 0 ? undefined : isActive}
        data-control={`${control}.cell.${row}.${column}`}
        onFocus={() => setActive({ row, column })}
        onClick={() => setActive({ row, column })}
        onDoubleClick={() => startEdit(row, column)}
        onKeyDown={(event) => onCellKey(event, row, column)}
        onContextMenu={
          extra?.header !== undefined && !(row === 0 && column === 0)
            ? (event) => onHeaderContextMenu(event, row, column)
            : undefined
        }
      >
        {isEditing ? (
          <input
            className="ts-chartgrid-input"
            value={editing.draft}
            aria-label={row === 0 ? 'Series name' : column === 0 ? 'Category name' : 'Value'}
            data-control={`${control}.edit`}
            autoFocus
            inputMode={row === 0 || column === 0 ? 'text' : 'decimal'}
            onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
            onBlur={commitEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commitEdit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancelEdit();
              } else if (event.key === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                commitEdit();
                const flat = row * (columns + 1) + column + (event.shiftKey ? -1 : 1);
                const last = (rows + 1) * (columns + 1) - 1;
                if (flat >= 0 && flat <= last)
                  move(Math.floor(flat / (columns + 1)), flat % (columns + 1));
              }
            }}
          />
        ) : (
          content
        )}
      </Tag>
    );
  };

  const canAddSeries = block.kind !== 'pie' && columns < CHART_MAX_SERIES;
  const canAddCategory = rows < CHART_MAX_CATEGORIES;

  const kindOptions = CHART_KINDS.map((kind) => ({
    value: kind,
    label: CHART_KIND_LABELS[kind],
    title: CHART_KIND_LABELS[kind],
    doc:
      kind === 'pie'
        ? 'A pie keeps the first series'
        : `Draws the data as a ${CHART_KIND_LABELS[kind].toLowerCase()} chart`,
  }));

  return (
    <div className="ts-chart-section" data-control={control}>
      <div className="ts-chart-row">
        <span className="ts-chart-label" id={`${gridId(block.id)}-type`}>
          {words.type}
        </span>
        <Seg
          options={kindOptions}
          value={block.kind}
          onChange={(kind) => setKind(kind)}
          label={words.type}
          className="is-small ts-chart-kind"
          control={`${control}.type`}
        />
      </div>

      <div className="ts-chartgrid-wrap pt-scroll">
        <table
          ref={grid}
          className="ts-chartgrid"
          role="grid"
          aria-label={words.title}
          aria-rowcount={rows + 1}
          aria-colcount={columns + 1}
          aria-readonly={busy ? true : undefined}
          data-control={`${control}.grid`}
          {...gridTip}
          onPaste={onPaste}
        >
          <thead>
            <tr role="row">
              {cell(0, 0, <span className="ts-chartgrid-corner" aria-hidden="true" />, {
                header: 'column',
                className: 'is-corner',
              })}
              {block.series.map((series, index) =>
                cell(
                  0,
                  index + 1,
                  <span className="ts-chartgrid-head">
                    <button
                      type="button"
                      className="ts-chartgrid-swatch"
                      style={{ background: swatchPaint(seriesSwatch(series, index)) }}
                      aria-label={`${series.name} color`}
                      aria-expanded={swatchesFor === index}
                      data-control={`${control}.series.${index}.color`}
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSwatchesFor(swatchesFor === index ? null : index);
                      }}
                      {...tipProps({
                        name: `${series.name} color`,
                        doc: 'The colour of this series in the chart',
                      })}
                    />
                    <span className="ts-chartgrid-name">{series.name}</span>
                    <button
                      type="button"
                      className="ts-chartgrid-remove"
                      aria-label={`${words.remove} ${series.name}`}
                      data-control={`${control}.series.${index}.remove`}
                      disabled={busy || columns <= 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        runEdit({ kind: 'removeSeries', index });
                      }}
                      {...tipProps({
                        name: words.remove,
                        doc:
                          columns <= 1
                            ? 'A chart keeps at least one series'
                            : `Removes ${series.name} from the chart`,
                      })}
                    >
                      <Icon name="close" />
                    </button>
                  </span>,
                  { header: 'column' },
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {block.categories.map((category, r) => (
              <tr key={r} role="row">
                {cell(
                  r + 1,
                  0,
                  <span className="ts-chartgrid-head">
                    <span className="ts-chartgrid-name">{category}</span>
                    <button
                      type="button"
                      className="ts-chartgrid-remove"
                      aria-label={`${words.remove} ${category}`}
                      data-control={`${control}.category.${r}.remove`}
                      disabled={busy || rows <= 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        runEdit({ kind: 'removeCategory', index: r });
                      }}
                      {...tipProps({
                        name: words.remove,
                        doc:
                          rows <= 1
                            ? 'A chart keeps at least one category'
                            : `Removes ${category} from the chart`,
                      })}
                    >
                      <Icon name="close" />
                    </button>
                  </span>,
                  { header: 'row' },
                )}
                {block.series.map((_series, c) =>
                  cell(
                    r + 1,
                    c + 1,
                    <span className="ts-chartgrid-value">{shownOf(r + 1, c + 1)}</span>,
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {menu !== null && menuTarget !== null ? (
        <div
          className="ts-chartgrid-menu ts-chrome"
          role="menu"
          aria-label={`${menuTarget.name} options`}
          data-control={`${control}.menu`}
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="ts-chartgrid-menu-row"
            data-control={`${control}.menu.remove`}
            disabled={busy || !menuCanRemove}
            onClick={() => {
              setMenu(null);
              runEdit(
                menuTarget.kind === 'series'
                  ? { kind: 'removeSeries', index: menuTarget.index }
                  : { kind: 'removeCategory', index: menuTarget.index },
              );
            }}
            {...tipProps({
              name: words.remove,
              doc: menuCanRemove
                ? `Removes ${menuTarget.name} from the chart`
                : menuTarget.kind === 'series'
                  ? 'A chart keeps at least one series'
                  : 'A chart keeps at least one category',
            })}
          >
            {`${words.remove} ${menuTarget.name}`}
          </button>
        </div>
      ) : null}

      {swatchesFor !== null && block.series[swatchesFor] !== undefined ? (
        <div
          className="ts-chart-swatches"
          role="radiogroup"
          aria-label={`${block.series[swatchesFor]?.name} color`}
          data-control={`${control}.swatches`}
        >
          {COLOR_TOKENS.map((token) => {
            const current = seriesSwatch(
              block.series[swatchesFor] as ChartBlock['series'][number],
              swatchesFor,
            );
            return (
              <button
                key={token}
                type="button"
                role="radio"
                aria-checked={current === token}
                aria-label={token}
                className={cn('ts-chart-swatch', current === token && 'is-current')}
                style={{ background: swatchPaint(token) }}
                data-control={`${control}.swatches.${token}`}
                onClick={() => {
                  runEdit({ kind: 'seriesColor', index: swatchesFor, color: token as Color });
                  setSwatchesFor(null);
                }}
                {...tipProps({ name: token, doc: 'Sets the series colour' })}
              />
            );
          })}
        </div>
      ) : null}

      <div className="ts-chart-actions">
        <ToolButton
          label={words.addSeries}
          title={words.addSeries}
          doc={
            canAddSeries
              ? 'A new column of zeros'
              : block.kind === 'pie'
                ? 'A pie chart has one series'
                : `A chart has at most ${CHART_MAX_SERIES} series`
          }
          icon="plus"
          control={`${control}.addSeries`}
          disabled={busy || !canAddSeries}
          onClick={() => runEdit({ kind: 'addSeries' })}
        />
        <ToolButton
          label={words.addCategory}
          title={words.addCategory}
          doc={
            canAddCategory
              ? 'A new row of zeros'
              : `A chart has at most ${CHART_MAX_CATEGORIES} categories`
          }
          icon="plus"
          control={`${control}.addCategory`}
          disabled={busy || !canAddCategory}
          onClick={() => runEdit({ kind: 'addCategory' })}
        />
      </div>

      <label className="ts-chart-field">
        <span className="ts-chart-label">Title</span>
        <input
          type="text"
          value={titleDraft ?? block.title ?? ''}
          aria-label="Title"
          data-control={`${control}.title`}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          {...tipProps({
            name: 'Title',
            doc: 'The title over the chart; empty for none',
            key: 'Enter',
          })}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => {
            if (titleDraft === null) return;
            const next = titleDraft;
            setTitleDraft(null);
            if (next.trim() !== (block.title ?? '')) setOption('title', next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setTitleDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
      </label>

      <label className="ts-chart-field">
        <span className="ts-chart-label">{words.legend}</span>
        <select
          className="ts-ctl-select"
          aria-label={words.legend}
          data-control={`${control}.legend`}
          value={block.legend ?? 'right'}
          disabled={busy}
          onChange={(event) => setOption('legend', event.target.value as ChartLegend)}
          {...tipProps({ name: words.legend, doc: 'Where the legend sits; None hides it' })}
        >
          {CHART_LEGENDS.map((legend) => (
            <option key={legend} value={legend}>
              {CHART_LEGEND_LABELS[legend]}
            </option>
          ))}
        </select>
      </label>

      <label className="ts-chart-field">
        <span className="ts-chart-label">{words.numberFormat}</span>
        <select
          className="ts-ctl-select"
          aria-label={words.numberFormat}
          data-control={`${control}.numberFormat`}
          value={block.numberFormat ?? 'plain'}
          disabled={busy}
          onChange={(event) => setOption('numberFormat', event.target.value as ChartNumberFormat)}
          {...tipProps({
            name: words.numberFormat,
            doc: 'How the axis and the values print their numbers',
          })}
        >
          {CHART_NUMBER_FORMATS.map((format) => (
            <option key={format} value={format}>
              {CHART_NUMBER_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
      </label>

      <label className="ts-chart-field is-check">
        <input
          type="checkbox"
          checked={block.labels === true}
          aria-label={words.showValues}
          data-control={`${control}.showValues`}
          disabled={busy}
          onChange={(event) => setOption('labels', event.target.checked)}
          {...tipProps({
            name: words.showValues,
            doc: 'Prints each value on its bar, point or slice',
          })}
        />
        <span className="ts-chart-label">{words.showValues}</span>
      </label>
    </div>
  );
}

function gridId(blockId: string): string {
  return `ts-chartgrid-${blockId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}
