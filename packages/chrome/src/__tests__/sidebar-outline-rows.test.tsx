// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorDispatch } from '../dispatch';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import type { ShellSection } from '../shell-data';
import { Sidebar } from '../Sidebar';
import { hideTooltip } from '../Tooltip';

// The outline rows of the sidebar's tree (the viewer's list, and the editor's under Tools >
// Advanced > Show sections as a tree) carry the Tooltip primitive and no native title (AGENTS.md
// "Every control ... carries the Tooltip primitive"; the focus round, cycle 3 fix, VERIFICATION
// C2-F13: `scripts/tooltip-audit.mjs --strict` read the rows `a.pt-orow` as its one title only
// hit, check step 20's last red check). The lint badge inside a row carries the primitive too,
// since the audit reads a row's nearest `[title]` ancestor or descendant.

const worked = workedDocument();

const SECTIONS: ShellSection[] = [
  {
    id: 'brand',
    label: 'Brand',
    items: [
      {
        id: 'title',
        n: '01',
        title: 'The title slide',
        kind: 'title',
        html: '<section class="slide" data-slide="title"></section>',
        lint: { s3: 1, s2: 2 },
      },
      {
        id: 'thesis',
        n: '02',
        title: '',
        kind: 'content',
        html: '<section class="slide" data-slide="thesis"></section>',
      },
    ],
  },
];

function shellState(): ShellState {
  const items = SECTIONS.flatMap((section) => section.items);
  return {
    id: 'deck:test',
    modes: ['slide', 'grid'],
    keys: 'paged',
    noun: 'slide',
    items,
    paged: items,
    mode: 'slide',
    density: 'outline',
    sidebarOpen: true,
    sidebarShown: true,
    panelOpen: false,
    helpOpen: false,
    present: false,
    narrow: false,
    active: 'title',
    index: 0,
    total: items.length,
    ready: true,
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
}

afterEach(() => {
  hideTooltip();
  cleanup();
});

function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('a.pt-orow')];
}

describe('the outline rows', () => {
  it("carry the slide's title as the tooltip primitive and no native title, in the viewer's list", () => {
    const { container } = render(
      <ShellContext value={shellState()}>
        <Sidebar
          title="Fixture"
          count="2 slides"
          sections={SECTIONS}
          thumb="shot"
          hrefFor={(item) => `#s/${item.id}`}
        />
      </ShellContext>,
    );
    const list = rows(container);
    expect(list).toHaveLength(2);
    const [first, second] = list as [HTMLElement, HTMLElement];
    expect(first.getAttribute('data-tip')).toBe('The title slide');
    expect(first.hasAttribute('title')).toBe(false);
    /* a slide without a title is named by its number */
    expect(second.getAttribute('data-tip')).toBe('Slide 02');
    expect(second.hasAttribute('title')).toBe(false);
    /* nothing inside a row falls back to a native title: the lint badge carries the primitive */
    expect(container.querySelectorAll('a.pt-orow [title], a.pt-orow[title]')).toHaveLength(0);
    const badge = first.querySelector('.pt-orow-badge');
    expect(badge?.getAttribute('data-tip')).toBe('Lint findings');
    expect(badge?.textContent).toBe('1');
  });

  it("carry the primitive in the editor's tree too, beside the row menu", () => {
    const dispatch: EditorDispatch = () => Promise.resolve({});
    const { container } = render(
      <ShellContext value={shellState()}>
        <Sidebar
          title="Fixture"
          count="2 slides"
          sections={SECTIONS}
          thumb="shot"
          hrefFor={(item) => `#s/${item.id}`}
          edit={{
            revision: 3,
            dispatch,
            document: worked,
            deck: worked.deck,
            settings: { sectionsTree: true },
          }}
        />
      </ShellContext>,
    );
    const list = rows(container);
    expect(list).toHaveLength(2);
    for (const row of list) {
      expect(row.hasAttribute('data-tip')).toBe(true);
      expect(row.hasAttribute('title')).toBe(false);
      expect(row.querySelector('.pt-orow-more')?.getAttribute('data-tip')).toBe('Slide menu');
    }
    expect(container.querySelectorAll('a.pt-orow [title], a.pt-orow[title]')).toHaveLength(0);
  });
});
