// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LAYOUT_IDS, layoutGroups } from '@turboslide/schema/layouts';

import { ContextMenu, contextItems, contextMenuLabel } from '../ContextMenu';
import type { MenuContext, MenuItem } from '../menus/model.ts';
import { DEFAULT_MENU_CONTEXT } from '../menus/model.ts';
import { hideTooltip } from '../Tooltip';

// The right-click menus of gslides-parity SPEC 4.2 and 4.3 over the menu primitive: the card
// menu's order, its dividers, the keys on the right, the disabled stubs, Unskip slide on a skipped
// card, the Apply layout submenu with the 21 layouts and the current one checked, and focus
// returning to the right-clicked element on Esc.

const CTX: MenuContext = {
  ...DEFAULT_MENU_CONTEXT,
  focus: 'filmstrip',
  slide: { index: 1, count: 3, skipped: false, freeform: false, pictureLayout: false },
  clipboard: 'slides',
};

/* the focus round (docs/FOCUS.md 3.1): the Later stubs are drawn only while Tools > Advanced
   tools is on, so the rows of SPEC 4.2 that include them are asserted behind the switch */
const ADVANCED: MenuContext = { ...CTX, settings: { ...CTX.settings, advancedTools: true } };

/** The card menu of SPEC 4.2, as labels in order, dividers as '-', with the switch on. */
const CARD_ORDER = [
  'Cut',
  'Copy',
  'Paste',
  '-',
  'New slide',
  'Duplicate slide',
  'Delete',
  'Skip slide',
  '-',
  'Change background',
  'Apply layout',
  'Change theme',
  'Transition',
  '-',
  'Move slide',
  '-',
  'Comment',
];

/**
 * The same menu with the switch off: the Later row Transition is absent (docs/FOCUS.md 3.1, 3.4);
 * Change theme returned to the default view in the return round (docs/RETURN.md 2.13).
 */
const CARD_ORDER_DEFAULT = CARD_ORDER.filter((label) => label !== 'Transition');

/** The right-clicked card, mounted before the menu so focus can return to it. */
function mountCard(): HTMLElement {
  const card = document.createElement('div');
  card.id = 'card';
  card.tabIndex = 0;
  card.textContent = 'card';
  document.body.appendChild(card);
  return card;
}

function Harness(props: {
  context?: MenuContext;
  onSelect?: (item: MenuItem) => void;
  onClose?: () => void;
  onLayout?: (layout: string) => void;
  layout?: (typeof LAYOUT_IDS)[number];
}) {
  return (
    <ContextMenu
      target="filmstripCard"
      context={props.context ?? CTX}
      anchor={{ x: 100, y: 100 }}
      returnFocusTo={document.getElementById('card')}
      onSelect={props.onSelect ?? (() => undefined)}
      onClose={props.onClose ?? (() => undefined)}
      layout={props.layout}
      onLayout={props.onLayout}
    />
  );
}

/** The rows of the card menu, in order. */
function rows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="menu"][aria-label="Slide menu"] > .ts-menu-group > [role^="menuitem"]',
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mountCard();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  document.getElementById('card')?.remove();
  vi.useRealTimers();
});

describe('contextItems', () => {
  it("turns the model's card list into rows with dividers before the right items", () => {
    const items = contextItems('filmstripCard', ADVANCED);
    const labels = items.flatMap((item) => (item.dividerBefore ? ['-', item.label] : [item.label]));
    expect(labels).toEqual(CARD_ORDER);
    /* with the switch off the Later row leaves and the dividers still stand */
    const plain = contextItems('filmstripCard', CTX);
    expect(
      plain.flatMap((item) => (item.dividerBefore ? ['-', item.label] : [item.label])),
    ).toEqual(CARD_ORDER_DEFAULT);
    expect(contextMenuLabel('filmstripCard')).toBe('Slide menu');
    expect(contextMenuLabel('tableCell')).toBe('Table menu');
  });

  it('reads Unskip slide on a skipped card and every canvas target has rows', () => {
    const skipped = contextItems('filmstripCard', {
      ...CTX,
      slide: { ...CTX.slide!, skipped: true },
    });
    expect(skipped.some((item) => item.id === 'slide.skipSlide')).toBe(true);
    for (const target of [
      'emptyCanvas',
      'textBlock',
      'image',
      'tableCell',
      'textSelection',
    ] as const) {
      expect(contextItems(target, CTX).length).toBeGreaterThan(3);
    }
  });
});

