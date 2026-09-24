// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorShellInput, PresenceParticipant } from '../editor-shell';
import { SETTINGS_STORAGE } from '../editor-shell';
import { EditorShell } from '../EditorShell';
import { cn } from '../lib/cn';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { useSnackbar } from '../Snackbar';
import { PRESENCE, TITLE_ROW } from '../menus/strings';
import { hideTooltip } from '../Tooltip';

// The title row's five fixed slots and the presence surfaces (gslides-parity SPEC-3 4.2, 4.5,
// 0.43, 9.3; 16.6 `presence-slot.test.tsx`): the slots exist at first paint with nobody present,
// the presence slot's 13 tracks sum to 184 px, four chips and the +N count with twenty people, the
// roster menu with every row and the Join chat stub, Follow on a followable person and Go to slide
// on the rest, the own chip's menu with the account rows, the inbox plate present at zero and
// counting to 99+, the Share dot on a pending request, the save words' offline phrase, Last edit
// through the resolved identity, and Shift+Tab from an open menu focusing the roster.

const doc = workedDocument();
const SLIDES = doc.deck.sections.flatMap((section) => section.slideIds);
const SLIDE = SLIDES[0]!;

function shellState(overrides: Partial<ShellState> = {}): ShellState {
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
    ...overrides,
  };
}

function Harness({ input, shell }: { input: EditorShellInput; shell: ShellState }) {
  const snackbar = useSnackbar();
  const stageRef = createRef<HTMLDivElement>();
  const [compact, setCompact] = useState(false);
  return (
    <ShellContext value={shell}>
      <div className={cn('pt-viewer is-editor', compact && 'is-compact')}>
        <EditorShell
          input={input}
          sidebar={<aside className="pt-sb" />}
          stageRef={stageRef}
          snackbar={snackbar}
          onCompactChange={setCompact}
        >
          <div className="ts-stage" />
        </EditorShell>
      </div>
    </ShellContext>
  );
}

const dispatch = vi.fn(() => Promise.resolve({}));

function person(i: number, over: Partial<PresenceParticipant> = {}): PresenceParticipant {
  return {
    clientId: `c${i}`,
    principalId: `anon_${i}`,
    label: `Titanium ${100 + i}`,
    trust: 'label',
    kind: 'anonymous',
    role: 'editor',
    hue: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    slideId: SLIDES[i % SLIDES.length],
    lastSeenAt: new Date().toISOString(),
    ...over,
  };
}

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

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
  /* useMountEffect defers its cleanup by one task (editor-shell-render.test.tsx) */
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.innerHTML = '';
});

