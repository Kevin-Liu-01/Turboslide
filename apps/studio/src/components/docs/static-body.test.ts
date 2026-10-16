// @vitest-environment jsdom
import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DOCS_COMPONENTS } from './mdx';
import { markTable, watchTables } from './static-body';

// A docs table (mdx.tsx Table, static-body.ts watchTables; post-merge review): every table was a
// region with tabindex 0, so /docs/reference/block at 1440 px had 43 Tab stops that scroll
// nothing and 43 landmarks of one name. The server writes the table's name in `data-label`, and
// the browser makes a table a region that Tab reaches only while it is wider than its box.

const Table = DOCS_COMPONENTS.table as ComponentType<{ children?: ReactNode }>;
const Th = DOCS_COMPONENTS.th as ComponentType<{ children?: ReactNode }>;

const html = renderToStaticMarkup(
  createElement(
    Table,
    null,
    createElement(
      'thead',
      null,
      createElement('tr', null, createElement(Th, null, 'Field'), createElement(Th, null, 'Type')),
    ),
  ),
);

/** A table's box in the page, `scrollWidth` wide in a box `clientWidth` wide. */
function tableBox(scrollWidth: number, clientWidth: number): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const box = holder.querySelector<HTMLElement>('.ts-docs-table')!;
  Object.defineProperty(box, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(box, 'clientWidth', { configurable: true, value: clientWidth });
  return box;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a docs table', () => {
  it('is drawn by the server as a plain box carrying its name', () => {
    expect(html).toContain('data-label="Table with the columns Field and Type"');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('aria-label');
  });

  it('is a named region that Tab reaches while it scrolls, and plain while it fits', () => {
    const box = tableBox(720, 358);
    markTable(box);
    expect(box.getAttribute('role')).toBe('region');
    expect(box.getAttribute('tabindex')).toBe('0');
    expect(box.getAttribute('aria-label')).toBe('Table with the columns Field and Type');
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: 720 });
    markTable(box);
    expect(box.hasAttribute('role')).toBe(false);
    expect(box.hasAttribute('tabindex')).toBe(false);
    expect(box.hasAttribute('aria-label')).toBe(false);
  });

  it('is marked again whenever its box or the table changes size', () => {
    let notify: (targets: Element[]) => void = () => {};
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: { target: Element }[]) => void) {
          notify = (targets) => callback(targets.map((target) => ({ target })));
        }
        observe(target: Element) {
          observed.push(target);
        }
        disconnect = disconnect;
      },
    );
    const box = tableBox(720, 720);
    const body = box.parentElement!;
    const stop = watchTables(body);
    expect(observed).toEqual([box, box.querySelector('table')]);
    notify([box]);
    expect(box.hasAttribute('role')).toBe(false);
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: 358 });
    notify([box.querySelector('table')!]);
    expect(box.getAttribute('role')).toBe('region');
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
