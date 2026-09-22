import type { ReactNode } from 'react';
import { useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { CellBorder, TableBlock, TableBorderWeight } from '@turboslide/schema/blocks/table';
import { TABLE_BORDER_WEIGHTS } from '@turboslide/schema/blocks/table';
import type { Color } from '@turboslide/schema/color';
import { COLOR_TOKENS } from '@turboslide/schema/color';
import type { Dash } from '@turboslide/schema/shapes';
import { DASHES, DASH_LABELS } from '@turboslide/schema/shapes';

import type { EditorDispatch } from '../dispatch';
import type { EditorHandle, EditorSelection } from '../editor-shell';
import { cn } from '../lib/cn';
import {
  SELECT_CELL,
  cellStyleAt,
  isMergedAnchor,
  isMultiCell,
  rangeOf,
  tablePlan,
  tableWriteInput,
} from '../table-tools';
import type { TableCommandId, TablePlan, TableSelection } from '../table-tools';
import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';
import { swatchPaint } from './palette';

import './table.css';

/**
 * The Table section of Format options (gslides-parity SPEC-2 section 5 "Table", 2.7; R11 A5, A6;
 * R05 A6): the round one fields stay generated (header row, columns, the table's fill and
 * vertical alignment); this section adds the table border (weight with Google's Transparent as
 * None, colour, dash), the row heights as a list with Distribute rows and Distribute columns, the
 * selected cell's Fill and Border, Merge cells and Unmerge cells, and the insert and delete rows
 * and columns with a count. Every control is one plan of table-tools.ts dispatched as the action
 * of SPEC-2 section 3, through the editor's `tableCommand` when the shell passes one (so the
 * stage keeps the caret), else straight to the dispatcher. Mounted by FormatOptions through its
 * slots (`tableFormatSlot`) when the selected block is a table.
 */
export type TableSectionProps = {
  block: TableBlock;
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  /** the caret's cell and the range, in the shell's words */
  selection?: Pick<EditorSelection, 'cell' | 'cells'> | null;
  editor?: Pick<EditorHandle, 'tableCommand'>;
  busy?: boolean;
  onNotice?: (message: string) => void;
};

/** The structural props a Format options slot hands its section; the adapter narrows the block. */
export type TableSlotLikeProps = {
  block: Block;
  slide: { id: string };
  revision: number;
  dispatch: EditorDispatch;
  selection?: Pick<EditorSelection, 'cell' | 'cells'> | null;
  editor?: Pick<EditorHandle, 'tableCommand'>;
  busy?: boolean;
  onNotice?: (message: string) => void;
};

/** The Table slot: the section for a table block, nothing for any other block. */
export function tableFormatSlot(props: TableSlotLikeProps): ReactNode {
  if (props.block.type !== 'table') return null;
  return (
    <TableSection
      block={props.block as TableBlock}
      slideId={props.slide.id}
      revision={props.revision}
      dispatch={props.dispatch}
      selection={props.selection}
      editor={props.editor}
      busy={props.busy}
      onNotice={props.onNotice}
    />
  );
}

const WEIGHT_LABELS: Readonly<Record<TableBorderWeight, string>> = {
  0: 'None',
  1: '1 px',
  1.5: '1.5 px',
  2: '2 px',
};

/** The shell's selection as table-tools' words. */
export function tableSelectionOf(selection: TableSectionProps['selection']): TableSelection {
  return {
    ...(selection?.cell === undefined
      ? {}
      : { cell: [selection.cell.row, selection.cell.column] as [number, number] }),
    ...(selection?.cells === undefined ? {} : { cells: selection.cells }),
  };
}

function Swatches({
  label,
  current,
  control,
  disabled,
  onPick,
}: {
  label: string;
  current: Color | undefined;
  control: string;
  disabled: boolean;
  onPick: (color: Color | null) => void;
}) {
  return (
    <div className="ts-table-swatches" role="radiogroup" aria-label={label} data-control={control}>
      <button
        type="button"
        role="radio"
        aria-checked={current === undefined}
        aria-label={`${label} none`}
        className={cn('ts-table-swatch is-none', current === undefined && 'is-current')}
        data-control={`${control}.none`}
        disabled={disabled}
        onClick={() => onPick(null)}
        {...tipProps({ name: 'None', doc: `Removes the ${label.toLowerCase()}` })}
      />
      {COLOR_TOKENS.map((token) => (
        <button
          key={token}
          type="button"
          role="radio"
          aria-checked={current === token}
          aria-label={`${label} ${token}`}
          className={cn('ts-table-swatch', current === token && 'is-current')}
          style={{ background: swatchPaint(token) }}
          data-control={`${control}.${token}`}
          disabled={disabled}
          onClick={() => onPick(token)}
          {...tipProps({ name: token, doc: `Sets the ${label.toLowerCase()}` })}
        />
      ))}
    </div>
  );
}

export function TableSection({
  block,
  slideId,
  revision,
  dispatch,
  selection,
  editor,
  busy = false,
  onNotice,
}: TableSectionProps) {
  const control = 'formatOptions.table';
  const tableSelection = tableSelectionOf(selection);
  const range = rangeOf(block, tableSelection);
  const cell: [number, number] | undefined =
    tableSelection.cell ?? (range === null ? undefined : [range.r0, range.c0]);
  const hasCell = cell !== undefined;
  const multi = range !== null && isMultiCell(block, range);
  const merged = isMergedAnchor(block, cell);
  const cellStyle = cell === undefined ? {} : cellStyleAt(block, cell);
  const [count, setCount] = useState(1);
  /* the Height field's draft while it is typed (docs/FEATURES.md 2.2 rank 13) */
  const [heightDraft, setHeightDraft] = useState<string | null>(null);
  /* the rows the Height field reads and writes: the range's rows, else the caret's row, else
     every row of a table selected by one click */
  const heightRows: number[] =
    range === null
      ? block.rows.map((_row, index) => index)
      : Array.from({ length: range.r1 - range.r0 + 1 }, (_, i) => range.r0 + i);
  const heightValues = heightRows.map((index) => block.rows[index]?.height);
  const sharedHeight =
    heightValues.length > 0 && heightValues.every((value) => value === heightValues[0])
      ? heightValues[0]
      : undefined;
  const heightLabel =
    range === null
      ? 'Height of every row'
      : heightRows.length === 1
        ? `Row ${range.r0 + 1} height`
        : `Rows ${range.r0 + 1} to ${range.r1 + 1} height`;

  const say = (message: string) => onNotice?.(message);
  const report = (promise: Promise<unknown>) =>
    promise.catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));

  const run = (plan: TablePlan) => {
    if ('refused' in plan) {
      say(plan.refused);
      return;
    }
    if (editor?.tableCommand !== undefined) {
      editor.tableCommand({ action: plan.action, input: tableWriteInput(plan, slideId, revision) });
      return;
    }
    report(dispatch(plan.action, tableWriteInput(plan, slideId, revision)));
  };

  const command = (id: TableCommandId, options?: Parameters<typeof tablePlan>[3]) =>
    run(tablePlan(block, tableSelection, id, options));

  const writeRows = (rows: TableBlock['rows'], label: string) => {
    report(
      dispatch('block.set', {
        slideId,
        blockId: block.id,
        path: '/rows',
        value: rows,
        baseRevision: revision,
      }).catch((error: unknown) => {
        throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }),
    );
  };

  /**
   * The Height field's commit (rank 13; audit-objects 22: one field per row, twenty fields on a
   * twenty row table): the height in px written on every selected row in one /rows write, one
   * Cmd+Z; empty clears them so they take their content height.
   */
  const commitHeight = () => {
    if (heightDraft === null) return;
    const trimmed = heightDraft.trim();
    setHeightDraft(null);
    let value: number | undefined;
    if (trimmed !== '') {
      value = Math.round(Number(trimmed));
      if (!Number.isFinite(value) || value <= 0) {
        say('Type a height in px');
        return;
      }
    }
    const rows = block.rows.map((row) => ({ ...row }));
    let changed = false;
    for (const index of heightRows) {
      const target = rows[index];
      if (target === undefined) continue;
      if (value === undefined) {
        if (target.height !== undefined) {
          delete target.height;
          changed = true;
        }
      } else if (target.height !== value) {
        target.height = value;
        changed = true;
      }
    }
    if (changed) writeRows(rows, 'Row height');
  };

  const toggleHeader = (on: boolean) => {
    const rows = block.rows.map((row, index) => {
      if (index !== 0) return row;
      const next = { ...row };
      if (on) next.header = true;
      else delete next.header;
      return next;
    });
    writeRows(rows, 'Header row');
  };

  const border = block.border;
  const cellBorder: CellBorder | undefined = cellStyle.border;
  const cellDoc = hasCell ? undefined : SELECT_CELL;
  const heightTip = tipProps({
    name: 'Height',
    doc: 'The selected rows in px; empty takes the content height',
    key: 'Enter',
  });

  return (
    <div className="ts-table-section" data-control={control}>
      <label className="ts-table-row is-check">
        <input
          type="checkbox"
          checked={block.rows[0]?.header === true}
          aria-label="Header row"
          data-control={`${control}.headerRow`}
          disabled={busy}
          onChange={(event) => toggleHeader(event.target.checked)}
          {...tipProps({
            name: 'Header row',
            doc: 'The first row at display weight with a rule under it',
          })}
        />
        <span className="ts-table-label">Header row</span>
      </label>

      <div className="ts-table-group" role="group" aria-label="Table border">
        <span className="ts-table-heading">Table border</span>
        <div className="ts-table-row">
          <span className="ts-table-label">Border weight</span>
          <select
            className="ts-ctl-select"
            aria-label="Table border weight"
            data-control={`${control}.border.weight`}
            value={String(border?.weight ?? 1)}
            disabled={busy}
            onChange={(event) =>
              command('tableBorder', {
                border: { weight: Number(event.target.value) as TableBorderWeight },
              })
            }
            {...tipProps({
              name: 'Border weight',
              doc: 'The rules between the cells; None removes them',
            })}
          >
            {TABLE_BORDER_WEIGHTS.map((weight) => (
              <option key={weight} value={String(weight)}>
                {WEIGHT_LABELS[weight]}
              </option>
            ))}
          </select>
        </div>
        <div className="ts-table-row">
          <span className="ts-table-label">Border dash</span>
          <select
            className="ts-ctl-select"
            aria-label="Table border dash"
            data-control={`${control}.border.dash`}
            value={border?.dash ?? 'solid'}
            disabled={busy}
            onChange={(event) =>
              command('tableBorder', { border: { dash: event.target.value as Dash } })
            }
            {...tipProps({ name: 'Border dash', doc: 'Solid or one of the five dashes' })}
          >
            {DASHES.map((dash) => (
              <option key={dash} value={dash}>
                {DASH_LABELS[dash]}
              </option>
            ))}
          </select>
        </div>
        <div className="ts-table-row is-wide">
          <span className="ts-table-label">Border color</span>
          <Swatches
            label="Table border color"
            current={border?.color}
            control={`${control}.border.color`}
            disabled={busy}
            onPick={(color) => {
              const next: CellBorder = {
                weight: border?.weight ?? 1,
                ...(border?.dash === undefined ? {} : { dash: border.dash }),
              };
              if (color !== null) next.color = color;
              run({
                action: 'block.set',
                input: { blockId: block.id, path: '/border', value: next },
              });
            }}
          />
        </div>
      </div>

      <div className="ts-table-group" role="group" aria-label="Rows">
        <span className="ts-table-heading">Rows</span>
        <div className="ts-table-row">
          <span className="ts-table-label">{heightLabel}</span>
          <input
            type="text"
            inputMode="numeric"
            className="ts-table-height"
            value={heightDraft ?? (sharedHeight === undefined ? '' : String(sharedHeight))}
            placeholder={heightValues.some((value) => value !== undefined) ? 'mixed' : 'auto'}
            aria-label={heightLabel}
            data-control={`${control}.height`}
            disabled={busy}
            autoComplete="off"
            {...heightTip}
            onChange={(event) => setHeightDraft(event.target.value)}
            onBlur={(event) => {
              heightTip.onBlur(event);
              commitHeight();
            }}
            onKeyDown={(event) => {
              heightTip.onKeyDown(event);
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setHeightDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <div className="ts-table-actions">
          <ToolButton
            label="Distribute rows"
            title="Distribute rows"
            doc="Gives every row the same height"
            control={`${control}.distributeRows`}
            menuItem="format.table.distributeRows"
            disabled={busy}
            onClick={() =>
              run(tablePlan(block, hasCell ? tableSelection : { cell: [0, 0] }, 'distributeRows'))
            }
          />
          <ToolButton
            label="Distribute columns"
            title="Distribute columns"
            doc="Gives every column the same width"
            control={`${control}.distributeColumns`}
            menuItem="format.table.distributeColumns"
            disabled={busy}
            onClick={() =>
              run(
                tablePlan(block, hasCell ? tableSelection : { cell: [0, 0] }, 'distributeColumns'),
              )
            }
          />
        </div>
      </div>

      <div className="ts-table-group" role="group" aria-label="Cell">
        <span className="ts-table-heading">
          {range === null
            ? 'Cell'
            : multi
              ? `Cells ${range.r0 + 1},${range.c0 + 1} to ${range.r1 + 1},${range.c1 + 1}`
              : `Cell ${range.r0 + 1},${range.c0 + 1}`}
        </span>
        {!hasCell ? <p className="ts-table-note">{SELECT_CELL}</p> : null}
        <div className="ts-table-row is-wide">
          <span className="ts-table-label">Fill color</span>
          <Swatches
            label="Cell fill"
            current={cellStyle.fill}
            control={`${control}.cell.fill`}
            disabled={busy || !hasCell}
            onPick={(fill) => command('cellFill', { fill })}
          />
        </div>
        <div className="ts-table-row">
          <span className="ts-table-label">Border weight</span>
          <select
            className="ts-ctl-select"
            aria-label="Cell border weight"
            data-control={`${control}.cell.border.weight`}
            value={cellBorder?.weight === undefined ? '' : String(cellBorder.weight)}
            disabled={busy || !hasCell}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === '') {
                const rest: CellBorder = { ...cellBorder };
                delete rest.weight;
                command('cellBorder', { border: Object.keys(rest).length === 0 ? null : rest });
                return;
              }
              command('cellBorder', {
                border: { ...cellBorder, weight: Number(raw) as TableBorderWeight },
              });
            }}
            {...tipProps({
              name: 'Border weight',
              doc: cellDoc ?? 'The cell’s own rule; None is Google’s Transparent border',
            })}
          >
            <option value="">Table’s</option>
            {TABLE_BORDER_WEIGHTS.map((weight) => (
              <option key={weight} value={String(weight)}>
                {WEIGHT_LABELS[weight]}
              </option>
            ))}
          </select>
        </div>
        <div className="ts-table-row">
          <span className="ts-table-label">Border dash</span>
          <select
            className="ts-ctl-select"
            aria-label="Cell border dash"
            data-control={`${control}.cell.border.dash`}
            value={cellBorder?.dash ?? ''}
            disabled={busy || !hasCell}
            onChange={(event) => {
              const raw = event.target.value;
              const next: CellBorder = { ...cellBorder };
              if (raw === '') delete next.dash;
              else next.dash = raw as Dash;
              command('cellBorder', { border: Object.keys(next).length === 0 ? null : next });
            }}
            {...tipProps({ name: 'Border dash', doc: cellDoc ?? 'The cell’s own dash' })}
          >
            <option value="">Table’s</option>
            {DASHES.map((dash) => (
              <option key={dash} value={dash}>
                {DASH_LABELS[dash]}
              </option>
            ))}
          </select>
        </div>
        <div className="ts-table-row is-wide">
          <span className="ts-table-label">Border color</span>
          <Swatches
            label="Cell border color"
            current={cellBorder?.color}
            control={`${control}.cell.border.color`}
            disabled={busy || !hasCell}
            onPick={(color) => {
              const next: CellBorder = { ...cellBorder };
              if (color === null) delete next.color;
              else next.color = color;
              command('cellBorder', { border: Object.keys(next).length === 0 ? null : next });
            }}
          />
        </div>
        <div className="ts-table-actions">
          <ToolButton
            label="Merge cells"
            title="Merge cells"
            doc={multi ? 'Joins the selected cells into one' : 'Select two or more cells first'}
            control={`${control}.merge`}
            menuItem="format.table.mergeCells"
            disabled={busy || !multi}
            onClick={() => command('merge')}
          />
          <ToolButton
            label="Unmerge cells"
            title="Unmerge cells"
            doc={merged ? 'Splits the merged cells again' : 'Select a merged cell first'}
            control={`${control}.unmerge`}
            menuItem="format.table.unmergeCells"
            disabled={busy || !merged}
            onClick={() => command('unmerge')}
          />
        </div>
      </div>

      <div className="ts-table-group" role="group" aria-label="Rows and columns">
        <span className="ts-table-heading">Rows and columns</span>
        <div className="ts-table-row">
          <span className="ts-table-label">Count</span>
          <input
            type="number"
            className="ts-table-count"
            min={1}
            max={20}
            value={count}
            aria-label="Rows or columns to insert"
            data-control={`${control}.count`}
            disabled={busy}
            onChange={(event) =>
              setCount(Math.max(1, Math.min(20, Math.round(Number(event.target.value)) || 1)))
            }
            {...tipProps({ name: 'Count', doc: 'How many rows or columns the insert buttons add' })}
          />
        </div>
        <div className="ts-table-actions is-grid">
          <ToolButton
            label="Insert row above"
            title="Insert row above"
            doc={cellDoc ?? `Adds ${count} above the cell`}
            control={`${control}.insertRowsAbove`}
            menuItem="format.table.insertRowAbove"
            disabled={busy || !hasCell}
            onClick={() => command('insertRowsAbove', { count })}
          />
          <ToolButton
            label="Insert row below"
            title="Insert row below"
            doc={cellDoc ?? `Adds ${count} below the cell`}
            control={`${control}.insertRowsBelow`}
            menuItem="format.table.insertRowBelow"
            disabled={busy || !hasCell}
            onClick={() => command('insertRowsBelow', { count })}
          />
          <ToolButton
            label="Insert column left"
            title="Insert column left"
            doc={cellDoc ?? `Adds ${count} left of the cell`}
            control={`${control}.insertColumnsLeft`}
            menuItem="format.table.insertColumnLeft"
            disabled={busy || !hasCell}
            onClick={() => command('insertColumnsLeft', { count })}
          />
          <ToolButton
            label="Insert column right"
            title="Insert column right"
            doc={cellDoc ?? `Adds ${count} right of the cell`}
            control={`${control}.insertColumnsRight`}
            menuItem="format.table.insertColumnRight"
            disabled={busy || !hasCell}
            onClick={() => command('insertColumnsRight', { count })}
          />
          <ToolButton
            label="Delete row"
            title="Delete row"
            doc={cellDoc ?? 'Removes the selected rows'}
            control={`${control}.deleteRows`}
            menuItem="format.table.deleteRow"
            disabled={busy || !hasCell}
            onClick={() => command('deleteRows')}
          />
          <ToolButton
            label="Delete column"
            title="Delete column"
            doc={cellDoc ?? 'Removes the selected columns'}
            control={`${control}.deleteColumns`}
            menuItem="format.table.deleteColumn"
            disabled={busy || !hasCell}
            onClick={() => command('deleteColumns')}
          />
        </div>
      </div>
    </div>
  );
}
