// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { ImportSlidesDialog } from '../dialogs/ImportSlides';
import { OpenDialog } from '../dialogs/Open';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { DeckHeadRow, EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Open and Import slides dialogs draw this browser's own decks the moment they open and the
// store's listing replaces them when it lands (docs/POLISH.md item 75; B5's R29 to B1, landed by
// the ship step's third attempt): a deck made a moment ago is in the list before the blob tier's
// listing holds it, and the dialog never waits on the listing to draw a row.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();
const SLIDE = 'content-rule';
const dispatch = vi.fn(() => Promise.resolve({ revision: 413 }));

function row(id: string, title: string, updatedAt: string): DeckHeadRow {
  return { id, title, slides: 3, sections: 1, revision: 4, updatedAt, createdAt: updatedAt };
}

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
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

const mirror = () => [
  row('fresh-deck', 'Made a moment ago', '2026-09-30T12:00:00Z'),
  row('older-deck', 'Opened yesterday', '2026-09-29T12:00:00Z'),
];

describe("the Open dialog and this browser's own decks", () => {
  it('draws the mirror the moment it opens, busy until the listing lands, then the listing with the mirror folded in', async () => {
    let land: (rows: DeckHeadRow[]) => void = () => undefined;
    const listing = new Promise<DeckHeadRow[]>((resolve) => {
      land = resolve;
    });
    const { container } = render(
      <Host input={input({ recentDecks: mirror, listDecks: () => listing })}>
        <OpenDialog />
      </Host>,
    );
    const ids = () =>
      [...container.querySelectorAll('[data-control^="dialog.open.deck."]')].map((el) =>
        (el.getAttribute('data-control') ?? '').replace('dialog.open.deck.', ''),
      );
    expect(ids()).toEqual(['fresh-deck', 'older-deck']);
    expect(container.querySelector('.ts-dialog-list.is-loading')).toBeNull();
    expect(container.querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      land([
        row('older-deck', 'Opened yesterday, listed', '2026-09-29T12:00:00Z'),
        row('store-deck', 'Someone else made this', '2026-09-28T12:00:00Z'),
      ]);
      await listing;
    });
    expect(ids()).toEqual(['fresh-deck', 'older-deck', 'store-deck']);
    expect(container.querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBeNull();
  });

  it('waits on the listing as before when no mirror is wired', () => {
    const { container } = render(
      <Host input={input({ listDecks: () => new Promise(() => undefined) })}>
        <OpenDialog />
      </Host>,
    );
    expect(container.querySelector('.ts-dialog-list.is-loading')).not.toBeNull();
    expect(container.querySelectorAll('[data-control^="dialog.open.deck."]')).toHaveLength(0);
  });

  it('Import slides draws the mirror without the deck it imports into', () => {
    const own = doc.deck.id;
    const { container } = render(
      <Host
        input={input({
          recentDecks: () => [row(own, 'This deck', '2026-09-30T12:00:00Z'), ...mirror()],
          listDecks: () => new Promise(() => undefined),
        })}
      >
        <ImportSlidesDialog />
      </Host>,
    );
    const ids = [...container.querySelectorAll('[data-control^="dialog.importSlides.deck."]')].map(
      (el) => (el.getAttribute('data-control') ?? '').replace('dialog.importSlides.deck.', ''),
    );
    expect(ids).toEqual(['fresh-deck', 'older-deck']);
  });
});
