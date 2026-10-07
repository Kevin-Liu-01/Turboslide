// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorShellInput, IdentityView } from '../editor-shell';
import { EditorShell } from '../EditorShell';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { useSnackbar } from '../Snackbar';
import { hideTooltip } from '../Tooltip';
import { TITLE_MORE_MENU_ID, titleMoreItems, titleSignInItem } from '../TitleRow';

// The title row of Round 1 (docs/NEXT.md 4.1.3 item 13; the rows chrome.title-row.one-status,
// chrome.title-row.phone and chrome.title-row.name-after-first-write): no Last edit words on a
// draft nobody edited, one short phrase with the author in its tooltip after a write, Sign In as
// text for a visitor the deployment can sign in, and the More key's rows. The widths are the
// browser's (core/chrome.spec.ts); jsdom reads the markup.

const doc = workedDocument();
const SLIDES = doc.deck.sections.flatMap((section) => section.slideIds);
const SLIDE = SLIDES[0]!;

function shellState(): ShellState {
  const items = SLIDES.map((id) => ({ id, title: id }));
  return {
    id: 'edit:worked',
    modes: ['slide', 'grid', 'book'],
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
    active: SLIDE,
    index: 0,
    dir: 'next',
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

function Harness({ input }: { input: EditorShellInput }) {
  const snackbar = useSnackbar();
  const stageRef = createRef<HTMLDivElement>();
  return (
    <ShellContext value={shellState()}>
      <div className="pt-viewer is-editor">
        <EditorShell
          input={input}
          sidebar={<aside className="pt-sb" />}
          stageRef={stageRef}
          snackbar={snackbar}
        >
          <div className="ts-stage" />
        </EditorShell>
      </div>
    </ShellContext>
  );
}

const dispatch = vi.fn(() => Promise.resolve({}));
const principal: IdentityView = {
  principalId: 'anon_1',
  label: 'Felt 280',
  trust: 'label',
  kind: 'anonymous',
};

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

const words = (container: HTMLElement) =>
  container.querySelector('[data-control="deck.lastEdit.words"]')?.textContent ?? null;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
});

afterEach(async () => {
  hideTooltip();
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.innerHTML = '';
});

describe('one status phrase', () => {
  it('draws no Last edit words on a draft nobody edited, whatever the draft deck’s updatedAt', () => {
    const fresh = {
      ...doc,
      deck: { ...doc.deck, updatedAt: new Date().toISOString() },
    };
    const { container } = render(
      <Harness
        input={input({
          document: fresh,
          save: { state: 'saved', draft: true, lastEditAt: fresh.deck.updatedAt },
        })}
      />,
    );
    expect(words(container)).toBe('');
    const clock = container.querySelector('[data-control="deck.lastEdit"]');
    expect(clock?.getAttribute('aria-label')).toBe('Last edit');
  });

  it('after a write reads "Last edit just now" with the author in the tooltip and the accessible name', () => {
    const { container } = render(
      <Harness
        input={input({
          save: {
            state: 'saved',
            lastEditAt: new Date().toISOString(),
            lastEditor: {
              principalId: 'anon_2',
              label: 'Vellum 194',
              trust: 'label',
              kind: 'anonymous',
            },
          },
        })}
      />,
    );
    expect(words(container)).toBe('Last edit just now');
    const span = container.querySelector('[data-control="deck.lastEdit.words"]')!;
    expect(span.getAttribute('data-tip') ?? '').toMatch(/Last edit just now by Vellum 194/);
    expect(
      container.querySelector('[data-control="deck.lastEdit"]')?.getAttribute('aria-label'),
    ).toBe('Last edit just now by Vellum 194');
    /* the save cell keeps its words for the live region; TitleRow.css clips them while saved */
    expect(container.querySelector('[data-control="deck.saveState"]')?.textContent).toContain(
      'All changes saved',
    );
    expect(
      container.querySelector('[data-control="deck.saveState"]')?.getAttribute('data-state'),
    ).toBe('saved');
  });
});

