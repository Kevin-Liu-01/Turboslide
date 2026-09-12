import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useState } from 'react';

import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, emptyTable } from '@turboslide/schema/blocks/table';

import { Dialog } from '../Dialog';
import { factsOf, insertBlockPlan } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Insert > Table (gslides-parity SPEC 2.4, 7.3): Google's grid picker. Pointing at a cell
 * highlights the columns and rows up to it and the caption reads the size; a click inserts an
 * empty table of that size with a header row through one `block.insert` into the current slot
 * (after the selected block; with the 960 by 320 box on a freeform slide). The grid is one
 * control: the arrow keys move the highlight, Enter inserts, Esc cancels (the dialog's). The
 * cells carry `dialog.insertTable.pick.<columns>x<rows>` for the window API. A slide whose
 * layout has no place for a table shows the sentence in the dialog instead of a write.
 */
export function InsertTableDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [pick, setPick] = useState({ columns: 1, rows: 1 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const words = DIALOGS.insertTable;

  const insert = (columns: number, rows: number) => {
    if (busy) return;
    const plan = insertBlockPlan(
      factsOf(input, shell.lastLayout),
      'table',
      (id) => emptyTable(id, columns, rows),
      words.title,
    );
    if ('refused' in plan) {
      setError(plan.refused);
      return;
    }
    setBusy(true);
    input
      .dispatch(plan.action, plan.input)
      .then(() => shell.closeDialog())
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const onGridKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let { columns, rows } = pick;
    switch (event.key) {
      case 'ArrowRight':
        columns = Math.min(TABLE_MAX_COLUMNS, columns + 1);
        break;
      case 'ArrowLeft':
        columns = Math.max(1, columns - 1);
        break;
      case 'ArrowDown':
        rows = Math.min(TABLE_MAX_ROWS, rows + 1);
        break;
      case 'ArrowUp':
        rows = Math.max(1, rows - 1);
        break;
      case 'Home':
        columns = 1;
        rows = 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        insert(pick.columns, pick.rows);
        return;
      default:
        return;
    }
    event.preventDefault();
    setPick({ columns, rows });
  };

  const gridTip = tipProps({
    name: words.grid,
    doc: 'Point at the size and click it; the arrow keys move the highlight',
    key: 'Enter',
  });
  const activeId = `ts-tablegrid-${pick.columns}x${pick.rows}`;

  return (
    <Dialog
      title={words.title}
      lead={words.lead}
      onClose={shell.closeDialog}
      width={444}
      control="dialog.insertTable"
    >
      <div
        className="ts-tablegrid"
        role="grid"
        aria-label={words.grid}
        aria-activedescendant={activeId}
        aria-rowcount={TABLE_MAX_ROWS}
        aria-colcount={TABLE_MAX_COLUMNS}
        tabIndex={0}
        data-control="dialog.insertTable.grid"
        {...gridTip}
        onKeyDown={(event) => {
          gridTip.onKeyDown(event);
          onGridKey(event);
        }}
        onMouseLeave={() => setPick({ columns: 1, rows: 1 })}
      >
        {Array.from({ length: TABLE_MAX_ROWS }, (_, r) => r + 1).map((rows) => (
          <div key={rows} className="ts-tablegrid-row" role="row">
            {Array.from({ length: TABLE_MAX_COLUMNS }, (_, c) => c + 1).map((columns) => (
              <div
                key={columns}
                id={`ts-tablegrid-${columns}x${rows}`}
                role="gridcell"
                aria-label={words.cell(columns, rows)}
                aria-selected={columns === pick.columns && rows === pick.rows}
                className={cn(
                  'ts-tablegrid-cell',
                  columns <= pick.columns && rows <= pick.rows && 'is-in',
                )}
                data-control={`dialog.insertTable.pick.${columns}x${rows}`}
                onMouseEnter={() => setPick({ columns, rows })}
                onClick={() => insert(columns, rows)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="ts-tablegrid-size" aria-live="polite" data-control="dialog.insertTable.size">
        {words.size(pick.columns, pick.rows)}
      </p>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
