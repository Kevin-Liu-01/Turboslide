// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChartBlock } from '@turboslide/schema/blocks/chart';
import { CHART_CELL_EVENT } from '@turboslide/viewer/Editor';

import { ChartSection, chartFormatSlot } from '../inspector/chart';
import { forbiddenWordsIn } from '../menus/strings';

// The Chart data section (gslides-parity SPEC-2 section 5 "Chart data", section 10, 11.5
// chart-grid.test.tsx): the grid with row and column headers; the arrows, Home, End and Tab
// moving the active cell; Enter editing and Esc restoring; a typed value as one chart.setData; a
// series rename and a category rename; Add series and Add category; Remove; the series colour
// swatches; Chart type as chart.setKind with the dropped note; Title, Legend, Number format and
// Show values as block.set; a spreadsheet paste replacing the data; no engineering word in the
// section's text or tooltips; the slot adapter drawing nothing for another block.

afterEach(cleanup);

function chart(): ChartBlock {
  return {
    id: 'c',
    type: 'chart',
    kind: 'column',
    categories: ['Q1', 'Q2'],
    series: [
      { name: 'Docs', values: [10, 20] },
      { name: 'App', values: [5, 6], color: 'green' },
    ],
  };
}

function mount(block: ChartBlock = chart()) {
  const dispatch = vi.fn<(action: string, input: unknown) => Promise<unknown>>(() =>
    Promise.resolve({}),
  );
  const onNotice = vi.fn();
  const view = render(
    <ChartSection block={block} slideId="s" revision={7} dispatch={dispatch} onNotice={onNotice} />,
  );
  return { dispatch, onNotice, view };
}

function cell(row: number, column: number): HTMLElement {
  return document.querySelector(
    `[data-control="formatOptions.chart.cell.${row}.${column}"]`,
  ) as HTMLElement;
}

function editField(): HTMLInputElement {
  return document.querySelector('[data-control="formatOptions.chart.edit"]') as HTMLInputElement;
}