describe('Sign In as text', () => {
  it('is drawn after Share for an anonymous visitor the deployment can sign in, and opens the Sign in dialog', async () => {
    const { container } = render(
      <Harness input={input({ account: { principal, signedIn: false, signInAvailable: true } })} />,
    );
    const right = Array.from(container.querySelector('.ts-title-r')!.children).map((el) =>
      el.getAttribute('data-control'),
    );
    expect(right.slice(-3)).toEqual(['share.slot', 'title.signIn', 'title.more']);
    const button = container.querySelector<HTMLButtonElement>('[data-control="title.signIn"]')!;
    expect(button.textContent).toBe('Sign In');
    expect(button.getAttribute('data-menu-item')).toBe(titleSignInItem().id);
    fireEvent.click(button);
    /* the dialog's module loads on first use (EditorShell.tsx `lazyDialog`), so it lands a task later */
    await vi.waitFor(() =>
      expect(document.querySelector('[data-control="dialog.signIn"]')).not.toBeNull(),
    );
  });

  it('is absent for a signed in person and on a deployment with no method', () => {
    for (const account of [
      { principal, signedIn: true, signInAvailable: true },
      { principal, signedIn: false, signInAvailable: false },
    ]) {
      const { container, unmount } = render(<Harness input={input({ account })} />);
      expect(container.querySelector('[data-control="title.signIn"]')).toBeNull();
      unmount();
    }
  });
});

describe('the More key', () => {
  it('lists the folded controls, the Slideshow arrow’s two rows and Sign in, from the model', () => {
    const ids = titleMoreItems(null).map((item) => item.id);
    expect(ids).toEqual([
      'title.assist',
      'title.comments',
      'title.sidePanel',
      'title.presence',
      'title.inbox',
      'title.slideshow.presenterView',
      'title.slideshow.startFromBeginning',
      titleSignInItem().id,
      /* a signed in person's account rows (docs/POLISH-2.md 4.3, Q9; P2-A#4) */
      'title.account.changeName',
      'title.account.signOut',
    ]);
    expect(titleMoreItems('comments').find((item) => item.id === 'title.sidePanel')?.label).toBe(
      'Hide side panel',
    );
    /* the roster row is a leaf: the key opens the roster plate itself */
    expect(titleMoreItems(null).find((item) => item.id === 'title.presence')?.items).toBe(
      undefined,
    );
  });

  it('opens its menu with the rows the context offers and the roster from Collaborators', () => {
    const { container } = render(
      <Harness input={input({ account: { principal, signedIn: false, signInAvailable: true } })} />,
    );
    const key = container.querySelector<HTMLButtonElement>('[data-control="title.more"]')!;
    expect(key.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(key);
    const menu = document.getElementById(TITLE_MORE_MENU_ID)!;
    expect(menu).not.toBeNull();
    expect(key.getAttribute('aria-controls')).toBe(TITLE_MORE_MENU_ID);
    const rows = Array.from(menu.querySelectorAll('[data-menu-item]')).map((el) =>
      el.getAttribute('data-menu-item'),
    );
    expect(rows).toContain('title.comments');
    expect(rows).toContain('title.presence');
    expect(rows).toContain('title.slideshow.presenterView');
    expect(rows).toContain(titleSignInItem().id);
    /* the parked inbox stays out (docs/FOCUS.md 3.2) */
    expect(rows).not.toContain('title.inbox');
    fireEvent.click(menu.querySelector('[data-menu-item="title.presence"]')!);
    expect(document.getElementById('ts-menu-roster')).not.toBeNull();
  });

  it('opens a roster that says so for a person alone and lists the others once one is present', () => {
    const roster = (extra: Partial<EditorShellInput>) => {
      const { container, unmount } = render(<Harness input={input(extra)} />);
      fireEvent.click(container.querySelector('[data-control="title.more"]')!);
      fireEvent.click(
        document.getElementById(TITLE_MORE_MENU_ID)!.querySelector('[data-menu-item="title.presence"]')!,
      );
      const rows = Array.from(
        document.getElementById('ts-menu-roster')!.querySelectorAll('[role="menuitem"]'),
      ).map((row) => row.textContent);
      unmount();
      return rows;
    };
    expect(roster({ presence: { others: [] } })).toEqual(['Nobody else has it open']);
    const other = {
      ...principal,
      principalId: 'anon_2',
      label: 'Bismuth 168',
      clientId: 'c2',
      role: 'editor' as const,
      lastSeenAt: '2026-10-08T00:00:00.000Z',
    };
    const rows = roster({ presence: { others: [other] } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Bismuth 168');
  });
});
