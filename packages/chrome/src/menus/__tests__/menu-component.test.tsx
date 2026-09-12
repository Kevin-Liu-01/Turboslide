// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuCloseReason, MenuProps } from '../../Menu';
import { Menu, SUBMENU_HOVER_MS, placeMenu } from '../../Menu';
import { TIP_DELAY_MS, TIP_ID, hideTooltip } from '../../Tooltip';
import { assignAccessKeys } from '../keys.ts';
import type { MenuContext, MenuItem } from '../model.ts';
import { DEFAULT_MENU_CONTEXT } from '../model.ts';

// The Menu primitive (SPEC 13.1, 2.11): the ARIA menu pattern over items of the model. Roving
// focus with the first row focused on open; Up and Down skip disabled rows and wrap; Home and
// End; the access key runs its row and type ahead moves to a label; Right opens a submenu with
// focus on its first row and Left closes it back to the parent row; Esc closes one level and
// returns focus to the trigger at the root; Tab closes everything; a press outside closes; a
// submenu row opens on hover after 120 ms; check rows carry aria-checked; a stub row is
// aria-disabled with the stub sentence in its tooltip; placeMenu keeps the plate in the viewport.

/* access keys as assignAccessKeys would give them, except Grid, which takes 'r' as if 'g' were taken, so type ahead on 'g' has a row to find */
const ITEMS: MenuItem[] = assignAccessKeys([
  {
    id: 'edit.undo',
    label: 'Undo',
    status: 'now',
    key: { mac: 'Cmd+Z', win: 'Ctrl+Z' },
    effect: { kind: 'client', handler: 'undo' },
  },
  {
    id: 'edit.italic',
    label: 'Italic',
    status: 'later',
    stubReason: 'The GT theme sets Inter in one style',
    key: { mac: 'Cmd+I', win: 'Ctrl+I' },
  },
  {
    id: 'edit.more',
    label: 'More',
    status: 'now',
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
        effect: { kind: 'client', handler: 'paste' },
      },
    ],
  },
  {
    id: 'edit.grid',
    label: 'Grid',
    status: 'now',
    effect: { kind: 'toggle', setting: 'snapGrid' },
    dividerBefore: true,
  },
  { id: 'edit.gone', label: 'Gone', status: 'omit', omitReason: 'never drawn' },
  {
    id: 'edit.paste',
    label: 'Paste',
    status: 'now',
    effect: { kind: 'client', handler: 'paste' },
    enabled: 'canPaste',
    disabledReason: 'Copy something first',
  },
]).map((item) => (item.id === 'edit.grid' ? { ...item, accessKey: 'r' } : item));

const CTX: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  settings: { ...DEFAULT_MENU_CONTEXT.settings, snapGrid: true },
};

function Harness(props: Partial<MenuProps> & { trigger?: boolean }) {
  return (
    <>
      <button type="button" id="trigger">
        Edit
      </button>
      <Menu
        items={props.items ?? ITEMS}
        context={props.context ?? CTX}
        label="Edit"
        anchor={props.anchor ?? { kind: 'point', x: 40, y: 40 }}
        placement={props.placement ?? 'point'}
        onSelect={props.onSelect ?? (() => undefined)}
        onClose={props.onClose ?? (() => undefined)}
        onNavigate={props.onNavigate}
        returnFocusTo={props.returnFocusTo === undefined ? null : props.returnFocusTo}
        autoFocus={props.autoFocus}
      />
    </>
  );
}

