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

/* the tail's fold measure (ToolbarTail.tsx, 3.4) read every slot's width on every render of the
   editor, which is one render per keystroke; it measures when the controls change and when the
   bar or a slot changes size (a ResizeObserver), and not on a render that changes neither */
describe('the toolbar tail fold measure', () => {
  it('reads the slots again on a size change, not on a render with the same controls', () => {
    let reads = 0;
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.dataset.slot !== undefined) reads += 1;
        return 40;
      },
    });
    const sizes: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          sizes.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      const { container, rerender } = render(<Harness input={input()} />);
      expect(container.querySelectorAll('.ts-tb-tail > [data-slot]').length).toBeGreaterThan(0);
      reads = 0;
      /* a new input with the same controls: the editor's render on a keystroke */
      rerender(<Harness input={input({ revision: 413 })} />);
      rerender(<Harness input={input({ revision: 414 })} />);
      expect(reads).toBe(0);
      /* a slot or the bar changed size */
      act(() => {
        for (const size of sizes) size();
      });
      expect(reads).toBeGreaterThan(0);
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width);
      vi.unstubAllGlobals();
    }
  });
});
