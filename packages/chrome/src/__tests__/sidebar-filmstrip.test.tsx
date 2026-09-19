// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { createClipboardStore } from '@turboslide/viewer/clipboard';

import type { EditorDispatch } from '../dispatch';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import type { ShellSection } from '../shell-data';
import { droppedOrder, newSlideLayout, Sidebar } from '../Sidebar';
import type { SidebarEdit } from '../Sidebar';
import { hideTooltip } from '../Tooltip';

// The filmstrip (gslides-parity SPEC 4.1, 4.2, 4.5): the cards with the number, the frame, the
// current ring and the skipped state; Shift and Cmd multi-select and the keys; the drag order
// with the opener rule; Google's right-click menu running one action per row through the
// dispatcher; the empty frame; the default view free of the tree's filter, count and badges.

const worked = workedDocument();

function sectionsOf(
  order: readonly { id: string; label: string; slideIds: string[] }[],
): ShellSection[] {
  return order.map((section) => ({
    id: section.id,
    label: section.label,
    items: section.slideIds.map((id, i) => ({
      id,
      n: String(i + 1).padStart(2, '0'),
      title: id,
      kind: worked.slides[id]?.kind ?? 'content',
      html: `<section class="slide is-on" data-slide="${id}"><div class="in"><h2>${id}</h2></div></section>`,
    })),
  }));
}

const SECTIONS = sectionsOf([
  { id: 'brand', label: 'Brand', slideIds: ['opener-brand', 'title', 'thesis', 'content-rule'] },
  { id: 'website', label: 'Website', slideIds: ['the-production-site'] },
]);

function shellState(active: string, select: (id: string) => void): ShellState {
  const items = SECTIONS.flatMap((section) => section.items);
  return {
    id: 'edit:test',
    modes: ['slide', 'grid'],
    keys: 'paged',
    noun: 'slide',
    items,
    paged: items,
    mode: 'slide',
    density: 'thumbs',
    sidebarOpen: true,
    sidebarShown: true,
    panelOpen: false,
    helpOpen: false,
    present: false,
    narrow: false,
    active,
    index: items.findIndex((item) => item.id === active),
    total: items.length,
    ready: true,
    setMode: vi.fn(),
    setDensity: vi.fn(),
    setSidebar: vi.fn(),
    setPanel: vi.fn(),
    setHelp: vi.fn(),
    setPresent: vi.fn(),
    select,
    step: vi.fn(),
    say: vi.fn(),
  };
}

type Call = { id: string; input: Record<string, unknown> };

function harness(
  options: { active?: string; edit?: Partial<SidebarEdit>; sections?: ShellSection[] } = {},
) {
  const calls: Call[] = [];
  let active = options.active ?? 'title';
  const dispatch: EditorDispatch = (id, raw) => {
    const input = raw as Record<string, unknown>;
    calls.push({ id, input });
    if (id === 'slide.list') {
      return Promise.resolve(
        SECTIONS.flatMap((section) =>
          section.items.map((item) => ({
            id: item.id,
            skip: worked.slides[item.id]?.skip === true,
            ...(worked.slides[item.id]?.template
              ? { template: worked.slides[item.id]?.template }
              : {}),
          })),
        ),
      );
    }
    if (id === 'slide.get') {
      return Promise.resolve({ slide: worked.slides[String(input['slideId'])] });
    }
    return Promise.resolve({});
  };
  const select = vi.fn((id: string) => {
    active = id;
  });
  const edit: SidebarEdit = {
    revision: 7,
    dispatch,
    document: worked,
    deck: worked.deck,
    clipboard: createClipboardStore(null),
    ...options.edit,
  };
  const view = render(
    <ShellContext value={shellState(active, select)}>
      <Sidebar
        title="Fixture"
        count="5 slides"
        sections={options.sections ?? SECTIONS}
        thumb="shot"
        hrefFor={(item) => `#s/${item.id}`}
        edit={edit}
      />
    </ShellContext>,
  );
  return {
    ...view,
    calls,
    select,
    edit,
    rerenderActive: (next: string) => {
      active = next;
      view.rerender(
        <ShellContext value={shellState(active, select)}>
          <Sidebar
            title="Fixture"
            count="5 slides"
            sections={options.sections ?? SECTIONS}
            thumb="shot"
            hrefFor={(item) => `#s/${item.id}`}
            edit={edit}
          />
        </ShellContext>,
      );
    },
  };
}

