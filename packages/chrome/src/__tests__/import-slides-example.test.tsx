// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import {
  IMPORT_NONE_OF_YOURS,
  ImportSlidesDialog,
  importTileSrc,
  rowMeta,
} from '../dialogs/ImportSlides';
import { OpenDialog } from '../dialogs/Open';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { DeckHeadRow, EditorShellInput, SourceDeckSlides } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Round 1 follow-up, lane A. Item 1: File > Import slides in a fresh browser listed nothing
// and said "No other presentations on this Turboslide" while every browser can open the GT brand
// deck; the listing now carries the example deck, marked, and the picker offers it after the
// viewer's own decks under a sentence that is true of them, while File > Open leaves it out.
// Item 2 (VERIFICATION.md "Round 1, pass 2" P2-1): a tile kept its place in the picture gate from
// its first sighting until it unmounted, so the tiles in view at the end of a long list waited
// behind every tile scrolled past; a tile that leaves now gives its place back.

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

/** An IntersectionObserver the test drives: `fire` reports tiles entering or leaving. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.callback = callback;
    this.options = options;
    FakeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
  fire(changes: ReadonlyArray<readonly [Element, boolean]>) {
    const entries = changes
      .filter(([target]) => this.targets.has(target))
      .map(([target, isIntersecting]) => ({ target, isIntersecting }) as IntersectionObserverEntry);
    if (entries.length > 0) this.callback(entries, this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});
afterEach(() => {
  hideTooltip();
  cleanup();
  vi.unstubAllGlobals();
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

describe('the tile pictures of a long list (item 2, P2-1)', () => {
  const SOURCE: SourceDeckSlides = {
    id: 'gt-brand',
    title: 'GT brand deck',
    slides: Array.from({ length: 95 }, (_, n) => ({ id: `s${n}`, title: `Slide ${n + 1}`, n: n + 1 })),
  };

  async function openTiles() {
    const listing = Promise.resolve([EXAMPLE]);
    const read = Promise.resolve(SOURCE);
    const rendered = render(
      <Host
        input={input({ recentDecks: () => [], listDecks: () => listing, readDeck: () => read })}
      >
        <ImportSlidesDialog />
      </Host>,
    );
    await act(async () => {
      await listing;
    });
    await act(async () => {
      fireEvent.click(
        rendered.container.querySelector('[data-control="dialog.importSlides.deck.gt-brand"]')!,
      );
      await read;
    });
    const imgs = [
      ...rendered.container.querySelectorAll<HTMLImageElement>(
        '[data-control^="dialog.importSlides.slide."] img',
      ),
    ];
    const view = FakeObserver.all.find((o) => o.options.rootMargin === undefined)!;
    const near = FakeObserver.all.find((o) => o.options.rootMargin !== undefined)!;
    /** tiles [from, to) entering (true) or leaving (false) the view and the near area */
    const move = (from: number, to: number, inView: boolean, isNear: boolean) =>
      act(() => {
        const range = imgs.slice(from, to);
        view.fire(range.map((img) => [img, inView] as const));
        near.fire(range.map((img) => [img, isNear] as const));
      });
    const asked = () => imgs.flatMap((img, n) => (img.getAttribute('src') ? [n] : []));
    return { imgs, view, near, move, asked };
  }

  it('two observers watch the list: the view first, then 200 px around it; six pictures at once', async () => {
    const { imgs, view, near, move, asked } = await openTiles();
    expect(imgs).toHaveLength(95);
    expect(FakeObserver.all.indexOf(view)).toBeLessThan(FakeObserver.all.indexOf(near));
    expect(near.options.rootMargin).toBe('200px 0px');
    move(0, 6, true, true);
    move(6, 12, false, true);
    expect(asked()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(imgs[0]!.getAttribute('src')).toBe('/api/render/s0?deck=gt-brand&theme=dark&w=320');
    expect(imgs[0]!.getAttribute('fetchpriority')).toBe('low');
    act(() => {
      fireEvent.load(imgs[0]!);
    });
    expect(asked()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('a tile coming into view takes the turn of a loading tile that is only near, which drops its picture', async () => {
    const { move, asked } = await openTiles();
    move(0, 6, true, true);
    move(6, 12, false, true);
    expect(asked()).toEqual([0, 1, 2, 3, 4, 5]);
    /* one row down: 0 to 2 stay near and loading, 3 to 5 stay in view, 6 to 8 come into view */
    move(0, 3, false, true);
    move(6, 9, true, true);
    expect(asked()).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('a list scrolled to its end draws the tiles in view next, and a tile scrolled away drops its picture', async () => {
    const { imgs, move, asked } = await openTiles();
    move(0, 6, true, true);
    move(6, 12, false, true);
    /* the wheel passes every row: each row comes near, into view, out of view and leaves */
    for (let n = 12; n < 87; n += 3) {
      move(n, n + 3, true, true);
      move(n - 12, n - 9, false, false);
    }
    move(75, 87, false, false);
    /* the 8 tiles in view at the end */
    move(87, 95, true, true);
    expect(asked()).toEqual([87, 88, 89, 90, 91, 92]);
    act(() => {
      fireEvent.load(imgs[87]!);
      fireEvent.error(imgs[88]!);
    });
    expect(asked()).toEqual([87, 88, 89, 90, 91, 92, 93, 94]);
    /* a drawn tile keeps its picture when it leaves; one still loading drops it and asks again on its return */
    move(87, 90, false, false);
    expect(asked()).toEqual([87, 90, 91, 92, 93, 94]);
    move(89, 90, true, true);
    expect(asked()).toContain(89);
  });
});

describe('the tiles draw in the appearance of the deck imported into (design round pass 2 finding 1)', () => {
  const SOURCE: SourceDeckSlides = {
    id: 'simple-source',
    title: 'Simple source',
    slides: [{ id: 'title', title: 'Click to add title', n: 1 }],
  };
  const SOURCE_ROW = row('simple-source', 'Simple source', '2026-10-06T12:00:00Z');

  /** the worked document with its appearance written, as the Theme panel's Appearance writes it */
  function targetIn(appearance: 'light' | 'dark') {
    return { ...doc, deck: { ...doc.deck, defaults: { ...doc.deck.defaults, appearance } } };
  }

  async function firstTile(appearance: 'light' | 'dark') {
    const listing = Promise.resolve([SOURCE_ROW]);
    const read = Promise.resolve(SOURCE);
    const { container } = render(
      <Host
        input={input({
          document: targetIn(appearance),
          recentDecks: () => [],
          listDecks: () => listing,
          readDeck: () => read,
        })}
      >
        <ImportSlidesDialog />
      </Host>,
    );
    await act(async () => {
      await listing;
    });
    await act(async () => {
      fireEvent.click(
        container.querySelector('[data-control="dialog.importSlides.deck.simple-source"]')!,
      );
      await read;
    });
    const img = container.querySelector<HTMLImageElement>(
      '[data-control="dialog.importSlides.slide.title"] img',
    )!;
    const view = FakeObserver.all.find((o) => o.options.rootMargin === undefined)!;
    const near = FakeObserver.all.find((o) => o.options.rootMargin !== undefined)!;
    act(() => {
      view.fire([[img, true]]);
      near.fire([[img, true]]);
    });
    return { img, container };
  }

  it('a light deck asks for light tiles, under the sentence that the copies take its theme', async () => {
    const { img, container } = await firstTile('light');
    expect(img.getAttribute('src')).toBe('/api/render/title?deck=simple-source&theme=light&w=320');
    expect(container.querySelector('[data-control="dialog.importSlides.theme"]')?.textContent).toBe(
      'The copies take this presentation’s theme',
    );
  });

  it('a dark deck asks for dark tiles', async () => {
    const { img } = await firstTile('dark');
    expect(img.getAttribute('src')).toBe('/api/render/title?deck=simple-source&theme=dark&w=320');
  });

  it('importTileSrc encodes the ids and names the appearance it is given', () => {
    expect(importTileSrc('a b', 's/1', 'light')).toBe(
      '/api/render/s%2F1?deck=a%20b&theme=light&w=320',
    );
  });
});
