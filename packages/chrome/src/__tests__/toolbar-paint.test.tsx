// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorShellInput } from '../editor-shell';
import { EditorShell } from '../EditorShell';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { useSnackbar } from '../Snackbar';
import { hideTooltip } from '../Tooltip';

// The toolbar's Paint format button reads pressed while the stage's brush is armed (docs/archive/rounds/POLISH.md
// 2.3 item 18; the polish round fix round 3, B5's R19): the head follows the stage handle's
// `subscribePaint` and `paintArmed` as a store, so an arm on the title placeholder, whose write
// path has no block, shows on the button the moment the stage tells it; a shell without a stage
// reads the button not pressed.

const doc = workedDocument();
const SLIDE = 'content-rule';

function shellState(): ShellState {
  const items = Object.keys(doc.slides).map((id) => ({ id, title: id }));
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
    index: items.findIndex((item) => item.id === SLIDE),
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
          onCompactChange={() => undefined}
        >
          <div className="ts-stage" />
        </EditorShell>
      </div>
    </ShellContext>
  );
}

const dispatch = vi.fn(() => Promise.resolve({}));

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

/** A stage handle whose brush the test arms by hand: the store the head subscribes to. */
function brush(): {
  editor: NonNullable<EditorShellInput['editor']>;
  arm: (armed: boolean) => void;
  listeners: () => number;
} {
  const listeners = new Set<(armed: boolean) => void>();
  let armed = false;
  return {
    editor: {
      paintArmed: () => armed,
      subscribePaint: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    arm: (next) => {
      armed = next;
      for (const listener of listeners) listener(next);
    },
    listeners: () => listeners.size,
  };
}

const paintButton = (container: HTMLElement): HTMLElement => {
  const button = container.querySelector<HTMLElement>('[data-control="toolbar.paintFormat"]');
  if (!button) throw new Error('no toolbar.paintFormat');
  return button;
};

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
  dispatch.mockClear();
});

afterEach(async () => {
  hideTooltip();
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('the Paint format button and the brush (docs/archive/rounds/POLISH.md 2.3 item 18)', () => {
  it('reads pressed while the stage says the brush is armed, and not pressed once it disarms', () => {
    const stage = brush();
    const { container } = render(<Harness input={input({ editor: stage.editor })} />);
    const button = paintButton(container);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('is-on')).toBe(false);
    expect(stage.listeners()).toBe(1);

    act(() => stage.arm(true));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('is-on')).toBe(true);

    act(() => stage.arm(false));
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('is-on')).toBe(false);
  });

  it('reads not pressed on a shell without a stage', () => {
    const { container } = render(<Harness input={input()} />);
    expect(paintButton(container).getAttribute('aria-pressed')).toBe('false');
  });

  it('unsubscribes from the brush when the shell unmounts', () => {
    const stage = brush();
    const { unmount } = render(<Harness input={input({ editor: stage.editor })} />);
    expect(stage.listeners()).toBe(1);
    unmount();
    expect(stage.listeners()).toBe(0);
  });
});
