// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import type { ShellSection } from '../shell-data';
import { Sidebar } from '../Sidebar';
import { hideTooltip } from '../Tooltip';

// The viewer's list on a move (the slide motion round): the rows are memoized, so a move renders
// the two rows whose `active` changed and no other, and a hidden list (a show) follows nothing,
// so a move of the show measures no row and scrolls nothing. Every advance of a show on
// /deck/gt-brand rendered all 85 rows, their cards and their thumbs twice, and measured the
// active row inside the key's handler.

const thumbs = vi.hoisted(() => ({ renders: new Map<string, number>() }));

vi.mock('../Thumb', () => ({
  Thumb: ({ html }: { html?: string }) => {
    const id = /data-slide="([^"]+)"/.exec(html ?? '')?.[1] ?? '?';
    thumbs.renders.set(id, (thumbs.renders.get(id) ?? 0) + 1);
    return null;
  },
}));

const IDS = Array.from({ length: 24 }, (_, i) => `s${i + 1}`);

const SECTIONS: ShellSection[] = [
  {
    id: 'one',
    label: 'One',
    items: IDS.map((id, i) => ({
      id,
      n: String(i + 1).padStart(2, '0'),
      title: `Slide ${i + 1}`,
      kind: 'content',
      html: `<section class="slide" data-slide="${id}"></section>`,
    })),
  },
];

const ITEMS = SECTIONS.flatMap((section) => section.items);

/* the shell's handlers are stable for its life, as ViewerShell's are (they close over refs) */
const HANDLERS = {
  setMode: vi.fn(),
  setDensity: vi.fn(),
  setSidebar: vi.fn(),
  setPanel: vi.fn(),
  setHelp: vi.fn(),
  setPresent: vi.fn(),
  select: vi.fn(),
  step: vi.fn(),
  say: vi.fn(),
};

function shellState(active: string, present = false): ShellState {
  return {
    id: 'deck:memo',
    modes: ['slide', 'grid'],
    keys: 'paged',
    noun: 'slide',
    items: ITEMS,
    paged: ITEMS,
    mode: 'slide',
    density: 'thumbs',
    sidebarOpen: true,
    sidebarShown: !present,
    panelOpen: false,
    helpOpen: false,
    present,
    narrow: false,
    active,
    index: IDS.indexOf(active),
    total: IDS.length,
    ready: true,
    ...HANDLERS,
  };
}

function list(active: string, present = false) {
  return (
    <ShellContext value={shellState(active, present)}>
      <Sidebar
        title="Memo"
        count="24 slides"
        sections={SECTIONS}
        thumb="shot"
        hrefFor={(item) => `#s/${item.id}`}
      />
    </ShellContext>
  );
}

afterEach(() => {
  hideTooltip();
  cleanup();
  thumbs.renders.clear();
  vi.restoreAllMocks();
});

describe('the viewer list on a move', () => {
  it('renders the two rows whose active state changed and no other', () => {
    const view = render(list('s3'));
    expect(thumbs.renders.size).toBe(IDS.length);
    thumbs.renders.clear();
    view.rerender(list('s4'));
    expect([...thumbs.renders.keys()].sort()).toEqual(['s3', 's4']);
    expect(view.container.querySelector('a.pt-orow.is-active')?.getAttribute('data-id')).toBe('s4');
  });

  it('measures no row while the list is hidden by a show, and follows when it shows again', () => {
    const view = render(list('s3', true));
    const measured = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    view.rerender(list('s4', true));
    view.rerender(list('s5', true));
    expect(measured).not.toHaveBeenCalled();
    view.rerender(list('s5', false));
    expect(measured).toHaveBeenCalled();
  });
});
