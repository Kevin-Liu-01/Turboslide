// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Deck, DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import { GOOGLE_LAYOUT_COUNT, LAYOUTS, LAYOUT_RULE_LABEL } from '@turboslide/schema/layouts';

import { LayoutGrid, layoutTiles } from '../LayoutGrid';
import { hideTooltip } from '../Tooltip';

// The layout grid (gslides-parity SPEC 5.2, 5.3): 21 tiles in the one order, Google's eleven
// before the rule reading "GT layouts", the current layout ringed, a click picking the layout, and
// a picture layout the deck cannot make reading "Add a picture first".
const document_ = workedDocument();

afterEach(() => {
  hideTooltip();
  cleanup();
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
    const tiles = [...container.querySelectorAll<HTMLElement>('.ts-layout-tile')];
    expect(tiles).toHaveLength(LAYOUTS.length);
    expect(tiles.map((tile) => tile.dataset.layout)).toEqual(LAYOUTS.map((entry) => entry.id));
    const rule = container.querySelector('.ts-layout-rule');
    expect(rule?.textContent).toBe(LAYOUT_RULE_LABEL);
    const firstGroup = container.querySelectorAll('.ts-layout-tiles')[0];
    expect(firstGroup?.querySelectorAll('.ts-layout-tile')).toHaveLength(GOOGLE_LAYOUT_COUNT);
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
    fireEvent.keyDown(grid, { key: 'End' });
    expect(document.activeElement?.getAttribute('data-layout')).toBe('closing');
  });
});
