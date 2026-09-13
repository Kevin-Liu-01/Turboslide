// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '@turboslide/schema/blocks/table';

import { TableGrid } from '../pickers/TableGrid';

// Insert > Table's hover grid (gslides-parity SPEC-2 0.26, 6.2, section 10): a 20 by 20 grid of
// gridcells named "4 columns by 3 rows", the highlight following the pointer with the caption
// "4 x 3", the arrows, Home and End moving the highlight, Enter and a click picking, ArrowLeft on
// the first column left to the menu, and the grid taking focus when the plate opened from the
// keyboard.

afterEach(cleanup);

function grid(): HTMLElement {
  return document.querySelector('[data-control="insert.table.grid"]') as HTMLElement;
}

function caption(): string {
  return document.querySelector('[data-control="insert.table.size"]')?.textContent ?? '';
}

describe('TableGrid', () => {
  it('draws 400 named cells and follows the pointer with the caption', () => {
    render(<TableGrid onPick={() => undefined} />);
    expect(grid().getAttribute('role')).toBe('grid');
    expect(grid().getAttribute('aria-label')).toBe('Table size');
    expect(grid().getAttribute('aria-rowcount')).toBe(String(TABLE_MAX_ROWS));
    expect(grid().getAttribute('aria-colcount')).toBe(String(TABLE_MAX_COLUMNS));
    const cells = document.querySelectorAll('[role="gridcell"]');
    expect(cells).toHaveLength(400);
    const cell = document.querySelector('[data-control="insert.table.pick.4x3"]') as HTMLElement;
    expect(cell.getAttribute('aria-label')).toBe('4 columns by 3 rows');
    expect(caption()).toBe('1 x 1');
    fireEvent.mouseEnter(cell);
    expect(caption()).toBe('4 x 3');
    expect(document.querySelectorAll('.ts-tablegrid-cell.is-in')).toHaveLength(12);
    expect(cell.getAttribute('aria-selected')).toBe('true');
    expect(grid().getAttribute('aria-activedescendant')).toBe('ts-tablegrid-4x3');
    /* leaving the grid returns the highlight to one cell */
    fireEvent.mouseLeave(grid());
    expect(caption()).toBe('1 x 1');
    for (const el of document.querySelectorAll('*')) expect(el.hasAttribute('title')).toBe(false);
  });

  it('picks on a click and on Enter, and moves the highlight with the arrows, Home and End', () => {
    const onPick = vi.fn();
    render(<TableGrid onPick={onPick} />);
    fireEvent.click(
      document.querySelector('[data-control="insert.table.pick.2x5"]') as HTMLElement,
    );
    expect(onPick).toHaveBeenLastCalledWith(2, 5);
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    expect(caption()).toBe('3 x 2');
    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    fireEvent.keyDown(grid(), { key: 'ArrowLeft' });
    expect(caption()).toBe('2 x 1');
    fireEvent.keyDown(grid(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith(2, 1);
    fireEvent.keyDown(grid(), { key: 'End' });
    expect(caption()).toBe(`${TABLE_MAX_COLUMNS} x ${TABLE_MAX_ROWS}`);
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    expect(caption()).toBe(`${TABLE_MAX_COLUMNS} x ${TABLE_MAX_ROWS}`);
    fireEvent.keyDown(grid(), { key: 'Home' });
    expect(caption()).toBe('1 x 1');
    fireEvent.keyDown(grid(), { key: ' ' });
    expect(onPick).toHaveBeenLastCalledWith(1, 1);
  });

  it('leaves ArrowLeft on the first column to the menu, which closes the plate back to its row', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <TableGrid onPick={() => undefined} />
      </div>,
    );
    fireEvent.keyDown(grid(), { key: 'ArrowLeft' });
    expect(outer).toHaveBeenCalledTimes(1);
    expect(caption()).toBe('1 x 1');
    /* a handled arrow stops at the grid */
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    expect(outer).toHaveBeenCalledTimes(1);
    expect(caption()).toBe('2 x 1');
  });

  it('takes focus when the plate opened from the keyboard, and not when the pointer opened it', () => {
    const { unmount } = render(<TableGrid onPick={() => undefined} autoFocus />);
    expect(document.activeElement).toBe(grid());
    unmount();
    render(<TableGrid onPick={() => undefined} />);
    expect(document.activeElement).not.toBe(grid());
    expect(grid().tabIndex).toBe(0);
  });
});
