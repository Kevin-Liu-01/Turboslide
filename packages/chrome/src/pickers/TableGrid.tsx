import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '@turboslide/schema/blocks/table';

import { cn } from '../lib/cn';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './TableGrid.css';

/**
 * Insert > Table (gslides-parity SPEC-2 0.26, 4.1, 6): Google's hover grid as a plate inside the
 * Insert menu, in place of the round one dialog. A 20 by 20 grid of 14 px cells; the highlight
 * follows the pointer and the caption reads "4 x 3"; the arrows move the highlight, Enter or a
 * click inserts, Esc closes the plate (the menu's own key). The grid is one focusable control
 * (`role="grid"` with `gridcell` rows carrying "4 columns by 3 rows" as their name) so a keyboard
 * user picks a size without the mouse; ArrowLeft on the first column is left to the menu, which
 * closes the plate back to its row. The cells carry `insert.table.pick.<columns>x<rows>` for the
 * window API and the parity audit. The caller makes the write (one `block.insert` of an empty
 * table with a header row into the slide's objects, or the freeform slot).
 */
export type TableGridProps = {
  onPick: (columns: number, rows: number) => void;
  /** the plate was opened from the keyboard: the grid takes focus on mount */
  autoFocus?: boolean;
  /** the `data-control` prefix of the grid and its cells */
  control?: string;
};

export function TableGrid({ onPick, autoFocus = false, control = 'insert.table' }: TableGridProps) {
  const root = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState({ columns: 1, rows: 1 });
  const words = PICKERS.tableGrid;

  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let { columns, rows } = pick;
    switch (event.key) {
      case 'ArrowRight':
        columns = Math.min(TABLE_MAX_COLUMNS, columns + 1);
        break;
      case 'ArrowLeft':
        /* on the first column the menu takes the key and closes the plate back to its row */
        if (columns === 1) return;
        columns -= 1;
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
      case 'End':
        columns = TABLE_MAX_COLUMNS;
        rows = TABLE_MAX_ROWS;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        onPick(pick.columns, pick.rows);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPick({ columns, rows });
  };

  const tip = tipProps({ name: words.grid, doc: words.doc, key: 'Enter' });
  const activeId = `ts-tablegrid-${pick.columns}x${pick.rows}`;

  return (
    <div className="ts-tablegrid-plate" data-control={`${control}.plate`}>
      <div
        ref={root}
        className="ts-tablegrid"
        role="grid"
        aria-label={words.grid}
        aria-activedescendant={activeId}
        aria-rowcount={TABLE_MAX_ROWS}
        aria-colcount={TABLE_MAX_COLUMNS}
        tabIndex={0}
        data-control={`${control}.grid`}
        {...tip}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
          onKey(event);
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
                data-control={`${control}.pick.${columns}x${rows}`}
                onMouseEnter={() => setPick({ columns, rows })}
                onClick={(event) => {
                  event.stopPropagation();
                  onPick(columns, rows);
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="ts-tablegrid-size" aria-live="polite" data-control={`${control}.size`}>
        {words.size(pick.columns, pick.rows)}
      </p>
    </div>
  );
}
