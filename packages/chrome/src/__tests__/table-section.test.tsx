// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import { emptyTable } from '@turboslide/schema/blocks/table';

import { TableSection, tableFormatSlot } from '../inspector/table';
import { forbiddenWordsIn } from '../menus/strings';

// The Table section (gslides-parity SPEC-2 section 5 "Table", 2.7, 11.5 table-section.test):
// the header row toggle; the table border weight with None for Google's Transparent, dash and
// colour as one block.set /border; the row heights list writing /rows; Distribute rows and
// columns as table.distribute; the selected cell's fill and border as table.cellStyle; Merge and
// Unmerge enabled by the selection and written as table.merge and table.unmerge; the insert and
// delete rows and columns with a count; every write through the editor's tableCommand when the
// shell passes one; no engineering word; the slot adapter.

afterEach(cleanup);

function table(): TableBlock {
  const block = emptyTable('t', 3, 3);
  return {
    ...block,
    rows: block.rows.map((row, index) => (index === 1 ? { ...row, height: 56 } : row)),
    spans: [{ row: 1, column: 1, rows: 1, columns: 2 }],
    cells: [{ row: 0, column: 0, fill: 'plate', border: { weight: 0 } }],
  };
}

type Selection = {
  cell?: { row: number; column: number };
  cells?: { r0: number; c0: number; r1: number; c1: number };
};

function mount(
  selection: Selection | null = { cell: { row: 0, column: 0 } },
  block: TableBlock = table(),
  editor?: { tableCommand: ReturnType<typeof vi.fn> },
) {
  const dispatch = vi.fn<(action: string, input: unknown) => Promise<unknown>>(() =>
    Promise.resolve({}),
  );
  const onNotice = vi.fn();
  render(
    <TableSection
      block={block}
      slideId="s"
      revision={3}
      dispatch={dispatch}
      selection={selection}
      editor={editor as never}
      onNotice={onNotice}
    />,
  );
  return { dispatch, onNotice };
}

function control(id: string): HTMLElement {
  return document.querySelector(`[data-control="formatOptions.table.${id}"]`) as HTMLElement;
}

