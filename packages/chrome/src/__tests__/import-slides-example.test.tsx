// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { IMPORT_NONE_OF_YOURS, ImportSlidesDialog, rowMeta } from '../dialogs/ImportSlides';
import { OpenDialog } from '../dialogs/Open';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { DeckHeadRow, EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Round 1 follow-up, lane A. Item 1: File > Import slides in a fresh browser listed nothing
// and said "No other presentations on this Turboslide" while every browser can open the GT brand
// deck; the listing now carries the example deck, marked, and the picker offers it after the
// viewer's own decks under a sentence that is true of them, while File > Open leaves it out.

const doc = workedDocument();
const SLIDE = 'content-rule';
const dispatch = vi.fn(() => Promise.resolve({ revision: 413 }));

function row(id: string, title: string, updatedAt: string, extra: Partial<DeckHeadRow> = {}) {
  return { id, title, slides: 3, sections: 1, revision: 4, updatedAt, createdAt: updatedAt, ...extra };
}
const EXAMPLE: DeckHeadRow = row('gt-brand', 'GT brand deck', '2026-09-13T03:49:55Z', {
  slides: 95,
  example: true,
});

/* the worked document is the GT brand deck itself; the deck imported into is another one */
const TARGET = 'untitled-20261005-lana';

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: TARGET, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

function Host({ input: value, children }: { input: EditorShellInput; children: React.ReactNode }) {
  const state = {
    input: value,
    platform: 'mac',
    menuContext: buildMenuContext(value, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
    runItem: vi.fn(),
    runControl: vi.fn(),
    panel: null,
    openPanel: vi.fn(),
    panelSection: null,
    closePanel: vi.fn(),
    reopenPanel: vi.fn(),
    wordArtOpen: false,
    setWordArtOpen: vi.fn(),
    registerFilmstrip: vi.fn(),
    setGuideUnderPointer: vi.fn(),
    dialog: null,
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    layoutGrid: null,
    openLayoutGrid: vi.fn(),
    closeLayoutGrid: vi.fn(),
    pickLayout: vi.fn(),
    renderDynamicSubmenu: () => null,
    menuOpen: null,
    setMenuOpen: vi.fn(),
    compact: false,
    setCompact: vi.fn(),
    toolFinderOpen: false,
    setToolFinderOpen: vi.fn(),
    paletteOpen: false,
    setPaletteOpen: vi.fn(),
    say: vi.fn(),
    lastLayout: null,
  } as unknown as EditorShellState;
  return <EditorShellContext.Provider value={state}>{children}</EditorShellContext.Provider>;
}

afterEach(() => {
  hideTooltip();
  cleanup();
});

const ids = (container: HTMLElement, prefix: string) =>
  [...container.querySelectorAll(`[data-control^="${prefix}"]`)].map((el) =>
    (el.getAttribute('data-control') ?? '').replace(prefix, ''),
  );

describe('the example deck in Import slides (item 1)', () => {
  it('a fresh browser is offered the GT brand deck under a sentence true of its own decks', async () => {
    const listing = Promise.resolve([EXAMPLE]);
    const { container } = render(
      <Host input={input({ recentDecks: () => [], listDecks: () => listing })}>
        <ImportSlidesDialog />
      </Host>,
    );
    await act(async () => {
      await listing;
    });
    expect(ids(container, 'dialog.importSlides.deck.')).toEqual(['gt-brand']);
    expect(container.querySelector('.ts-dialog-empty')?.textContent).toBe(IMPORT_NONE_OF_YOURS);
    expect(container.textContent).not.toMatch(/No other presentations on this Turboslide/);
    expect(
      container.querySelector('[data-control="dialog.importSlides.deck.gt-brand"]')?.textContent,
    ).toBe('GT brand deckExample · 95 slides');
  });

  it("lists the viewer's own decks first, the example last, and no sentence", async () => {
    const listing = Promise.resolve([
      EXAMPLE,
      row('store-deck', 'Shared with me', '2026-09-28T12:00:00Z'),
    ]);
    const { container } = render(
      <Host
        input={input({
          recentDecks: () => [row('fresh-deck', 'Made a moment ago', '2026-09-30T12:00:00Z')],
          listDecks: () => listing,
        })}
      >
        <ImportSlidesDialog />
      </Host>,
    );
    await act(async () => {
      await listing;
    });
    expect(ids(container, 'dialog.importSlides.deck.')).toEqual([
      'fresh-deck',
      'store-deck',
      'gt-brand',
    ]);
    expect(container.querySelector('.ts-dialog-empty')).toBeNull();
    expect(rowMeta({ slides: 1 })).toBe('1 slide');
  });

  it("File > Open leaves the example deck out, and keeps it as one of the viewer's own when this browser opened it", async () => {
    const listing = Promise.resolve([EXAMPLE, row('mine', 'Mine', '2026-09-30T12:00:00Z')]);
    const first = render(
      <Host input={input({ recentDecks: () => [], listDecks: () => listing })}>
        <OpenDialog />
      </Host>,
    );
    await act(async () => {
      await listing;
    });
    expect(ids(first.container, 'dialog.open.deck.')).toEqual(['mine']);
    first.unmount();
    const opened = render(
      <Host
        input={input({
          recentDecks: () => [row('gt-brand', 'GT brand deck', '2026-10-05T12:00:00Z')],
          listDecks: () => listing,
        })}
      >
        <OpenDialog />
      </Host>,
    );
    await act(async () => {
      await listing;
    });
    expect(ids(opened.container, 'dialog.open.deck.')).toEqual(['gt-brand', 'mine']);
  });
});