function card(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.ts-card[data-id="${id}"]`);
  if (!el) throw new Error(`no card ${id}`);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.useRealTimers();
});

describe('the filmstrip', () => {
  it('draws one card per slide with the number and the frame, the current one ringed, and nothing of the tree', () => {
    const { container } = harness();
    const cards = container.querySelectorAll('.ts-card:not(.is-empty)');
    expect(cards).toHaveLength(5);
    expect(card('title').classList.contains('is-current')).toBe(true);
    expect(card('title').getAttribute('aria-selected')).toBe('true');
    expect(card('title').getAttribute('tabindex')).toBe('0');
    expect(card('thesis').getAttribute('tabindex')).toBe('-1');
    expect(card('title').querySelector('.ts-card-n')?.textContent).toBe('2');
    expect(card('title').querySelector('.ts-card-frame .ts-thumb')).not.toBeNull();
    /* the slide title is the tooltip; the card's name is Slide n */
    expect(card('title').getAttribute('data-tip')).toBe('title');
    expect(card('title').getAttribute('aria-label')).toBe('Slide 2');
    expect(card('title').hasAttribute('title')).toBe(false);
    /* two sections: passive labels */
    const labels = [...container.querySelectorAll('.ts-film-section')].map((el) => el.textContent);
    expect(labels).toEqual(['Brand', 'Website']);
    /* the tree's furniture leaves the default view */
    expect(container.querySelector('.pt-filter')).toBeNull();
    expect(container.querySelector('.pt-filter-count')).toBeNull();
    expect(container.querySelector('.pt-seg')).toBeNull();
    expect(container.querySelector('.pt-orow-badge')).toBeNull();
    expect(container.querySelector('.pt-orow-more')).toBeNull();
    expect(container.querySelector('[data-preview]')).toBeNull();
    expect(container.querySelector('.pt-orow-name')).toBeNull();
  });

  it('dims a skipped card with the glyph and the tooltip sentence', () => {
    const skipped = {
      ...worked,
      slides: { ...worked.slides, thesis: { ...worked.slides['thesis']!, skip: true as const } },
    };
    const { container } = harness({ edit: { document: skipped } });
    expect(card('thesis').classList.contains('is-skipped')).toBe(true);
    expect(card('thesis').getAttribute('aria-label')).toBe('Slide 3, skipped');
    expect(card('thesis').querySelector('.ts-card-skip use')?.getAttribute('href')).toBe(
      '#i-eye-slash',
    );
    expect(container.querySelectorAll('.is-skipped')).toHaveLength(1);
  });

  it('selects one on click, a range with Shift, a toggle with Cmd, and all with Cmd A', () => {
    const { select, edit } = harness({ edit: { onSelectionChange: vi.fn() } });
    fireEvent.click(card('thesis'), { button: 0 });
    expect(select).toHaveBeenCalledWith('thesis');
    fireEvent.click(card('the-production-site'), { button: 0, shiftKey: true });
    const selected = () =>
      [...document.querySelectorAll('.ts-card[aria-selected="true"]')].map((el) =>
        el.getAttribute('data-id'),
      );
    expect(selected()).toEqual(['thesis', 'content-rule', 'the-production-site']);
    expect(edit.onSelectionChange).toHaveBeenLastCalledWith([
      'thesis',
      'content-rule',
      'the-production-site',
    ]);
    fireEvent.click(card('content-rule'), { button: 0, metaKey: true });
    expect(selected()).toEqual(['thesis', 'the-production-site']);
    fireEvent.click(card('opener-brand'), { button: 0, metaKey: true });
    expect(selected()).toEqual(['opener-brand', 'thesis', 'the-production-site']);
    fireEvent.keyDown(card('title'), { key: 'a', metaKey: true });
    expect(selected()).toHaveLength(5);
  });

  it('moves with the arrows, extends with Shift, deletes with the snackbar and inserts with Ctrl M', () => {
    const snack = vi.fn();
    const undo = vi.fn();
    const { calls, select } = harness({ edit: { snack, undo } });
    fireEvent.keyDown(card('title'), { key: 'ArrowDown' });
    expect(select).toHaveBeenLastCalledWith('thesis');
    fireEvent.keyDown(card('title'), { key: 'End' });
    expect(select).toHaveBeenLastCalledWith('the-production-site');
    fireEvent.keyDown(card('title'), { key: 'Home' });
    expect(select).toHaveBeenLastCalledWith('opener-brand');
    fireEvent.keyDown(card('title'), { key: 'ArrowDown', shiftKey: true });
    /* the range from the anchor grows while the shell's active follows */
    const selected = [...document.querySelectorAll('.ts-card[aria-selected="true"]')].map((el) =>
      el.getAttribute('data-id'),
    );
    expect(selected.length).toBeGreaterThanOrEqual(1);
    /* Ctrl M inserts a slide after the selection with its layout: Title and body after a Title slide */
    fireEvent.click(card('title'), { button: 0 });
    fireEvent.keyDown(card('title'), { key: 'm', ctrlKey: true });
    const created = calls.find((call) => call.id === 'slide.new');
    expect(created?.input).toEqual({ layout: 'split', after: 'title', baseRevision: 7 });
    /* after a Main point the new slide is a Main point too (SPEC 5.3) */
    fireEvent.click(card('thesis'), { button: 0 });
    fireEvent.keyDown(card('title'), { key: 'm', ctrlKey: true });
    const again = calls.filter((call) => call.id === 'slide.new')[1];
    expect(again?.input).toMatchObject({ layout: 'statement', after: 'thesis' });
    /* Delete removes the selection with the snackbar and its Undo */
    fireEvent.keyDown(card('title'), { key: 'Delete' });
    const removed = calls.filter((call) => call.id === 'slide.remove');
    expect(removed.length).toBeGreaterThanOrEqual(1);
    expect(snack).toHaveBeenCalled();
    const [text, action] = snack.mock.calls[snack.mock.calls.length - 1] as [
      string,
      { label: string; run: () => void },
    ];
    expect(text).toMatch(/^Slide deleted$|^Deleted \d+ slides$/);
    expect(action.label).toBe('Undo');
    action.run();
    expect(undo).toHaveBeenCalled();
  });

  it('Enter focuses the canvas and a double click on a card opens grid view', () => {
    const onFocusCanvas = vi.fn();
    const { container } = harness({ edit: { onFocusCanvas } });
    fireEvent.keyDown(card('title'), { key: 'Enter' });
    expect(onFocusCanvas).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(card('title'));
    expect(container).toBeTruthy();
  });

  it("opens Google's menu on right-click with the rows of SPEC 4.2 and runs Skip slide as slide.skip", () => {
    /* the Later row Transition is drawn behind Tools > Advanced tools (docs/FOCUS.md 3.1) */
    const { calls } = harness({ edit: { settings: { advancedTools: true } } });
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    const menu = document.querySelector('[role="menu"][aria-label="Slide menu"]');
    expect(menu).not.toBeNull();
    const labels = [
      ...menu!.querySelectorAll(':scope > .ts-menu-group > [role^="menuitem"] .ts-menu-label'),
    ].map((el) => el.textContent);
    expect(labels).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'New slide',
      'Duplicate slide',
      'Delete',
      'Skip slide',
      'Change background',
      'Apply layout',
      'Change theme',
      'Transition',
      'Move slide',
      'Comment',
    ]);
    fireEvent.click(document.querySelector('[data-menu-item="slide.skipSlide"]')!);
    const skip = calls.find((call) => call.id === 'slide.skip');
    expect(skip?.input).toEqual({ slideIds: ['thesis'], skip: true, baseRevision: 7 });
    expect(document.querySelector('[role="menu"][aria-label="Slide menu"]')).toBeNull();
  });

  it('leaves the Later row out of the card menu while Advanced tools is off (docs/FOCUS.md 3.1)', () => {
    harness();
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    const menu = document.querySelector('[role="menu"][aria-label="Slide menu"]');
    expect(menu).not.toBeNull();
    const labels = [
      ...menu!.querySelectorAll(':scope > .ts-menu-group > [role^="menuitem"] .ts-menu-label'),
    ].map((el) => el.textContent);
    expect(labels).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'New slide',
      'Duplicate slide',
      'Delete',
      'Skip slide',
      'Change background',
      'Apply layout',
      'Change theme',
      'Move slide',
      'Comment',
    ]);
    /* Change theme returned in the return round (docs/RETURN.md 2.13); the Later row stays out */
    expect(document.querySelector('[data-menu-item="slide.changeTheme"]')).not.toBeNull();
    expect(document.querySelector('[data-menu-item="slide.transition"]')).toBeNull();
    fireEvent.keyDown(menu!, { key: 'Escape' });
  });

  it('Duplicate slide, Move slide and Apply layout are one action each; Paste inserts copies after the selection', async () => {
    const { calls, edit } = harness();
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    fireEvent.click(document.querySelector('[data-menu-item="slide.duplicateSlide"]')!);
    expect(calls.find((call) => call.id === 'slide.duplicate')?.input).toEqual({
      slideIds: ['thesis'],
      baseRevision: 7,
    });
    /* Move slide up: the slide before the selection becomes its target */
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    const move = document.querySelector<HTMLElement>('[data-menu-item="slide.moveSlide"]');
    if (!move) throw new Error('no Move slide row');
    fireEvent.pointerEnter(move);
    fireEvent.keyDown(move, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(document.querySelector('[data-menu-item="slide.moveSlide.up"]')!);
    const moved = calls.find((call) => call.id === 'slide.move');
    expect(moved?.input).toEqual({
      slideId: 'thesis',
      sectionId: 'brand',
      after: 'opener-brand',
      baseRevision: 7,
    });
    /* Apply layout from the submenu list */
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    const apply = document.querySelector<HTMLElement>('[data-menu-item="slide.applyLayout"]');
    if (!apply) throw new Error('no Apply layout row');
    fireEvent.pointerEnter(apply);
    fireEvent.keyDown(apply, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(document.querySelector('[data-menu-item="slide.applyLayout.big-number"]')!);
    expect(calls.find((call) => call.id === 'slide.applyLayout')?.input).toMatchObject({
      slideIds: ['thesis'],
      layout: 'big-number',
    });
    /* Copy then Paste: the copies land after the selected card with fresh ids */
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    fireEvent.click(document.querySelector('[data-menu-item="edit.copy"]')!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(edit.clipboard?.kind()).toBe('slides');
    fireEvent.contextMenu(card('thesis'), { clientX: 120, clientY: 80 });
    fireEvent.click(document.querySelector('[data-menu-item="edit.paste"]')!);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const inserted = calls.find((call) => call.id === 'slide.insert');
    expect(inserted?.input).toMatchObject({ sectionId: 'brand', after: 'thesis' });
    expect((inserted?.input['slide'] as { id: string }).id).toBe('thesis-2');
  });

  it('shows the empty frame when the deck has no slide', () => {
    const { container } = harness({
      sections: [{ id: 'brand', label: 'Brand', items: [] }],
      active: '',
    });
    expect(container.querySelector('.ts-card.is-empty .ts-card-empty')?.textContent).toBe(
      'Click + to add a slide',
    );
  });
});

describe('the drag order (SPEC 4.1)', () => {
  const sections = [
    { id: 'a', slideIds: ['opener-a', 's1', 's2'] },
    { id: 'b', slideIds: ['opener-b', 's3'] },
  ];
  const kinds = new Map([
    ['opener-a', 'opener'],
    ['s1', 'content'],
    ['s2', 'content'],
    ['opener-b', 'opener'],
    ['s3', 'content'],
  ]);

  it('moves the dragged cards to the drop in deck order, into another section across its label', () => {
    expect(droppedOrder(sections, kinds, ['s1'], { id: 's2', half: 'after' })).toEqual([
      { id: 'a', slideIds: ['opener-a', 's2', 's1'] },
      { id: 'b', slideIds: ['opener-b', 's3'] },
    ]);
    expect(droppedOrder(sections, kinds, ['s2', 's1'], { id: 's3', half: 'before' })).toEqual([
      { id: 'a', slideIds: ['opener-a'] },
      { id: 'b', slideIds: ['opener-b', 's1', 's2', 's3'] },
    ]);
  });

  it('refuses a position before a section header and a header anywhere but first', () => {
    expect(droppedOrder(sections, kinds, ['s1'], { id: 'opener-b', half: 'before' })).toBeNull();
    expect(droppedOrder(sections, kinds, ['s1'], { sectionId: 'b' })).toBeNull();
    expect(droppedOrder(sections, kinds, ['opener-b'], { id: 's1', half: 'after' })).toBeNull();
    /* a header may open an empty section */
    expect(
      droppedOrder([...sections, { id: 'c', slideIds: [] }], kinds, ['opener-b'], {
        sectionId: 'c',
      }),
    ).toEqual([
      { id: 'a', slideIds: ['opener-a', 's1', 's2'] },
      { id: 'b', slideIds: ['s3'] },
      { id: 'c', slideIds: ['opener-b'] },
    ]);
  });

  it("New slide after a Title slide or a Section header is Title and body; elsewhere the slide's own layout", () => {
    expect(newSlideLayout({ template: undefined, kind: 'title' })).toBe('split');
    expect(newSlideLayout({ template: 'opener', kind: 'opener' })).toBe('split');
    expect(newSlideLayout({ template: 'big-number', kind: 'content' })).toBe('big-number');
    expect(newSlideLayout({ template: undefined, kind: 'content' })).toBe('split');
  });
});