function row(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-menu-item="${id}"]`);
  if (!el) throw new Error(`no row ${id}`);
  return el;
}

function menu(): HTMLElement {
  return screen.getByRole('menu', { name: 'Edit' });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.useRealTimers();
});

describe('Menu rows', () => {
  it('draws the model: roles, keys, checks, stubs and no omitted row', () => {
    render(<Harness />);
    expect(menu()).toBeTruthy();
    expect(row('edit.undo').getAttribute('role')).toBe('menuitem');
    expect(row('edit.undo').getAttribute('aria-keyshortcuts')).toBe('Meta+Z');
    expect(row('edit.undo').textContent).toContain('⌘Z');
    expect(row('edit.undo').getAttribute('data-control')).toBe('menu.edit.undo');
    expect(row('edit.italic').getAttribute('aria-disabled')).toBe('true');
    expect(row('edit.italic').getAttribute('data-tip')).toBe('Italic');
    expect(row('edit.more').getAttribute('aria-haspopup')).toBe('menu');
    expect(row('edit.more').getAttribute('aria-expanded')).toBe('false');
    expect(row('edit.grid').getAttribute('role')).toBe('menuitemcheckbox');
    expect(row('edit.grid').getAttribute('aria-checked')).toBe('true');
    expect(row('edit.grid').querySelector('.ts-menu-check')).not.toBeNull();
    expect(row('edit.paste').getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('[data-menu-item="edit.gone"]')).toBeNull();
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1);
    /* the access key is underlined once */
    expect(row('edit.undo').querySelector('u.ts-menu-ak')?.textContent).toBe('U');
    expect(document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]').length).toBe(
      5,
    );
    for (const el of document.querySelectorAll('[role^="menuitem"]'))
      expect(el.hasAttribute('title')).toBe(false);
  });

  it('prints Windows words and Windows chords on the other platform', () => {
    render(<Harness context={{ ...CTX, platform: 'win' }} />);
    expect(row('edit.undo').textContent).toContain('Ctrl+Z');
    expect(row('edit.undo').getAttribute('aria-keyshortcuts')).toBe('Control+Z');
  });

  it('shows the stub sentence in the tooltip of a Later row', () => {
    render(<Harness />);
    fireEvent.mouseEnter(row('edit.italic'));
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS);
    });
    const tip = document.getElementById(TIP_ID);
    expect(tip?.querySelector('.pt-tip-name')?.textContent).toBe('Italic');
    expect(tip?.querySelector('.pt-tip-doc')?.textContent).toBe(
      'Not available in Turboslide yet. The GT theme sets Inter in one style.',
    );
    expect(tip?.querySelector('.pt-tip-key')?.textContent).toBe('Cmd I');
  });

  it('shows the disabled reason while the predicate says no', () => {
    render(<Harness />);
    fireEvent.mouseEnter(row('edit.paste'));
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS);
    });
    expect(document.getElementById(TIP_ID)?.querySelector('.pt-tip-doc')?.textContent).toBe(
      'Copy something first.',
    );
  });
});

describe('Menu keys', () => {
  it('focuses the first enabled row on open and walks with the arrows, skipping disabled rows and wrapping', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(row('edit.undo'));
    expect(row('edit.undo').tabIndex).toBe(0);
    expect(row('edit.more').tabIndex).toBe(-1);
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('edit.more'));
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('edit.grid'));
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('edit.undo'));
    fireEvent.keyDown(menu(), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(row('edit.grid'));
    fireEvent.keyDown(menu(), { key: 'Home' });
    expect(document.activeElement).toBe(row('edit.undo'));
    fireEvent.keyDown(menu(), { key: 'End' });
    expect(document.activeElement).toBe(row('edit.grid'));
  });

  it('runs a row on Enter and closes with the select reason', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Harness onSelect={onSelect} onClose={onClose} />);
    fireEvent.keyDown(menu(), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'edit.undo' }));
    expect(onClose).toHaveBeenCalledWith('select');
  });

  it('runs a row by its access key and moves by type ahead otherwise', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    expect(ITEMS.find((item) => item.id === 'edit.more')?.accessKey).toBe('m');
    expect(row('edit.grid').querySelector('u.ts-menu-ak')?.textContent).toBe('r');
    /* 'g' is no access key here; type ahead lands on the label that starts with it and runs nothing */
    fireEvent.keyDown(menu(), { key: 'g' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(row('edit.grid'));
    /* 'r' is Grid's access key: it runs the row */
    fireEvent.keyDown(menu(), { key: 'r' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'edit.grid' }));
    onSelect.mockClear();
    /* a disabled row's letter does nothing */
    fireEvent.keyDown(menu(), { key: 'p' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens a submenu on Right with focus on its first row, closes it on Left back to the parent row', () => {
    render(<Harness />);
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('edit.more'));
    fireEvent.keyDown(menu(), { key: 'ArrowRight' });
    const sub = screen.getByRole('menu', { name: 'More' });
    expect(row('edit.more').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(row('edit.more.alpha'));
    fireEvent.keyDown(sub, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('edit.more.beta'));
    fireEvent.keyDown(sub, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(row('edit.more'));
  });

  it('closes one level on Esc, then the whole menu with focus back on the trigger', () => {
    const closes: MenuCloseReason[] = [];
    render(
      <button type="button" id="trigger">
        Edit
      </button>,
    );
    const trigger = document.getElementById('trigger') as HTMLElement;
    render(
      <Menu
        items={ITEMS}
        context={CTX}
        label="Edit"
        anchor={{ kind: 'element', element: trigger }}
        placement="below"
        onSelect={() => undefined}
        onClose={(reason) => closes.push(reason)}
        returnFocusTo={trigger}
      />,
    );
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'Enter' });
    const sub = screen.getByRole('menu', { name: 'More' });
    expect(document.activeElement).toBe(row('edit.more.alpha'));
    fireEvent.keyDown(sub, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(row('edit.more'));
    expect(closes).toEqual([]);
    fireEvent.keyDown(menu(), { key: 'Escape' });
    expect(closes).toEqual(['escape']);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes everything on Tab with focus back on the trigger, and on a press outside', () => {
    const closes: MenuCloseReason[] = [];
    render(
      <button type="button" id="trigger">
        Edit
      </button>,
    );
    const trigger = document.getElementById('trigger') as HTMLElement;
    render(
      <Menu
        items={ITEMS}
        context={CTX}
        label="Edit"
        anchor={{ kind: 'element', element: trigger }}
        onSelect={() => undefined}
        onClose={(reason) => closes.push(reason)}
        returnFocusTo={trigger}
      />,
    );
    fireEvent.keyDown(menu(), { key: 'Tab' });
    expect(closes).toEqual(['tab']);
    expect(document.activeElement).toBe(trigger);
    fireEvent.mouseDown(document.body);
    expect(closes).toEqual(['tab', 'outside']);
  });

  it('calls onNavigate on Left and Right at the top level, so the bar can switch menus', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.keyDown(menu(), { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(menu(), { key: 'ArrowLeft' });
    expect(onNavigate).toHaveBeenLastCalledWith(-1);
  });
});

describe('Menu pointer', () => {
  it('opens a submenu after resting on its row for 120 ms and switches when another row is hovered', () => {
    render(<Harness autoFocus={false} />);
    expect(document.activeElement).toBe(menu());
    fireEvent.pointerEnter(row('edit.more'), { pointerType: 'mouse' });
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SUBMENU_HOVER_MS);
    });
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy();
    /* the pointer opened it: focus stays on the parent row, not on the first child */
    expect(document.activeElement).toBe(row('edit.more'));
    fireEvent.pointerEnter(row('edit.undo'), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(SUBMENU_HOVER_MS);
    });
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull();
  });

  it('runs a row on click and does nothing on a disabled row', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Harness onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(row('edit.italic'));
    fireEvent.click(row('edit.paste'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(row('edit.undo'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'edit.undo' }));
    expect(onClose).toHaveBeenCalledWith('select');
  });
});

describe('placeMenu', () => {
  const viewport = { width: 1440, height: 900 };
  const size = { width: 220, height: 300 };

  it('sits under a bar title, left aligned, and moves above when the viewport ends first', () => {
    expect(
      placeMenu({
        anchor: { left: 100, top: 44, right: 140, bottom: 72 },
        size,
        viewport,
        placement: 'below',
      }),
    ).toEqual({ left: 100, top: 74, maxHeight: 884 });
    expect(
      placeMenu({
        anchor: { left: 100, top: 800, right: 140, bottom: 828 },
        size,
        viewport,
        placement: 'below',
      }).top,
    ).toBe(498);
  });

  it('opens a submenu to the right of its row, overlapping by 4 px, and to the left at the edge', () => {
    expect(
      placeMenu({
        anchor: { left: 100, top: 200, right: 320, bottom: 228 },
        size,
        viewport,
        placement: 'right',
      }),
    ).toEqual({ left: 316, top: 196, maxHeight: 884 });
    expect(
      placeMenu({
        anchor: { left: 1300, top: 200, right: 1430, bottom: 228 },
        size,
        viewport,
        placement: 'right',
      }).left,
    ).toBe(1084);
  });

  it('opens a context menu at the pointer and flips left and up at the edges', () => {
    expect(
      placeMenu({
        anchor: { left: 500, top: 400, right: 500, bottom: 400 },
        size,
        viewport,
        placement: 'point',
      }),
    ).toEqual({ left: 500, top: 400, maxHeight: 884 });
    const flipped = placeMenu({
      anchor: { left: 1400, top: 800, right: 1400, bottom: 800 },
      size,
      viewport,
      placement: 'point',
    });
    expect(flipped).toEqual({ left: 1180, top: 500, maxHeight: 884 });
  });

  it('never leaves the 8 px margin', () => {
    const tiny = placeMenu({
      anchor: { left: -20, top: -20, right: -20, bottom: -20 },
      size,
      viewport: { width: 200, height: 200 },
      placement: 'point',
    });
    expect(tiny.left).toBe(8);
    expect(tiny.top).toBe(8);
    expect(tiny.maxHeight).toBe(184);
  });
});