describe('the title row slots', () => {
  it('exist from the first paint with nobody present: the presence slot, the comments glyph, the inbox plate at zero, Slideshow, Share', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const right = container.querySelector('.ts-title-r')!;
    const controls = Array.from(right.children).map((el) => el.getAttribute('data-control'));
    /* the side panel toggle joined the cluster in the product round (docs/PRODUCT.md section 2
       rank 25): the bottom bar that held it left */
    expect(controls).toEqual([
      'title.presence',
      'title.assist.slot',
      'title.comments.slot',
      'title.sidePanel.slot',
      'title.inbox.slot',
      'present.split',
      'share.slot',
    ]);
    expect(right.querySelector('[data-control="title.sidePanel"]')).not.toBeNull();
    const presence = right.querySelector('[data-control="title.presence"]')!;
    expect(presence.querySelectorAll('.ts-presence-slot.is-empty')).toHaveLength(4);
    expect(presence.querySelector('[data-control="presence.more"]')?.textContent).toBe('');
    /* the own chip (the account menu's opener) and the inbox plate are parked (docs/FOCUS.md
       3.2): absent in the default view, the inbox slot kept empty for the row's geometry */
    expect(presence.querySelector('.ts-presence-rule')).toBeNull();
    expect(presence.querySelector('[data-control="title.account"]')).toBeNull();
    expect(right.querySelector('[data-control="title.inbox"]')).toBeNull();
    expect(
      right.querySelector('[data-control="title.inbox.slot"]')?.classList.contains('is-empty'),
    ).toBe(true);
    expect(right.querySelector('.ts-title-share-slot')?.classList.contains('has-dot')).toBe(false);
  });

  it('draws the own chip, its rule and the inbox plate at zero behind Tools > Advanced tools', () => {
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ advancedTools: true }));
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const right = container.querySelector('.ts-title-r')!;
    const presence = right.querySelector('[data-control="title.presence"]')!;
    expect(presence.querySelector('.ts-presence-rule')).not.toBeNull();
    expect(presence.querySelector('[data-control="title.account"]')).not.toBeNull();
    const inbox = right.querySelector('[data-control="title.inbox"]')!;
    expect(inbox.getAttribute('data-unread')).toBe('0');
    expect(inbox.getAttribute('aria-label')).toBe(TITLE_ROW.notifications);
    expect(
      right.querySelector('[data-control="title.inbox.slot"]')?.classList.contains('is-empty'),
    ).toBe(false);
  });

  it("draws four chips and +16 for twenty people, the roster with every row; the own row and the Join chat stub stay behind Tools > Advanced tools, and the Go to slide word is in the default view since the features round's ship one", () => {
    const others = Array.from({ length: 20 }, (_, i) => person(i + 1));
    const self = person(0, { clientId: 'me', name: 'Kevin', trust: 'guest' });
    const onFollow = vi.fn();
    const onGoTo = vi.fn();
    /* the default view first: the rows and chips stay, the own row and the stub are absent
       (docs/FOCUS.md 3.1, 3.2; b6's FR2) and the Go to slide word is drawn: the matrix row
       collab.roster.go-to-slide, whose `parks` name title.presence.goTo, read green in both preview
       runs of record of the features round's ship one and left the parked list
       (docs/gslides-parity/focus/ship-f1afe1e.json `leaves`; re-parked at the return round's ship
       when it read red, docs/RETURN.md section 1 rule 2, VERIFICATION.md R2-F1) */
    const plain = render(
      <Harness
        input={input({ presence: { self, others, onFollow, onGoTo } })}
        shell={shellState()}
      />,
    );
    fireEvent.click(plain.container.querySelector('[data-control="presence.more"]')!);
    const plainRoster = document.getElementById('ts-menu-roster')!;
    /* the twenty people; the own row (the account menu's opener, `title.presence.me`) is parked */
    expect(plainRoster.querySelectorAll('[data-control^="presence.roster."]')).toHaveLength(20);
    expect(plainRoster.querySelector('[data-control="presence.roster.me"]')).toBeNull();
    expect(plainRoster.querySelector('[data-menu-item="title.presence.joinChat"]')).toBeNull();
    expect(plainRoster.querySelector('[data-control="presence.roster.c1"]')?.textContent).toContain(
      'Go to slide',
    );
    fireEvent.keyDown(plainRoster, { key: 'Escape' });
    plain.unmount();
    /* the switch on, remembered per browser: the own row and the stub return, the word stays */
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ advancedTools: true }));
    const { container } = render(
      <Harness
        input={input({ presence: { self, others, onFollow, onGoTo } })}
        shell={shellState()}
      />,
    );
    const presence = container.querySelector('[data-control="title.presence"]')!;
    expect(presence.querySelectorAll('.ts-presence-chip')).toHaveLength(4);
    expect(presence.querySelector('[data-control="presence.more"]')?.textContent).toBe('+16');
    expect(presence.getAttribute('data-count')).toBe('20');
    /* a label's chip cannot be followed: the click is a one time jump */
    fireEvent.click(presence.querySelector('[data-control="presence.chip.c1"]')!);
    expect(onGoTo).toHaveBeenCalledWith('c1');
    expect(onFollow).not.toHaveBeenCalled();
    fireEvent.click(presence.querySelector('[data-control="presence.more"]')!);
    const roster = document.getElementById('ts-menu-roster')!;
    expect(roster.getAttribute('role')).toBe('menu');
    expect(roster.getAttribute('aria-label')).toBe(PRESENCE.collaborators);
    /* the own row, twenty rows, the stub */
    expect(roster.querySelectorAll('[data-control^="presence.roster."]')).toHaveLength(21);
    expect(roster.querySelector('[data-control="presence.roster.me"]')?.textContent).toContain(
      PRESENCE.you,
    );
    expect(roster.querySelector('[data-control="presence.roster.c1"]')?.textContent).toContain(
      'Go to slide',
    );
    const stub = roster.querySelector('[data-menu-item="title.presence.joinChat"]')!;
    expect(stub.getAttribute('aria-disabled')).toBe('true');
    expect(stub.getAttribute('data-tip')).toBe(PRESENCE.joinChat);
    /* Esc closes and returns focus to the +N chip */
    fireEvent.keyDown(roster, { key: 'Escape' });
    expect(document.getElementById('ts-menu-roster')).toBeNull();
  });

  it('offers Follow on a verified editor with a slide and calls back; the Following plate shows and Stop ends it', () => {
    const maya = person(1, {
      kind: 'account',
      trust: 'verified',
      name: 'Maya Chen',
      email: 'maya@example.test',
    });
    const onFollow = vi.fn();
    const onUnfollow = vi.fn();
    const { container, rerender } = render(
      <Harness
        input={input({ presence: { others: [maya], onFollow, onUnfollow } })}
        shell={shellState()}
      />,
    );
    const chip = container.querySelector('[data-control="presence.chip.c1"]')!;
    expect(chip.getAttribute('data-menu-item')).toBe('title.presence.follow');
    fireEvent.click(chip);
    expect(onFollow).toHaveBeenCalledWith('c1');
    rerender(
      <Harness
        input={input({ presence: { others: [maya], following: 'c1', onFollow, onUnfollow } })}
        shell={shellState()}
      />,
    );
    const plate = container.querySelector('[data-control="presence.following"]')!;
    expect(plate.textContent).toContain(PRESENCE.following('Maya Chen'));
    expect(plate.classList.contains('ts-following')).toBe(true);
    fireEvent.click(container.querySelector('[data-control="presence.following.stop"]')!);
    expect(onUnfollow).toHaveBeenCalled();
  });

  it('opens the own chip menu with the account rows and the sentence, and nothing else in the chrome mentions accounts', () => {
    /* the account rows are parked (docs/FOCUS.md 3.2): the menu is asserted with Tools > Advanced
       tools on, remembered per browser */
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ advancedTools: true }));
    const me = {
      principalId: 'anon_me',
      label: 'Titanium 471',
      trust: 'label' as const,
      kind: 'anonymous' as const,
    };
    const { container } = render(
      <Harness
        input={input({ account: { principal: me, signedIn: false, signInAvailable: true } })}
        shell={shellState()}
      />,
    );
    /* the words Sign in and Sign out appear nowhere in the default view before the menu opens */
    const chrome = container.textContent ?? '';
    expect(chrome.includes('Sign in')).toBe(false);
    expect(chrome.includes('Sign out')).toBe(false);
    fireEvent.click(container.querySelector('[data-control="title.account"]')!);
    const menu = document.getElementById('ts-menu-account')!;
    expect(menu.querySelector('[data-control="account.sentence"]')?.textContent).toContain(
      'Not signed in',
    );
    const rows = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
      (row) => row.textContent,
    );
    expect(rows).toEqual([
      'Change name',
      'Change avatar',
      'Sign in',
      'Forget this browser',
      'Sessions',
    ]);
  });

  it('counts the inbox plate to 99+, dots Share on a pending request, and reads the offline phrase and the last editor', () => {
    /* the inbox plate is parked (docs/FOCUS.md 3.2): its count is read behind Tools > Advanced tools */
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ advancedTools: true }));
    const maya = {
      principalId: 'anon_m',
      label: 'Cobalt 212',
      name: 'Maya Chen',
      trust: 'guest' as const,
      kind: 'anonymous' as const,
    };
    const { container } = render(
      <Harness
        input={input({
          inbox: { items: [], unread: 120 },
          access: {
            revision: 3,
            generalAccess: { mode: 'restricted', role: 'viewer' },
            requests: [
              {
                id: 'r1',
                role: 'editor',
                askedAt: new Date().toISOString(),
                email: 'x@example.test',
              },
            ],
          },
          sync: {
            seq: 1,
            revision: 412,
            pending: 0,
            retained: 0,
            tier: 'memory',
            transport: 'sse',
            connected: false,
            offline: true,
          },
          save: {
            state: 'saved',
            lastEditAt: new Date(Date.now() - 120_000).toISOString(),
            lastEditor: maya,
            changedSinceOpen: true,
          },
        })}
        shell={shellState()}
      />,
    );
    expect(container.querySelector('.ts-title-inbox-count')?.textContent).toBe('99+');
    expect(container.querySelector('.ts-title-share-slot')?.classList.contains('has-dot')).toBe(
      true,
    );
    expect(container.querySelector('[data-control="deck.saveState"]')?.textContent).toContain(
      TITLE_ROW.offline,
    );
    const clock = container.querySelector('[data-control="deck.lastEdit"]')!;
    expect(clock.getAttribute('aria-label')).toBe(
      TITLE_ROW.lastEditBy('2 minutes ago', 'Maya Chen'),
    );
    expect(container.querySelector('.ts-title-clock-slot')?.classList.contains('has-dot')).toBe(
      true,
    );
  });

  it('focuses the roster on Shift+Tab from an open menu (0.42)', () => {
    const others = [person(1), person(2)];
    const { container } = render(
      <Harness input={input({ presence: { others } })} shell={shellState()} />,
    );
    const fileTitle = container.querySelector('[data-control="menubar.file"]') as HTMLElement;
    fireEvent.click(fileTitle);
    const fileMenu = document.getElementById('ts-menu-file');
    expect(fileMenu).not.toBeNull();
    /* a pointer opened list takes focus itself once it is placed, so the key lands in the menu */
    expect(document.activeElement).toBe(fileMenu);
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: true });
    });
    const roster = document.getElementById('ts-menu-roster');
    expect(roster).not.toBeNull();
    /* the menu closed without pulling focus back to its title; the roster's first row has it
       (VERIFICATION-3 finding 13) */
    expect(document.getElementById('ts-menu-file')).toBeNull();
    expect(document.activeElement?.closest('#ts-menu-roster')).toBe(roster);
    expect(document.activeElement).toBe(
      roster!.querySelector('[data-control="presence.roster.c1"]'),
    );
    expect(document.activeElement).not.toBe(fileTitle);
    /* Esc closes the roster and returns focus to the +N chip */
    fireEvent.keyDown(roster!, { key: 'Escape' });
    expect(document.getElementById('ts-menu-roster')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-control="presence.more"]'));
  });

  it('draws the roster opener from the first other person and hides it with nobody else present (docs/RETURN.md 4.3; return/build/b4.md request 6, collab.roster.go-to-slide)', () => {
    const nobody = render(
      <Harness input={input({ presence: { others: [] } })} shell={shellState()} />,
    );
    const hidden = nobody.container.querySelector('[data-control="presence.more"]')!;
    expect(hidden.classList.contains('is-empty')).toBe(true);
    expect(hidden.textContent).toBe('');
    nobody.unmount();
    const others = [person(1)];
    const { container } = render(
      <Harness input={input({ presence: { others } })} shell={shellState()} />,
    );
    const more = container.querySelector('[data-control="presence.more"]')!;
    /* one collaborator: the chip fits, no +N, yet the opener is drawn (a people glyph) and opens
       the roster with that person's row and the Go to slide word (title.presence.goTo, in the
       default view since the features round's ship one) */
    expect(more.classList.contains('is-empty')).toBe(false);
    expect(more.textContent).toBe('');
    expect(more.querySelector('svg')).not.toBeNull();
    fireEvent.click(more);
    const roster = document.getElementById('ts-menu-roster')!;
    expect(roster.querySelectorAll('[data-control^="presence.roster."]')).toHaveLength(1);
    expect(roster.querySelector('[data-control="presence.roster.c1"]')?.textContent).toContain(
      person(1).label,
    );
    expect(roster.querySelector('[data-control="presence.roster.c1"]')?.textContent).toContain(
      'Go to slide',
    );
    fireEvent.keyDown(roster, { key: 'Escape' });
  });

  it('opens the roster with focus from the key owner when the open menu does not hold focus', () => {
    const others = [person(1)];
    const { container } = render(
      <Harness input={input({ presence: { others } })} shell={shellState()} />,
    );
    const fileTitle = container.querySelector('[data-control="menubar.file"]') as HTMLElement;
    fireEvent.click(fileTitle);
    expect(document.getElementById('ts-menu-file')).not.toBeNull();
    /* focus back on the title, as a hover between titles leaves it: the shell's key.roster binding
       closes the menu and opens the roster (SPEC-3 0.42 "from any open menu") */
    act(() => {
      fileTitle.focus();
      fireEvent.keyDown(fileTitle, { key: 'Tab', shiftKey: true });
    });
    const roster = document.getElementById('ts-menu-roster');
    expect(roster).not.toBeNull();
    expect(document.getElementById('ts-menu-file')).toBeNull();
    expect(document.activeElement?.closest('#ts-menu-roster')).toBe(roster);
  });
});

