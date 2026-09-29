// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ICON_NAMES } from '../icons';
import { Menu } from '../Menu';
import { TIP_DELAY_MS, TIP_ID, hideTooltip, resetTooltipTiming } from '../Tooltip';
import { assignAccessKeys } from '../menus/keys.ts';
import type { MenuContext, MenuItem } from '../menus/model.ts';
import { CONTEXT_MENUS, DEFAULT_MENU_CONTEXT, MENUS, itemById, walkItems } from '../menus/model.ts';

// The menu rows of the polish round (docs/POLISH.md 2.6 items 57 and 61; 5.5 `menu.test.tsx`):
// no tooltip on a disabled row or a submenu row (audit-chrome item 21: the plate covered the
// rows under it), every glyph B1 named for the integrator's `icon:` fields exists in the icon
// table, and a glyph on every row of the ten menus and the eight right click menus once the
// integrator lands polish/build/b1.md R1.

const ITEMS: MenuItem[] = assignAccessKeys([
  {
    id: 'edit.undo',
    label: 'Undo',
    status: 'now',
    doc: 'Takes the last change back',
    effect: { kind: 'client', handler: 'undo' },
  },
  {
    id: 'edit.more',
    label: 'More',
    status: 'now',
    doc: 'Two more rows',
    effect: { kind: 'submenu' },
    items: [
      {
        id: 'edit.more.alpha',
        label: 'Alpha',
        status: 'now',
        effect: { kind: 'client', handler: 'copy' },
      },
      {
        id: 'edit.more.beta',
        label: 'Beta',
        status: 'now',
        effect: { kind: 'client', handler: 'copy' },
      },
    ],
  },
  {
    id: 'edit.paste',
    label: 'Paste',
    status: 'now',
    effect: { kind: 'client', handler: 'paste' },
    enabled: 'canRedo',
    disabledReason: 'Copy something first',
  },
  {
    id: 'edit.plain',
    label: 'Plain',
    status: 'now',
    effect: { kind: 'client', handler: 'copy' },
  },
]);

const CTX: MenuContext = { ...DEFAULT_MENU_CONTEXT };

function Harness() {
  return (
    <Menu
      items={ITEMS}
      context={CTX}
      label="Edit"
      anchor={{ kind: 'point', x: 20, y: 20 }}
      placement="point"
      onSelect={() => undefined}
      onClose={() => undefined}
    />
  );
}

const row = (id: string) => document.querySelector(`[data-menu-item="${id}"]`) as HTMLElement;
const plateShown = () => {
  const el = document.getElementById(TIP_ID);
  return el !== null && !el.hidden;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  resetTooltipTiming();
  cleanup();
  vi.useRealTimers();
});

describe('the rows’ tooltips (item 61)', () => {
  it('draws a plate for an enabled row with a sentence, none for a disabled row, a submenu row or a row without a sentence; every row keeps data-tip', () => {
    render(<Harness />);
    const hover = (id: string) => {
      fireEvent.mouseMove(document.body);
      fireEvent.mouseEnter(row(id));
      act(() => {
        vi.advanceTimersByTime(TIP_DELAY_MS + 50);
      });
      const shown = plateShown();
      hideTooltip();
      return shown;
    };
    expect(hover('edit.undo')).toBe(true);
    expect(hover('edit.paste')).toBe(false);
    expect(hover('edit.more')).toBe(false);
    expect(hover('edit.plain')).toBe(false);
    for (const item of ITEMS) expect(row(item.id).getAttribute('data-tip')).toBe(item.label);
    expect(screen.getByRole('menu', { name: 'Edit' })).not.toBeNull();
  });
});

describe('the glyphs (item 57)', () => {
  it('has a path in the icon table for every glyph named in polish/build/b1.md R1', () => {
    const named = [
      'document-plus',
      'arrow-down-on-square',
      'document-duplicate',
      'user-group',
      'link',
      'arrow-down-tray',
      'cog-6-tooth',
      'pencil',
      'tag',
      'clock',
      'eye',
      'printer',
      'envelope',
      'folder-open',
      'folder-plus',
      'check-badge',
      'cloud',
      'language',
      'arrow-uturn-left',
      'arrow-uturn-right',
      'scissors',
      'clipboard',
      'clipboard-document',
      'trash',
      'square-2-stack',
      'squares-2x2',
      'magnifying-glass-plus',
      'magnifying-glass-minus',
      'viewfinder-circle',
      'bars-2',
      'view-columns',
      'squares-plus',
      'chat',
      'document',
      'play',
      'sun',
      'moon',
      'computer-desktop',
      'film',
      'swatch',
      'photo',
      'table-cells',
      'box',
      'user-circle',
      'arrow-up-right',
      'arrow-down-right',
      'hashtag',
      'plus',
      'minus',
      'text',
      'bars-3-center-left',
      'bars-arrow-down',
      'bars-arrow-up',
      'list-bullet',
      'arrows-up-down',
      'arrows-right-left',
      'table',
      'arrows-pointing-in',
      'line-dash',
      'line-start',
      'line-end',
      'backspace',
      'information-circle',
      'chart-bars',
      'chart-line',
      'chart-pie',
      'eye-slash',
      'chevron-up',
      'chevron-down',
      'bars-3-bottom-left',
      'bars-3-bottom-right',
      'bars-3',
      'arrow-path',
      'rectangle-group',
      'wrench-screwdriver',
      'sparkles',
      'search',
      'book',
      'speaker-wave',
      'command-line',
      'light-bulb',
      'academic-cap',
      'lock-closed',
      'cursor-arrow',
      'cursor-arrow-rays',
      'presentation-chart-line',
      'fullscreen',
      'close',
    ];
    for (const name of named) expect(ICON_NAMES, name).toContain(name);
  });

  it('draws a glyph on every row of the ten menus and every right click menu (a read of the model; polish/build/b1.md R1 landed in menus/model.ts)', () => {
    const rows = [
      ...MENUS.flatMap((menu) => walkItems(menu.items)),
      ...Object.values(CONTEXT_MENUS)
        .flat()
        .map((entry) => (typeof entry === 'string' ? entry : entry.id))
        .filter((id) => id !== '-')
        .map((id) => itemById(id)),
    ];
    const without = rows
      .filter((item) => item.status !== 'omit' && item.icon === undefined)
      .map((item) => item.id);
    expect(without).toEqual([]);
    for (const item of rows) if (item.icon !== undefined) expect(ICON_NAMES).toContain(item.icon);
  });
});
