// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Deck, DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import { GOOGLE_LAYOUT_COUNT, LAYOUTS, LAYOUT_RULE_LABEL } from '@turboslide/schema/layouts';

import { GT_GROUP_KEY, LayoutGrid, layoutTiles } from '../LayoutGrid';
import { hideTooltip } from '../Tooltip';

// The layout grid (gslides-parity SPEC 5.2, 5.3): 21 tiles in the one order, Google's eleven
// before the rule reading "GT layouts", the current layout ringed, a click picking the layout, and
// a picture layout the deck cannot make reading "Add a picture first".
const document_ = workedDocument();

afterEach(() => {
  hideTooltip();
  cleanup();
  localStorage.removeItem(GT_GROUP_KEY);
});

describe('LayoutGrid', () => {
  it('draws the 21 layouts with Google’s eleven before the GT rule and picks one on click', () => {
    const onPick = vi.fn();
    const { container } = render(
      <LayoutGrid
        document={document_}
        slide={document_.slides['content-rule']}
        theme="dark"
        onPick={onPick}
        render={() => '<section class="slide"></section>'}
      />,
    );
    /* the GT layouts sit behind the disclosure row (docs/PRODUCT.md 3.4), which names the group
       and its count; the group opens on its own when the current layout is one of GT's (the rule
       slide's is), and the row collapses and reopens it */
    const rule = container.querySelector<HTMLElement>('.ts-layout-rule');
    expect(rule?.textContent).toContain(LAYOUT_RULE_LABEL);
    expect(rule?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(rule as HTMLElement);
    expect(rule?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.ts-layout-tile')).toHaveLength(GOOGLE_LAYOUT_COUNT);
    fireEvent.click(rule as HTMLElement);
    expect(rule?.getAttribute('aria-expanded')).toBe('true');
    const tiles = [...container.querySelectorAll<HTMLElement>('.ts-layout-tile')];
    expect(tiles).toHaveLength(LAYOUTS.length);
    expect(tiles.map((tile) => tile.dataset.layout)).toEqual(LAYOUTS.map((entry) => entry.id));
    const firstGroup = container.querySelectorAll('.ts-layout-tiles')[0];
    expect(firstGroup?.querySelectorAll('.ts-layout-tile')).toHaveLength(GOOGLE_LAYOUT_COUNT);
    /* the caption row reads the hovered tile's sentence, and no tile carries a floating plate
       (section 2 rank 24): the tiles keep data-tip for the audit and attach no handlers */
    const caption = container.querySelector('[data-control="layout.caption"]');
    fireEvent.pointerEnter(tiles[0] as HTMLElement);
    expect(caption?.textContent).toBe(LAYOUTS[0]?.sentence);
    expect(tiles[0]?.getAttribute('data-tip')).toBe(LAYOUTS[0]?.label);
    /* the current layout is ringed: the worked slide is a Ruled statement list */
    const current = container.querySelector<HTMLElement>('.ts-layout-tile.is-current');
    expect(current?.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tiles.find((tile) => tile.dataset.layout === 'big-number') as HTMLElement);
    expect(onPick).toHaveBeenCalledWith('big-number');
    for (const tile of tiles) {
      expect(tile.getAttribute('data-tip')).toBeTruthy();
      expect(tile.hasAttribute('title')).toBe(false);
      expect(tile.querySelector('.ts-layout-name')?.textContent).toBe(
        LAYOUTS.find((entry) => entry.id === tile.dataset.layout)?.label,
      );
    }
  });

  it('asks for a picture on the picture layouts of a deck without one', () => {
    const bare: Deck = { ...document_.deck, assets: {} };
    const doc: DeckDocument = { deck: bare, slides: document_.slides };
    const onAdd = vi.fn();
    const { container } = render(
      <LayoutGrid document={doc} theme="light" onPick={() => undefined} onAddPicture={onAdd} />,
    );
    const opener = container.querySelector<HTMLElement>('[data-layout="opener"]');
    expect(opener?.classList.contains('is-missing')).toBe(true);
    expect(opener?.textContent).toContain('Add a picture first');
    fireEvent.click(opener as HTMLElement);
    expect(onAdd).toHaveBeenCalled();
    const tiles = layoutTiles(bare, 'light');
    expect(tiles.google.filter((tile) => tile.html === null).map((tile) => tile.entry.id)).toEqual([
      'opener',
      'mood',
    ]);
  });

  it('walks the tiles with the arrows', () => {
    const { container } = render(
      <LayoutGrid document={document_} theme="dark" onPick={() => undefined} autoFocus />,
    );
    const grid = container.querySelector('.ts-layout-grid') as HTMLElement;
    const first = container.querySelector<HTMLElement>('[data-layout="title"]') as HTMLElement;
    first.focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('data-layout')).toBe('opener');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-layout')).toBe(LAYOUTS[4]?.id);
    /* End reaches the last of Google's eleven while the GT group is closed, closing once open */
    fireEvent.keyDown(grid, { key: 'End' });
    expect(document.activeElement?.getAttribute('data-layout')).toBe(LAYOUTS[10]?.id);
    fireEvent.click(container.querySelector('.ts-layout-rule') as HTMLElement);
    fireEvent.keyDown(grid, { key: 'End' });
    expect(document.activeElement?.getAttribute('data-layout')).toBe('closing');
  });
});