describe('the title row by role (SPEC-3 13.4)', () => {
  /* the matrix of 6.2 (packages/identity access.test.ts): a viewer and a commenter hold neither
     rename nor write; an editor holds both */
  const VIEWER = ['read', 'export', 'copy', 'presence'] as const;
  const COMMENTER = [
    'read',
    'readSkipped',
    'readComments',
    'comment',
    'export',
    'copy',
    'presence',
  ] as const;

  it('shows a viewer and a commenter the name as text without the Rename row and no save words', () => {
    for (const [role, capabilities] of [
      ['viewer', VIEWER],
      ['commenter', COMMENTER],
    ] as const) {
      const { container, unmount } = render(
        <Harness
          input={input({ role, capabilities: [...capabilities], save: { state: 'saved' } })}
          shell={shellState()}
        />,
      );
      const row = container.querySelector('[data-control="title.row"]')!;
      const name = row.querySelector('[data-control="deck.name"]')!;
      expect(name.tagName, role).toBe('SPAN');
      expect(name.textContent, role).toBe(doc.deck.title);
      expect(name.getAttribute('data-menu-item'), role).toBeNull();
      expect(row.querySelector('[data-menu-item="title.name"]'), role).toBeNull();
      expect(row.querySelector('[data-menu-item="title.saveState"]'), role).toBeNull();
      expect(row.querySelector('[data-control="deck.saveState"]'), role).toBeNull();
      /* the clock, the slots and Share stay */
      expect(row.querySelector('[data-menu-item="title.lastEdit"]'), role).not.toBeNull();
      expect(row.querySelector('[data-control="share.open"]'), role).not.toBeNull();
      unmount();
    }
  });

  it('keeps the Rename button and the save words for an editor and for a checkout without capabilities', () => {
    const cases: Array<Partial<EditorShellInput>> = [
      { role: 'editor', capabilities: ['read', 'write', 'rename', 'history', 'share', 'presence'] },
      {},
    ];
    for (const extra of cases) {
      const { container, unmount } = render(<Harness input={input(extra)} shell={shellState()} />);
      const row = container.querySelector('[data-control="title.row"]')!;
      const name = row.querySelector('[data-control="deck.name"]')!;
      expect(name.tagName).toBe('BUTTON');
      expect(name.getAttribute('data-menu-item')).toBe('title.name');
      expect(row.querySelector('[data-menu-item="title.saveState"]')?.textContent).toContain(
        TITLE_ROW.saved,
      );
      unmount();
    }
  });
});