describe('ChartSection', () => {
  it('draws a grid with the categories down the first column and a series per column', () => {
    mount();
    const grid = document.querySelector('[data-control="formatOptions.chart.grid"]') as HTMLElement;
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('aria-label')).toBe('Chart data');
    expect(grid.getAttribute('aria-rowcount')).toBe('3');
    expect(grid.getAttribute('aria-colcount')).toBe('3');
    expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(3);
    expect(document.querySelectorAll('[role="rowheader"]')).toHaveLength(2);
    expect(cell(0, 1).textContent).toContain('Docs');
    expect(cell(1, 0).textContent).toContain('Q1');
    expect(cell(2, 2).textContent).toBe('6');
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(4);
    /* the swatch of a series without a colour is the palette's; App has its own */
    const swatch = document.querySelector(
      '[data-control="formatOptions.chart.series.1.color"]',
    ) as HTMLElement;
    expect(swatch.getAttribute('aria-label')).toBe('App color');
    for (const el of document.querySelectorAll('*')) expect(el.hasAttribute('title')).toBe(false);
  });

  it('moves the active cell with the arrows, Home, End and Tab, one cell in the tab order', () => {
    mount();
    expect(cell(1, 1).getAttribute('aria-selected')).toBe('true');
    expect(cell(1, 1).tabIndex).toBe(0);
    expect(cell(2, 2).tabIndex).toBe(-1);
    fireEvent.keyDown(cell(1, 1), { key: 'ArrowRight' });
    expect(cell(1, 2).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(cell(1, 2));
    fireEvent.keyDown(cell(1, 2), { key: 'ArrowDown' });
    expect(cell(2, 2).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(cell(2, 2), { key: 'Home' });
    expect(cell(2, 0).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(cell(2, 0), { key: 'End' });
    expect(cell(2, 2).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(cell(2, 2), { key: 'ArrowUp' });
    fireEvent.keyDown(cell(1, 2), { key: 'Tab' });
    expect(cell(2, 0).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(cell(2, 0), { key: 'Tab', shiftKey: true });
    expect(cell(1, 2).getAttribute('aria-selected')).toBe('true');
  });

  it('edits a value on Enter, commits it as one chart.setData, and restores it on Esc', () => {
    const { dispatch } = mount();
    fireEvent.keyDown(cell(1, 1), { key: 'Enter' });
    const field = editField();
    expect(field.value).toBe('10');
    fireEvent.change(field, { target: { value: '42' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('chart.setData', {
      slideId: 's',
      blockId: 'c',
      categories: ['Q1', 'Q2'],
      series: [
        { name: 'Docs', values: [42, 20] },
        { name: 'App', values: [5, 6], color: 'green' },
      ],
      baseRevision: 7,
    });
    /* Esc keeps the value */
    fireEvent.keyDown(cell(2, 1), { key: 'Enter' });
    fireEvent.change(editField(), { target: { value: '99' } });
    fireEvent.keyDown(editField(), { key: 'Escape' });
    expect(editField()).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(cell(2, 1).textContent).toBe('20');
    /* typing a digit starts the edit with that digit */
    fireEvent.keyDown(cell(2, 1), { key: '7' });
    expect(editField().value).toBe('7');
    fireEvent.blur(editField());
    expect(dispatch).toHaveBeenCalledTimes(2);
    const series = (dispatch.mock.calls[1]?.[1] as { series: { values: number[] }[] }).series;
    expect(series[0]?.values).toEqual([10, 7]);
  });

  it('refuses a value that is not a number with a sentence and writes nothing', () => {
    const { dispatch, onNotice } = mount();
    fireEvent.keyDown(cell(1, 1), { key: 'Enter' });
    fireEvent.change(editField(), { target: { value: 'ten' } });
    fireEvent.keyDown(editField(), { key: 'Enter' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith('Type a number');
  });

  it('renames a series from the column header and a category from the row header', () => {
    const { dispatch } = mount();
    fireEvent.doubleClick(cell(0, 1));
    fireEvent.change(editField(), { target: { value: 'Documents' } });
    fireEvent.keyDown(editField(), { key: 'Enter' });
    expect((dispatch.mock.calls[0]?.[1] as { series: { name: string }[] }).series[0]?.name).toBe(
      'Documents',
    );
    fireEvent.keyDown(cell(2, 0), { key: 'Enter' });
    fireEvent.change(editField(), { target: { value: 'Second quarter' } });
    fireEvent.keyDown(editField(), { key: 'Enter' });
    expect((dispatch.mock.calls[1]?.[1] as { categories: string[] }).categories).toEqual([
      'Q1',
      'Second quarter',
    ]);
  });

  it('adds a series and a category, removes them, and disables the buttons at the caps', () => {
    const { dispatch } = mount();
    fireEvent.click(
      document.querySelector('[data-control="formatOptions.chart.addSeries"]') as HTMLElement,
    );
    expect((dispatch.mock.calls[0]?.[1] as { series: unknown[] }).series).toHaveLength(3);
    fireEvent.click(
      document.querySelector('[data-control="formatOptions.chart.addCategory"]') as HTMLElement,
    );
    expect((dispatch.mock.calls[1]?.[1] as { categories: string[] }).categories).toEqual([
      'Q1',
      'Q2',
      'Category 3',
    ]);
    fireEvent.click(
      document.querySelector('[data-control="formatOptions.chart.series.0.remove"]') as HTMLElement,
    );
    expect(
      (dispatch.mock.calls[2]?.[1] as { series: { name: string }[] }).series.map((s) => s.name),
    ).toEqual(['App']);
    fireEvent.click(
      document.querySelector(
        '[data-control="formatOptions.chart.category.1.remove"]',
      ) as HTMLElement,
    );
    expect((dispatch.mock.calls[3]?.[1] as { categories: string[] }).categories).toEqual(['Q1']);
    cleanup();
    const pie: ChartBlock = { ...chart(), kind: 'pie', series: [{ name: 'Only', values: [1, 2] }] };
    mount(pie);
    const add = document.querySelector(
      '[data-control="formatOptions.chart.addSeries"]',
    ) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    const remove = document.querySelector(
      '[data-control="formatOptions.chart.series.0.remove"]',
    ) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
  });

  it('picks a series colour from the swatches', () => {
    const { dispatch } = mount();
    fireEvent.click(
      document.querySelector('[data-control="formatOptions.chart.series.0.color"]') as HTMLElement,
    );
    const swatches = document.querySelector(
      '[data-control="formatOptions.chart.swatches"]',
    ) as HTMLElement;
    expect(swatches.getAttribute('role')).toBe('radiogroup');
    fireEvent.click(
      document.querySelector('[data-control="formatOptions.chart.swatches.blue"]') as HTMLElement,
    );
    expect((dispatch.mock.calls[0]?.[1] as { series: { color?: string }[] }).series[0]?.color).toBe(
      'blue',
    );
    expect(document.querySelector('[data-control="formatOptions.chart.swatches"]')).toBeNull();
  });

  it('changes the chart type as chart.setKind and says which series a pie left out', async () => {
    const { dispatch, onNotice } = mount();
    const pie = document.querySelector(
      '[data-control="formatOptions.chart.type.pie"]',
    ) as HTMLElement;
    fireEvent.click(pie);
    expect(dispatch).toHaveBeenLastCalledWith('chart.setKind', {
      slideId: 's',
      blockId: 'c',
      kind: 'pie',
      baseRevision: 7,
    });
    await Promise.resolve();
    expect(onNotice).toHaveBeenCalledWith('The pie chart keeps its first series; App was left out');
  });

  it('writes the title, the legend, the number format and Show values as block.set, nothing for a default', () => {
    const { dispatch } = mount();
    const title = document.querySelector(
      '[data-control="formatOptions.chart.title"]',
    ) as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Revenue' } });
    fireEvent.blur(title);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 'c',
      path: '/title',
      value: 'Revenue',
      baseRevision: 7,
    });
    const legend = document.querySelector(
      '[data-control="formatOptions.chart.legend"]',
    ) as HTMLSelectElement;
    expect(Array.from(legend.options).map((option) => option.textContent)).toEqual([
      'None',
      'Right',
      'Bottom',
      'Top',
      'Left',
    ]);
    fireEvent.change(legend, { target: { value: 'none' } });
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 'c',
      path: '/legend',
      value: 'none',
      baseRevision: 7,
    });
    fireEvent.change(legend, { target: { value: 'right' } });
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 'c',
      path: '/legend',
      baseRevision: 7,
    });
    const format = document.querySelector(
      '[data-control="formatOptions.chart.numberFormat"]',
    ) as HTMLSelectElement;
    fireEvent.change(format, { target: { value: 'percent' } });
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 'c',
      path: '/numberFormat',
      value: 'percent',
      baseRevision: 7,
    });
    const values = document.querySelector(
      '[data-control="formatOptions.chart.showValues"]',
    ) as HTMLInputElement;
    fireEvent.click(values);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 's',
      blockId: 'c',
      path: '/labels',
      value: true,
      baseRevision: 7,
    });
  });

  it('shows the values in the chart’s number format', () => {
    mount({ ...chart(), numberFormat: 'currency', series: [{ name: 'A', values: [1200, 5] }] });
    expect(cell(1, 1).textContent).toBe('$1,200');
  });

  it('replaces the data with a paste of tab separated rows from a spreadsheet', () => {
    const { dispatch } = mount();
    const grid = document.querySelector('[data-control="formatOptions.chart.grid"]') as HTMLElement;
    fireEvent.paste(grid, {
      clipboardData: { getData: () => '\tNorth\tSouth\nJan\t1\t2\nFeb\t3\t4\n' },
    });
    expect(dispatch).toHaveBeenLastCalledWith('chart.setData', {
      slideId: 's',
      blockId: 'c',
      categories: ['Jan', 'Feb'],
      series: [
        { name: 'North', values: [1, 3] },
        { name: 'South', values: [2, 4], color: 'green' },
      ],
      baseRevision: 7,
    });
    /* a paste with no numbers leaves the data alone */
    fireEvent.paste(grid, { clipboardData: { getData: () => 'hello' } });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('uses no engineering word in its text or tooltips', () => {
    mount();
    const root = document.querySelector('[data-control="formatOptions.chart"]') as HTMLElement;
    const texts = [root.textContent ?? ''];
    for (const el of root.querySelectorAll('[data-tip], [aria-label]')) {
      texts.push(el.getAttribute('data-tip') ?? '', el.getAttribute('aria-label') ?? '');
    }
    for (const text of texts) expect(forbiddenWordsIn(text)).toEqual([]);
  });

  it('the slot adapter draws the section for a chart and nothing for another block', () => {
    const dispatch = vi.fn<(action: string, input: unknown) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const props = { slide: { id: 's' }, revision: 1, dispatch };
    const { container, unmount } = render(<>{chartFormatSlot({ ...props, block: chart() })}</>);
    expect(container.querySelector('[data-control="formatOptions.chart"]')).not.toBeNull();
    unmount();
    const other = render(
      <>{chartFormatSlot({ ...props, block: { id: 't', type: 'text', text: 'Hi' } })}</>,
    );
    expect(other.container.querySelector('[data-control="formatOptions.chart"]')).toBeNull();
  });
});

describe('the grid owns its keys and shows its remove controls (docs/FEATURES.md 2.2 ranks 1, 7 and 12)', () => {
  it('Escape on the active cell with no open field leaves the grid and keeps the section drawn', () => {
    const { dispatch } = mount();
    const target = cell(1, 1);
    target.focus();
    expect(document.activeElement).toBe(target);
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(document.activeElement).not.toBe(target);
    expect(document.querySelector('[data-control="formatOptions.chart.grid"]')).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('marks the active cell’s row and column headers so their remove controls are drawn without a hover', () => {
    mount();
    fireEvent.click(cell(2, 2));
    expect(cell(2, 0).classList.contains('is-active-line')).toBe(true);
    expect(cell(0, 2).classList.contains('is-active-line')).toBe(true);
    expect(cell(1, 0).classList.contains('is-active-line')).toBe(false);
    expect(cell(0, 1).classList.contains('is-active-line')).toBe(false);
    expect(cell(0, 0).classList.contains('is-active-line')).toBe(false);
  });

  it('a right click on a series header lists Remove and removes the series as one chart.setData', () => {
    const { dispatch } = mount();
    fireEvent.contextMenu(cell(0, 1), { clientX: 40, clientY: 50 });
    const menu = document.querySelector('[data-control="formatOptions.chart.menu"]') as HTMLElement;
    expect(menu.getAttribute('role')).toBe('menu');
    const row = document.querySelector(
      '[data-control="formatOptions.chart.menu.remove"]',
    ) as HTMLButtonElement;
    expect(row.textContent).toBe('Remove Docs');
    fireEvent.click(row);
    expect(document.querySelector('[data-control="formatOptions.chart.menu"]')).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const series = (dispatch.mock.calls[0]?.[1] as { series: { name: string }[] }).series;
    expect(series.map((each) => each.name)).toEqual(['App']);
    /* a category header the same way; Escape closes the menu without a write */
    fireEvent.contextMenu(cell(2, 0), { clientX: 40, clientY: 90 });
    expect(
      document.querySelector('[data-control="formatOptions.chart.menu.remove"]')?.textContent,
    ).toBe('Remove Q2');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-control="formatOptions.chart.menu"]')).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('makes the cell the stage names active, mounted or mounting (rank 7)', () => {
    const { view } = mount();
    const ask = (blockId: string, row: number, column: number) =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent(CHART_CELL_EVENT, {
            detail: { deckId: 'd', slideId: 's', blockId, row, column, open: true },
          }),
        );
      });
    ask('c', 2, 2);
    expect(cell(2, 2).getAttribute('aria-selected')).toBe('true');
    /* another chart's request changes nothing here */
    ask('other', 1, 1);
    expect(cell(2, 2).getAttribute('aria-selected')).toBe('true');
    view.unmount();
    /* a request before the section mounts is read on mount, clamped into the grid */
    window.dispatchEvent(
      new CustomEvent(CHART_CELL_EVENT, {
        detail: { deckId: 'd', slideId: 's', blockId: 'c', row: 9, column: 1, open: true },
      }),
    );
    mount();
    expect(cell(2, 1).getAttribute('aria-selected')).toBe('true');
  });
});

