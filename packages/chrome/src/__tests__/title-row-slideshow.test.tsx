// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { EditorShellInput } from '../editor-shell';
import { EditorShell } from '../EditorShell';
import { cn } from '../lib/cn';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { useSnackbar } from '../Snackbar';
import { SLIDESHOW_MENU_ID } from '../TitleRow';
import { hideTooltip } from '../Tooltip';

// The title row's right cluster of the return round (docs/RETURN.md 4.1, 4.3; build/b1.md
// "Return round"): the Slideshow split button as one control (the group, the two halves, the
// ARIA of a split button with aria-controls only while the menu is mounted, ArrowDown on the label
// opening the options with focus returning to the half that opened them, the menu anchored to the
// whole control), a bare Enter on a title row button left to the button (the shell's key.commit
// swallows it only while a crop is open), the comments glyph as a toggle, the inbox slot marked
// empty while the plate is parked, and View > Mode > Viewing drawing no toolbar.

const doc = workedDocument();
const SLIDE = 'content-rule';

function shellState(overrides: Partial<ShellState> = {}): ShellState {
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

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

function control(root: ParentNode, id: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-control="${id}"]`);
  if (el === null) throw new Error(`no control ${id}`);
  return el;
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
  })) as typeof window.matchMedia;
  localStorage.clear();
  dispatch.mockClear();
});

afterEach(() => {
  hideTooltip();
  cleanup();
  document.querySelector('.ts-crop-frame')?.remove();
});

describe('the Slideshow split button as one control (docs/RETURN.md 4.1)', () => {
  it('is a group labelled Slideshow around the label half and the chevron half, with the ARIA of a split button', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const split = control(container, 'present.split');
    expect(split.getAttribute('role')).toBe('group');
    expect(split.getAttribute('aria-label')).toBe('Slideshow');
    expect(split.classList.contains('ts-title-slideshow')).toBe(true);
    const label = control(split, 'present.open');
    const arrow = control(split, 'present.arrow');
    expect([...split.children]).toEqual([label, arrow]);
    /* the play glyph comes before the word in the markup, and the sheet keeps the row order */
    expect(label.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(label.querySelector('.pt-lb')?.textContent).toBe('Slideshow');
    expect(label.classList.contains('pt-ib')).toBe(true);
    expect(label.classList.contains('is-solid')).toBe(true);
    expect(label.hasAttribute('aria-haspopup')).toBe(false);
    expect(arrow.getAttribute('aria-label')).toBe('Presentation options');
    expect(arrow.getAttribute('aria-haspopup')).toBe('menu');
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    /* aria-controls names the menu only while it is mounted (a closed chevron would otherwise name
       an id that is not in the document) */
    expect(arrow.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(SLIDESHOW_MENU_ID)).toBeNull();
  });

  it('the chevron opens the options with aria-expanded and aria-controls, Escape closes and returns focus to the chevron', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const arrow = control(container, 'present.arrow');
    fireEvent.click(arrow);
    const menu = document.getElementById(SLIDESHOW_MENU_ID);
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(arrow.getAttribute('aria-expanded')).toBe('true');
    expect(arrow.getAttribute('aria-controls')).toBe(SLIDESHOW_MENU_ID);
    const rows = [...menu!.querySelectorAll<HTMLElement>('[data-menu-item]')].map(
      (el) => el.dataset.menuItem,
    );
    expect(rows).toContain('title.slideshow.presenterView');
    expect(rows).toContain('title.slideshow.startFromBeginning');
    fireEvent.keyDown(menu!, { key: 'Escape' });
    expect(document.getElementById(SLIDESHOW_MENU_ID)).toBeNull();
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    expect(arrow.hasAttribute('aria-controls')).toBe(false);
    expect(document.activeElement).toBe(arrow);
    /* a second click on the chevron while open closes the menu */
    fireEvent.click(arrow);
    expect(document.getElementById(SLIDESHOW_MENU_ID)).not.toBeNull();
    fireEvent.click(arrow);
    expect(document.getElementById(SLIDESHOW_MENU_ID)).toBeNull();
  });

  it('ArrowDown on the label half opens the options; Escape returns focus to the label half', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const label = control(container, 'present.open');
    const arrow = control(container, 'present.arrow');
    label.focus();
    fireEvent.keyDown(label, { key: 'ArrowDown' });
    const menu = document.getElementById(SLIDESHOW_MENU_ID);
    expect(menu).not.toBeNull();
    expect(arrow.getAttribute('aria-expanded')).toBe('true');
    expect(arrow.getAttribute('aria-controls')).toBe(SLIDESHOW_MENU_ID);
    fireEvent.keyDown(menu!, { key: 'Escape' });
    expect(document.getElementById(SLIDESHOW_MENU_ID)).toBeNull();
    expect(document.activeElement).toBe(label);
    /* a modified Down arrow is not the menu's key */
    fireEvent.keyDown(label, { key: 'ArrowDown', metaKey: true });
    expect(document.getElementById(SLIDESHOW_MENU_ID)).toBeNull();
  });

  it('the label half presents on click; a row of the options runs and closes the menu', async () => {
    const shell = shellState();
    const { container } = render(<Harness input={input()} shell={shell} />);
    fireEvent.click(control(container, 'present.open'));
    await Promise.resolve();
    expect(dispatch).toHaveBeenCalledWith('view.present', expect.objectContaining({ on: true }));
    fireEvent.click(control(container, 'present.arrow'));
    const row = document.querySelector<HTMLElement>(
      `#${SLIDESHOW_MENU_ID} [data-menu-item="title.slideshow.startFromBeginning"]`,
    );
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(document.getElementById(SLIDESHOW_MENU_ID)).toBeNull();
  });

  it('leaves a bare Enter on a title row button to the button, and finishes an open crop with it (key.commit)', () => {
    const exitCrop = vi.fn();
    const { container } = render(
      <Harness input={input({ editor: { exitCrop } })} shell={shellState()} />,
    );
    const label = control(container, 'present.open');
    const arrow = control(container, 'present.arrow');
    /* no crop open: the key table does not prevent the default, so the browser activates the button */
    label.focus();
    expect(fireEvent.keyDown(label, { key: 'Enter', code: 'Enter' })).toBe(true);
    arrow.focus();
    expect(fireEvent.keyDown(arrow, { key: 'Enter', code: 'Enter' })).toBe(true);
    expect(exitCrop).not.toHaveBeenCalled();
    /* Space was never taken (the drive read defaultPrevented false for it) */
    expect(fireEvent.keyDown(arrow, { key: ' ', code: 'Space' })).toBe(true);
    /* a crop open on the stage: the same key finishes it and is consumed */
    const frame = document.createElement('div');
    frame.className = 'ts-crop-frame';
    document.body.appendChild(frame);
    expect(fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' })).toBe(false);
    expect(exitCrop).toHaveBeenCalledTimes(1);
  });
});