describe('TableSection', () => {
  it('toggles the header row as one block.set /rows', () => {
    const { dispatch } = mount();
    const header = control('headerRow') as HTMLInputElement;
    expect(header.checked).toBe(true);
    fireEvent.click(header);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 't',
      path: '/rows',
      value: table().rows.map((row, index) => {
        if (index !== 0) return row;
        const { header: _header, ...rest } = row;
        return rest;
      }),
      baseRevision: 3,
    });
  });

  it('writes the table border weight with None as 0, the dash and the colour over the current border', () => {
    const { dispatch } = mount(null, { ...table(), border: { weight: 1, color: 'ink' } });
    const weight = control('border.weight') as HTMLSelectElement;
    expect(Array.from(weight.options).map((option) => option.textContent)).toEqual([
      'None',
      '1 px',
      '1.5 px',
      '2 px',
    ]);
    fireEvent.change(weight, { target: { value: '0' } });
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 't',
      path: '/border',
      value: { weight: 0, color: 'ink' },
      baseRevision: 3,
    });
    fireEvent.change(control('border.dash') as HTMLSelectElement, { target: { value: 'dot' } });
    expect((dispatch.mock.calls[1]?.[1] as { value: unknown }).value).toEqual({
      weight: 1,
      color: 'ink',
      dash: 'dot',
    });
    fireEvent.click(control('border.color.blue'));
    expect((dispatch.mock.calls[2]?.[1] as { value: unknown }).value).toEqual({
      weight: 1,
      color: 'blue',
    });
    fireEvent.click(control('border.color.none'));
    expect((dispatch.mock.calls[3]?.[1] as { value: unknown }).value).toEqual({ weight: 1 });
  });

  it('lists the row heights and writes a typed height, an empty field clearing it', () => {
    const { dispatch } = mount();
    const first = control('rowHeight.0') as HTMLInputElement;
    const second = control('rowHeight.1') as HTMLInputElement;
    expect(first.value).toBe('');
    expect(second.value).toBe('56');
    fireEvent.change(first, { target: { value: '72' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    fireEvent.blur(first);
    const rows = dispatch.mock.calls[0]?.[1] as { path: string; value: { height?: number }[] };
    expect(rows.path).toBe('/rows');
    expect(rows.value[0]?.height).toBe(72);
    fireEvent.change(second, { target: { value: '' } });
    fireEvent.blur(second);
    expect(
      (dispatch.mock.calls[1]?.[1] as { value: { height?: number }[] }).value[1]?.height,
    ).toBeUndefined();
  });

  it('distributes rows and columns as table.distribute', () => {
    const { dispatch } = mount();
    fireEvent.click(control('distributeRows'));
    expect(dispatch).toHaveBeenLastCalledWith('table.distribute', {
      slideId: 's',
      blockId: 't',
      axis: 'rows',
      baseRevision: 3,
    });
    fireEvent.click(control('distributeColumns'));
    expect(dispatch).toHaveBeenLastCalledWith('table.distribute', {
      slideId: 's',
      blockId: 't',
      axis: 'columns',
      baseRevision: 3,
    });
    expect(control('distributeRows').getAttribute('data-menu-item')).toBe(
      'format.table.distributeRows',
    );
  });

  it('styles the selected cell: fill and border as table.cellStyle, Transparent as weight 0', () => {
    const { dispatch } = mount({ cell: { row: 2, column: 2 } });
    fireEvent.click(control('cell.fill.plate'));
    expect(dispatch).toHaveBeenLastCalledWith('table.cellStyle', {
      slideId: 's',
      blockId: 't',
      cells: [[2, 2]],
      fill: 'plate',
      baseRevision: 3,
    });
    fireEvent.change(control('cell.border.weight') as HTMLSelectElement, {
      target: { value: '0' },
    });
    expect(dispatch).toHaveBeenLastCalledWith('table.cellStyle', {
      slideId: 's',
      blockId: 't',
      cells: [[2, 2]],
      border: { weight: 0 },
      baseRevision: 3,
    });
    fireEvent.click(control('cell.border.color.ink'));
    expect(dispatch).toHaveBeenLastCalledWith('table.cellStyle', {
      slideId: 's',
      blockId: 't',
      cells: [[2, 2]],
      border: { color: 'ink' },
      baseRevision: 3,
    });
    fireEvent.click(control('cell.fill.none'));
    expect(dispatch).toHaveBeenLastCalledWith('table.cellStyle', {
      slideId: 's',
      blockId: 't',
      cells: [[2, 2]],
      fill: null,
      baseRevision: 3,
    });
  });

  it('shows the selected cell’s own fill and border, and a range styles every cell of it', () => {
    const { dispatch } = mount({ cell: { row: 0, column: 0 } });
    expect(control('cell.fill.plate').getAttribute('aria-checked')).toBe('true');
    expect((control('cell.border.weight') as HTMLSelectElement).value).toBe('0');
    cleanup();
    const range = mount({ cells: { r0: 0, c0: 0, r1: 0, c1: 2 } });
    fireEvent.click(control('cell.fill.blue'));
    expect(range.dispatch).toHaveBeenLastCalledWith('table.cellStyle', {
      slideId: 's',
      blockId: 't',
      cells: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      fill: 'blue',
      baseRevision: 3,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('merges a range and unmerges the merged cells, disabled otherwise', () => {
    mount({ cell: { row: 0, column: 0 } });
    expect((control('merge') as HTMLButtonElement).disabled).toBe(true);
    expect((control('unmerge') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const range = mount({ cells: { r0: 0, c0: 0, r1: 0, c1: 1 } });
    expect((control('merge') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(control('merge'));
    expect(range.dispatch).toHaveBeenLastCalledWith('table.merge', {
      slideId: 's',
      blockId: 't',
      from: [0, 0],
      to: [0, 1],
      baseRevision: 3,
    });
    cleanup();
    const merged = mount({ cell: { row: 1, column: 2 } });
    expect((control('unmerge') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(control('unmerge'));
    expect(merged.dispatch).toHaveBeenLastCalledWith('table.unmerge', {
      slideId: 's',
      blockId: 't',
      at: [1, 1],
      baseRevision: 3,
    });
  });

  it('inserts and deletes rows and columns at the cell with the count field', () => {
    const { dispatch } = mount({ cell: { row: 1, column: 1 } });
    fireEvent.change(control('count'), { target: { value: '2' } });
    fireEvent.click(control('insertRowsBelow'));
    expect(dispatch).toHaveBeenLastCalledWith('table.insertRows', {
      slideId: 's',
      blockId: 't',
      at: 1,
      count: 2,
      where: 'below',
      baseRevision: 3,
    });
    /* the count applies to columns too */
    fireEvent.click(control('insertColumnsLeft'));
    expect(dispatch).toHaveBeenLastCalledWith('table.insertColumns', {
      slideId: 's',
      blockId: 't',
      at: 1,
      count: 2,
      where: 'left',
      baseRevision: 3,
    });
    fireEvent.click(control('deleteRows'));
    expect(dispatch).toHaveBeenLastCalledWith('table.deleteRows', {
      slideId: 's',
      blockId: 't',
      from: 1,
      baseRevision: 3,
    });
    fireEvent.click(control('deleteColumns'));
    /* the caret in the merged cells deletes their two columns */
    expect(dispatch).toHaveBeenLastCalledWith('table.deleteColumns', {
      slideId: 's',
      blockId: 't',
      from: 1,
      to: 2,
      baseRevision: 3,
    });
    expect(control('insertRowsAbove').getAttribute('data-menu-item')).toBe(
      'format.table.insertRowAbove',
    );
  });

  it('asks for a cell first when none is selected', () => {
    mount(null);
    expect(document.body.textContent).toContain('Click a table cell first');
    expect((control('insertRowsAbove') as HTMLButtonElement).disabled).toBe(true);
    expect((control('cell.fill.plate') as HTMLButtonElement).disabled).toBe(true);
    /* the table border and the heights still work */
    expect((control('border.weight') as HTMLSelectElement).disabled).toBe(false);
  });

  it('runs every plan through the editor’s tableCommand when the shell passes one', () => {
    const tableCommand = vi.fn();
    const { dispatch } = mount({ cells: { r0: 0, c0: 0, r1: 1, c1: 0 } }, table(), {
      tableCommand,
    });
    fireEvent.click(control('merge'));
    expect(tableCommand).toHaveBeenCalledWith({
      action: 'table.merge',
      input: { slideId: 's', blockId: 't', from: [0, 0], to: [1, 0], baseRevision: 3 },
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses no engineering word in its text or tooltips', () => {
    mount({ cells: { r0: 0, c0: 0, r1: 1, c1: 1 } });
    const root = document.querySelector('[data-control="formatOptions.table"]') as HTMLElement;
    const texts = [root.textContent ?? ''];
    for (const el of root.querySelectorAll('[data-tip], [aria-label]')) {
      texts.push(el.getAttribute('data-tip') ?? '', el.getAttribute('aria-label') ?? '');
    }
    for (const text of texts) expect(forbiddenWordsIn(text)).toEqual([]);
    for (const el of root.querySelectorAll('*')) expect(el.hasAttribute('title')).toBe(false);
  });

  it('the slot adapter draws the section for a table and nothing for another block', () => {
    const dispatch = vi.fn<(action: string, input: unknown) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const props = { slide: { id: 's' }, revision: 1, dispatch };
    const { container, unmount } = render(<>{tableFormatSlot({ ...props, block: table() })}</>);
    expect(container.querySelector('[data-control="formatOptions.table"]')).not.toBeNull();
    unmount();
    const other = render(
      <>{tableFormatSlot({ ...props, block: { id: 'x', type: 'text', text: 'Hi' } })}</>,
    );
    expect(other.container.querySelector('[data-control="formatOptions.table"]')).toBeNull();
  });
});
