// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuCloseReason, MenuProps } from '../../Menu';
import { Menu, SUBMENU_HOVER_MS } from '../../Menu';
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
// aria-disabled with the stub sentence in its tooltip; the plate stands in the popover layer and
// place() keeps it on its anchor inside the viewport (place.test.ts reads the placement rules).

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
  /* a disabled row with its reason: the fixture reads `canRedo`, which the default context answers
     false; `canPaste` answered false on an empty clipboard until cycle 2 of the focus round, when
     Paste became always enabled as Google's is (menu-model.test.ts "cycle 2") */
  {
    id: 'edit.paste',
    label: 'Paste',
    status: 'now',
    effect: { kind: 'client', handler: 'paste' },
    enabled: 'canRedo',
    disabledReason: 'Copy something first',
  },
]).map((item) => (item.id === 'edit.grid' ? { ...item, accessKey: 'r' } : item));

/* the focus round (docs/FOCUS.md 3.1): a Later row is drawn only while Tools > Advanced tools is
   on, so the harness runs with the switch on and one test below asserts the row's absence off */
const CTX: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  settings: { ...DEFAULT_MENU_CONTEXT.settings, snapGrid: true, advancedTools: true },
};
const DEFAULT_CTX: MenuContext = {
  ...CTX,
  settings: { ...CTX.settings, advancedTools: false },
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
    /* no mnemonic mark on macOS, where the platform has no Alt mnemonics (docs/archive/rounds/PRODUCT.md 3.1.1;
       audit-interface 18): the label is plain text */
    expect(row('edit.undo').querySelector('u.ts-menu-ak')).toBeNull();
    expect(row('edit.undo').querySelector('.ts-menu-label')?.textContent).toBe('Undo');
    expect(document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]').length).toBe(
      5,
    );
    for (const el of document.querySelectorAll('[role^="menuitem"]'))
      expect(el.hasAttribute('title')).toBe(false);
  });

  it('leaves a Later row out while Advanced tools is off, and keeps the rest (docs/FOCUS.md 3.1)', () => {
    render(<Harness context={DEFAULT_CTX} />);
    expect(document.querySelector('[data-menu-item="edit.italic"]')).toBeNull();
    expect(row('edit.undo')).toBeTruthy();
    expect(row('edit.more')).toBeTruthy();
    expect(row('edit.grid')).toBeTruthy();
    expect(row('edit.paste')).toBeTruthy();
    expect(document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]').length).toBe(
      4,
    );
  });

  it('marks the access key on Windows and underlines it while Alt is held, never before (3.1.1)', () => {
    render(<Harness context={{ ...CTX, platform: 'win' }} />);
    expect(row('edit.undo').querySelector('u.ts-menu-ak')?.textContent).toBe('U');
    expect(menu().classList.contains('is-alt')).toBe(false);
    fireEvent.keyDown(document, { key: 'Alt', altKey: true });
    expect(menu().classList.contains('is-alt')).toBe(true);
    fireEvent.keyUp(document, { key: 'Alt', altKey: false });
    expect(menu().classList.contains('is-alt')).toBe(false);
  });

  it('prints Windows words and Windows chords on the other platform', () => {
    render(<Harness context={{ ...CTX, platform: 'win' }} />);
    expect(row('edit.undo').textContent).toContain('Ctrl+Z');
    expect(row('edit.undo').getAttribute('aria-keyshortcuts')).toBe('Control+Z');
  });

  it('draws no plate over a Later row or a disabled row, and keeps their names as data-tip for the audit (docs/archive/rounds/POLISH.md 2.6 item 61)', () => {
    /* audit-chrome item 21: a disabled row's plate covered the rows under it; the stub clause
       and the disabled reason stay in the model (tooltipDoc) for the finder and the palette */
    render(<Harness />);
    fireEvent.mouseMove(document.body);
    fireEvent.mouseEnter(row('edit.italic'));
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(document.getElementById(TIP_ID)?.hidden ?? true).toBe(true);
    expect(row('edit.italic').getAttribute('data-tip')).toBe('Italic');
    fireEvent.mouseMove(document.body);
    fireEvent.mouseEnter(row('edit.paste'));
    act(() => {
      vi.advanceTimersByTime(TIP_DELAY_MS + 50);
    });
    expect(document.getElementById(TIP_ID)?.hidden ?? true).toBe(true);
    expect(row('edit.paste').getAttribute('data-tip')).toBe('Paste');
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
    /* the key runs the row on every platform; the mark is drawn on Windows alone (3.1.1) */
    expect(row('edit.grid').querySelector('u.ts-menu-ak')).toBeNull();
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
    /* an enter in the list's first moments with no pointer movement is the browser's own for a
       list that opened under the pointer and lights nothing (docs/archive/rounds/POLISH.md 2.6 item 74); the
       person's entry comes after them */
    fireEvent.pointerEnter(row('edit.more'), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(SUBMENU_HOVER_MS);
    });
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(menu());
    act(() => {
      vi.advanceTimersByTime(400);
    });
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

/* the microtasks of one placement through place() (floating-ui's computePosition awaits each
   measurement), flushed inside act so the state it writes lands */
async function settlePlacement(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

describe('the menu plate in its layer and on its anchor (docs/DESIGN.md 2.3, 2.4)', () => {
  it('stands at its anchor from the first render, then place() writes the fixed position and the popover layer', async () => {
    /* jsdom lays nothing out: the window's box stood in, as place.test.ts does */
    for (const [key, value] of [
      ['clientWidth', 1440],
      ['clientHeight', 900],
    ] as const)
      Object.defineProperty(document.documentElement, key, { configurable: true, value });
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 44,
        left: 100,
        top: 44,
        right: 140,
        bottom: 72,
        width: 40,
        height: 28,
      }) as DOMRect;
    document.body.append(anchor);
    render(<Harness anchor={{ kind: 'element', element: anchor }} placement="below" />);
    /* the start: under the anchor's left edge with the 2 px gap, never hidden (a hidden list
       refuses the focus, VERIFICATION-3 finding 13) */
    expect(menu().style.visibility).toBe('');
    expect(menu().style.left).toBe('100px');
    expect(menu().style.top).toBe('74px');
    /* the popover layer of the scale: jsdom has no Popover API, so the fallback writes the z-index */
    expect(menu().dataset.layer).toBe('popover');
    expect(menu().style.zIndex).toBe('50');
    await settlePlacement();
    expect(menu().style.position).toBe('fixed');
    expect(menu().style.left).toBe('100px');
    expect(menu().style.top).toBe('74px');
    expect(menu().dataset.place).toBe('below');
    anchor.remove();
  });

  it('opens a submenu in the same layer, beside its row, with no z-index of its own', async () => {
    render(<Harness />);
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'ArrowRight' });
    const sub = screen.getByRole('menu', { name: 'More' });
    expect(sub.dataset.layer).toBe('popover');
    expect(sub.style.zIndex).toBe(menu().style.zIndex);
    await settlePlacement();
    expect(sub.style.position).toBe('fixed');
  });
});