describe('the right cluster (docs/RETURN.md 4.3)', () => {
  it('the comments glyph toggles the Comments panel with aria-pressed', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const glyph = control(container, 'title.comments');
    expect(glyph.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-control="panel.comments"]')).toBeNull();
    fireEvent.click(glyph);
    expect(container.querySelector('[data-control="panel.comments"]')).not.toBeNull();
    expect(glyph.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(glyph);
    expect(container.querySelector('[data-control="panel.comments"]')).toBeNull();
    expect(glyph.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the inbox slot empty while the plate is parked and the +N chip empty while nobody else is present', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const slot = control(container, 'title.inbox.slot');
    expect(slot.classList.contains('is-empty')).toBe(true);
    expect(slot.querySelector('[data-control="title.inbox"]')).toBeNull();
    const more = control(container, 'presence.more');
    expect(more.classList.contains('is-empty')).toBe(true);
    expect(more.textContent).toBe('');
    /* Share and the split button stand side by side, Share last but for the compact chevron */
    const right = container.querySelector('.ts-title-r') as HTMLElement;
    const order = [...right.querySelectorAll<HTMLElement>('[data-control]')]
      .map((el) => el.dataset.control)
      .filter((id) =>
        [
          'title.presence',
          'title.comments.slot',
          'title.inbox.slot',
          'present.split',
          'share.slot',
        ].includes(id ?? ''),
      );
    expect(order).toEqual([
      'title.presence',
      'title.comments.slot',
      'title.inbox.slot',
      'present.split',
      'share.slot',
    ]);
  });
});

describe('View > Mode > Viewing (docs/RETURN.md 2.14 item 6)', () => {
  it('draws no toolbar in Viewing and the toolbar in Editing and Commenting', () => {
    const viewing = render(<Harness input={input({ mode: 'viewing' })} shell={shellState()} />);
    expect(viewing.container.querySelector('.pt-viewer')?.getAttribute('data-edit-mode')).toBe(
      'viewing',
    );
    expect(viewing.container.querySelector('[data-control="toolbar"]')).toBeNull();
    expect(viewing.container.querySelector('.ts-menubar')).not.toBeNull();
    cleanup();
    for (const mode of ['editing', 'commenting'] as const) {
      const { container } = render(<Harness input={input({ mode })} shell={shellState()} />);
      expect(container.querySelector('.pt-viewer')?.getAttribute('data-edit-mode')).toBe(mode);
      expect(container.querySelector('[data-control="toolbar"]')).not.toBeNull();
      cleanup();
    }
  });

  it("keeps the tail's end for a viewer: the View only button of SPEC-3 6.3, and no head", () => {
    const { container } = render(
      <Harness
        input={input({ mode: 'viewing', role: 'viewer', capabilities: ['read'] })}
        shell={shellState()}
      />,
    );
    expect(container.querySelector('.pt-viewer')?.getAttribute('data-edit-mode')).toBe('viewing');
    const toolbar = container.querySelector('[data-control="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.classList.contains('is-view-only')).toBe(true);
    expect(container.querySelector('[data-control="toolbar.viewOnly"]')?.textContent?.trim()).toBe(
      'View only',
    );
    expect(container.querySelector('[data-control="toolbar.undo"]')).toBeNull();
  });
});
