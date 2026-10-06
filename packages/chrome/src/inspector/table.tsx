import type { ReactNode } from 'react';
import { useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { CellBorder, TableBlock, TableBorderWeight } from '@turboslide/schema/blocks/table';
import { TABLE_BORDER_WEIGHTS, tableRuleWeight } from '@turboslide/schema/blocks/table';
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
  isHeaderRow,
  isMergedAnchor,
  isMultiCell,
  rangeOf,
  tablePlan,
  tableWriteInput,
} from '../table-tools';
import type { TableCommandId, TablePlan, TableSelection } from '../table-tools';
import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';
import { swatchPaint, useDeckTokens } from './palette';

import './table.css';

/**
 * The Table section of Format options (gslides-parity SPEC-2 section 5 "Table", 2.7; R11 A5, A6;
 * R05 A6; docs/archive/rounds/OBJECTS.md 3.3 item 6): the words a seller reads, each property once, in this
 * order: Header row (a check), Border (the table's rules: weight with Google's Transparent as
 * None, dash, colour), Rows (one Height field for the selected row or range, Distribute rows),
 * Columns (Distribute columns), Cell (the caret's cell or the range: Fill, Border), Merge (Merge
 * cells, Unmerge cells; the sentence under a disabled button says why). The inserts and deletes
 * left the panel with the objects round: the "+" on the table's edges, the row and column heads
 * and the right click menus carry them (Overlay.tsx, TableOverlay.tsx). Every control is one plan
 * of table-tools.ts dispatched as the action of SPEC-2 section 3, through the editor's
 * `tableCommand` when the shell passes one (so the stage keeps the caret), else straight to the
 * dispatcher. Mounted by FormatOptions through its slots (`tableFormatSlot`) when the selected
 * block is a table; the generated table fields stay behind Tools > Advanced tools (rank 11).
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
  /** the table's measured height in sheet px: Distribute rows then shares the box as it stands (objects/build/b2.md 2d) */
  boxHeight?: number;
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
  boxHeight?: number;
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
      boxHeight={props.boxHeight}
    />
  );
}

/** The sentences under the disabled merge buttons (docs/archive/rounds/OBJECTS.md 3.3 item 6). */
export const MERGE_NEEDS_CELLS = 'Select two cells or more to merge';
export const UNMERGE_NEEDS_MERGED = 'Select a merged cell to unmerge';

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
  const deckColors = useDeckTokens();
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
          style={{ background: swatchPaint(token, deckColors) }}
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
  boxHeight,
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
  /* the Height field's draft while it is typed (docs/archive/rounds/FEATURES.md 2.2 rank 13) */
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
        ? `Height of row ${range.r0 + 1}`
        : `Height of rows ${range.r0 + 1} to ${range.r1 + 1}`;

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

  const border = block.border;
  const cellBorder: CellBorder | undefined = cellStyle.border;
  const cellDoc = hasCell ? undefined : SELECT_CELL;
  const heightTip = tipProps({
    name: 'Height',
    doc: 'The selected rows in px; empty takes the content height',
    key: 'Enter',
  });
  const cellWords =
    range === null
      ? null
      : multi
        ? `Cells ${range.r0 + 1},${range.c0 + 1} to ${range.r1 + 1},${range.c1 + 1}`
        : `Cell ${range.r0 + 1},${range.c0 + 1}`;

  return (
    <div className="ts-table-section" data-control={control}>
      <label className="ts-table-row is-check">
        <input
          type="checkbox"
          checked={isHeaderRow(block)}
          aria-label="Header row"
          data-control={`${control}.headerRow`}
          disabled={busy}
          onChange={() => command('toggleHeader')}
          {...tipProps({
            name: 'Header row',
            doc: 'The first row at display weight with a rule under it',
          })}
        />
        <span className="ts-table-label">Header row</span>
      </label>

      <div className="ts-table-group" role="group" aria-label="Border" data-group="border">
        <span className="ts-table-heading">Border</span>
        <div className="ts-table-row">
          <span className="ts-table-label">Weight</span>
          <select
            className="ts-ctl-select"
            aria-label="Border weight"
            data-control={`${control}.border.weight`}
            value={String(border?.weight ?? 1)}
            disabled={busy}
            onChange={(event) =>
              command('tableBorder', {
                border: { weight: Number(event.target.value) as TableBorderWeight },
              })
            }
            {...tipProps({
              name: 'Weight',
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
          <span className="ts-table-label">Dash</span>
          <select
            className="ts-ctl-select"
            aria-label="Border dash"
            data-control={`${control}.border.dash`}
            value={border?.dash ?? 'solid'}
            disabled={busy}
            onChange={(event) =>
              command('tableBorder', { border: { dash: event.target.value as Dash } })
            }
            {...tipProps({ name: 'Dash', doc: 'Solid or one of the five dashes' })}
          >
            {DASHES.map((dash) => (
              <option key={dash} value={dash}>
                {DASH_LABELS[dash]}
              </option>
            ))}
          </select>
        </div>
        <div className="ts-table-row is-wide">
          <span className="ts-table-label">Color</span>
          <Swatches
            label="Border color"
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

      <div className="ts-table-group" role="group" aria-label="Rows" data-group="rows">
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
              run(
                tablePlan(
                  block,
                  hasCell ? tableSelection : { cell: [0, 0] },
                  'distributeRows',
                  /* the rows share the box as it stands: the drawn height less the rule above
                     the first row (objects/build/b2.md 2d); without a measure the sizes clear */
                  boxHeight === undefined
                    ? {}
                    : { total: Math.max(1, Math.round(boxHeight - tableRuleWeight(block))) },
                ),
              )
            }
          />
        </div>
      </div>

      <div className="ts-table-group" role="group" aria-label="Columns" data-group="columns">
        <span className="ts-table-heading">Columns</span>
        <div className="ts-table-actions">
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

      <div className="ts-table-group" role="group" aria-label="Cell" data-group="cell">
        <span className="ts-table-heading">
          Cell
          {cellWords !== null ? <span className="ts-table-heading-detail">{cellWords}</span> : null}
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
              doc: cellDoc ?? 'The cell’s own rule; None draws no border',
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
      </div>

      <div className="ts-table-group" role="group" aria-label="Merge" data-group="merge">
        <span className="ts-table-heading">Merge</span>
        <div className="ts-table-actions">
          <ToolButton
            label="Merge cells"
            title="Merge cells"
            doc={multi ? 'Joins the selected cells into one' : MERGE_NEEDS_CELLS}
            control={`${control}.merge`}
            menuItem="format.table.mergeCells"
            disabled={busy || !multi}
            onClick={() => command('merge')}
          />
          <ToolButton
            label="Unmerge cells"
            title="Unmerge cells"
            doc={merged ? 'Splits the merged cells again' : UNMERGE_NEEDS_MERGED}
            control={`${control}.unmerge`}
            menuItem="format.table.unmergeCells"
            disabled={busy || !merged}
            onClick={() => command('unmerge')}
          />
        </div>
        {!multi ? (
          <p className="ts-table-note" data-for={`${control}.merge`}>
            {MERGE_NEEDS_CELLS}
          </p>
        ) : null}
        {!merged ? (
          <p className="ts-table-note" data-for={`${control}.unmerge`}>
            {UNMERGE_NEEDS_MERGED}
          </p>
        ) : null}
      </div>
    </div>
  );
}