describe('ContextMenu', () => {
  it('draws the card menu in the order of SPEC 4.2 with keys, stubs and the label switch', () => {
    /* the stub row is asserted behind Tools > Advanced tools (docs/FOCUS.md 3.1) */
    render(<Harness context={{ ...ADVANCED, slide: { ...ADVANCED.slide!, skipped: true } }} />);
    const menu = screen.getByRole('menu', { name: 'Slide menu' });
    expect(menu).toBeTruthy();
    const labels = rows().map((row) => row.querySelector('.ts-menu-label')?.textContent);
    expect(labels).toEqual(
      CARD_ORDER.filter((label) => label !== '-').map((label) =>
        label === 'Skip slide' ? 'Unskip slide' : label,
      ),
    );
    expect(
      document.querySelectorAll('[role="menu"][aria-label="Slide menu"] [role="separator"]'),
    ).toHaveLength(4);
    const dup = document.querySelector('[data-menu-item="slide.duplicateSlide"]');
    expect(dup?.textContent).toContain('⌘D');
    const newSlide = document.querySelector('[data-menu-item="slide.newSlide"]');
    expect(newSlide?.textContent).toContain('⌃M');
    /* the stubs are present and disabled, with the stub sentence; Comment is live (SPEC-3 5.3) */
    const transition = document.querySelector('[data-menu-item="slide.transition"]');
    expect(transition?.getAttribute('aria-disabled')).toBe('true');
    const comment = document.querySelector('[data-menu-item="insert.comment"]');
    expect(comment).not.toBeNull();
    expect(comment?.getAttribute('aria-disabled')).toBeNull();
    /* Change background opens the one Background dialog on every slide kind (SPEC-2 0.74) */
    expect(
      document
        .querySelector('[data-menu-item="slide.changeBackground"]')
        ?.getAttribute('aria-disabled'),
    ).toBeNull();
    /* the first row has focus */
    expect(document.activeElement).toBe(document.querySelector('[data-menu-item="edit.cut"]'));
  });

  it('leaves the Later row out of the card menu while Advanced tools is off (docs/FOCUS.md 3.1)', () => {
    render(<Harness context={CTX} />);
    const labels = rows().map((row) => row.querySelector('.ts-menu-label')?.textContent);
    expect(labels).toEqual(CARD_ORDER_DEFAULT.filter((label) => label !== '-'));
    expect(document.querySelector('[data-menu-item="slide.transition"]')).toBeNull();
    expect(
      document.querySelectorAll('[role="menu"][aria-label="Slide menu"] [role="separator"]'),
    ).toHaveLength(4);
  });

  it('runs a row through onSelect and returns focus to the card on Esc', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Harness onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(document.querySelector('[data-menu-item="slide.duplicateSlide"]')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0]?.[0] as MenuItem).id).toBe('slide.duplicateSlide');
    expect(onClose).toHaveBeenCalledWith('select');
    cleanup();
    const onClose2 = vi.fn();
    render(<Harness onClose={onClose2} />);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose2).toHaveBeenCalledWith('escape');
    expect(document.activeElement).toBe(document.getElementById('card'));
  });

  it('opens Apply layout as the 21 layouts with the current one checked and picks one', () => {
    const onLayout = vi.fn();
    render(<Harness onLayout={onLayout} layout="big-number" />);
    const apply = document.querySelector<HTMLElement>('[data-menu-item="slide.applyLayout"]');
    if (!apply) throw new Error('no Apply layout row');
    expect(apply.getAttribute('aria-haspopup')).toBe('menu');
    /* the pointer rests on the row (the menu's roving focus follows), then Right opens it */
    fireEvent.pointerEnter(apply);
    fireEvent.keyDown(apply, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const radios = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"][data-layout]'),
    );
    expect(radios.map((row) => row.dataset['layout'])).toEqual([...LAYOUT_IDS]);
    const groups = layoutGroups();
    expect(radios.slice(0, groups.google.length).map((row) => row.dataset['layout'])).toEqual(
      groups.google.map((entry) => entry.id),
    );
    expect(document.querySelector('.ts-layout-rule')?.textContent).toBe('GT layouts');
    const current = radios.find((row) => row.dataset['layout'] === 'big-number');
    expect(current?.getAttribute('aria-checked')).toBe('true');
    expect(radios.filter((row) => row.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    /* the first row took focus so the arrows walk the list */
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(radios[1]);
    fireEvent.click(radios.find((row) => row.dataset['layout'] === 'table')!);
    expect(onLayout).toHaveBeenCalledWith('table');
  });

  /* SPEC-2 4.3: Change shape ▸ on a shape draws the chrome's plate (the shell's
     renderDynamicSubmenu through `renderDynamic`), and a pick inside it closes the menu the way
     a layout pick does (VERIFICATION-2 finding 6: the row opened nothing) */
  it('draws the chrome plate of Change shape on a shape and closes on a pick', () => {
    /* Change shape is parked (docs/FOCUS.md section 4), so its plate is asserted behind the switch */
    const shapeContext: MenuContext = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
      focus: 'canvas',
      selection: {
        ...DEFAULT_MENU_CONTEXT.selection,
        blocks: 1,
        block: 'shape',
        order: { forward: true, backward: true, front: true, back: true },
      },
    };
    const onClose = vi.fn();
    const renderDynamic = vi.fn(
      (item: MenuItem, options: { viaKeyboard?: boolean; onPicked: () => void }) =>
        item.id === 'format.changeShape' ? (
          <button type="button" data-testid="pick-ellipse" onClick={() => options.onPicked()}>
            Ellipse
          </button>
        ) : null,
    );
    render(
      <ContextMenu
        target="shape"
        context={shapeContext}
        anchor={{ x: 100, y: 100 }}
        returnFocusTo={document.getElementById('card')}
        onSelect={() => undefined}
        onClose={onClose}
        renderDynamic={renderDynamic}
      />,
    );
    const row = document.querySelector<HTMLElement>('[data-menu-item="format.changeShape"]');
    if (!row) throw new Error('no Change shape row');
    expect(row.getAttribute('aria-disabled')).not.toBe('true');
    expect(row.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.pointerEnter(row);
    fireEvent.keyDown(row, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tile = screen.getByTestId('pick-ellipse');
    expect(renderDynamic).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'format.changeShape' }),
      expect.objectContaining({ viaKeyboard: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(tile);
    expect(onClose).toHaveBeenCalledWith('select');
    /* a row the chrome draws no plate for keeps its own behaviour: Apply layout is not in a
       shape's menu, and Alt text is a plain command row */
    expect(
      document.querySelector('[data-menu-item="format.altText"]')?.getAttribute('aria-haspopup'),
    ).toBeNull();
  });
});
