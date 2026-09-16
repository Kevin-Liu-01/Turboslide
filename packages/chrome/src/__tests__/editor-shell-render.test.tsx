// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTION_IDS } from '@turboslide/schema/actions';
import type { Block } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import { workedDocument } from '@turboslide/schema/fixtures';

import { RETIRED_KEYS_STORAGE } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShell } from '../EditorShell';
import { cn } from '../lib/cn';
import { MENUS, TOOLBAR_HEAD, TOOLBAR_TAIL_DEFAULT } from '../menus/model';
import { FORBIDDEN_DEFAULT_VIEW_WORDS, SNACKBARS, forbiddenWordsIn } from '../menus/strings';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { useSnackbar } from '../Snackbar';
import { hideTooltip } from '../Tooltip';

// The editor shell rendered in its default state (gslides-parity SPEC 11.1, 12, 13, 14.2): the
// title row, the menu bar with the ten menus, the toolbar in the order of 3.1, the bottom bar;
// no engineering word in the default view's text or tooltips; no action id or JSON pointer in a
// tooltip; the File menu opens, closes on Esc and returns focus; Ctrl+Shift+F is compact mode and
// Esc restores it; Cmd+/ opens the shortcuts dialog; a retired letter shows its sentence once and
// changes nothing; File > Details opens its dialog; Format options opens the empty panel.

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

/* the viewer shell's root as ViewerShell.tsx draws it: `is-compact` follows the shell's report */
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

/**
 * The shell's own stylesheet in the document, so computed styles read the compact rules (Vitest
 * empties a CSS import, `?raw` included, so the file is read from disk next to this test).
 */
function withShellCss(): void {
  const here = import.meta.dirname ?? join(fileURLToPath(import.meta.url), '..');
  const style = document.createElement('style');
  style.setAttribute('data-test-css', 'editor-shell');
  style.textContent = readFileSync(join(here, '..', 'EditorShell.css'), 'utf8');
  document.head.appendChild(style);
}

/** Opens a bar menu and clicks the row (through its submenu rows, in order). */
function clickMenuPath(container: HTMLElement, menu: string, ...ids: string[]): void {
  fireEvent.click(container.querySelector(`[data-control="menubar.${menu}"]`) as HTMLElement);
  for (const id of ids) {
    const row = document.querySelector(`[data-menu-item="${id}"]`);
    if (!(row instanceof HTMLElement)) throw new Error(`no row ${id}`);
    fireEvent.click(row);
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const dispatch = vi.fn(() => Promise.resolve({}));

function input(extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

/** Every word of the default view: the shell's text and its tooltips (data-tip), outside Tools > Advanced. */
function defaultViewText(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.closest('[data-menu-item^="tools.advanced"]')) continue;
    const tip = el.getAttribute('data-tip');
    if (tip) out.push(tip);
    const label = el.getAttribute('aria-label');
    if (label) out.push(label);
  }
  out.push(root.textContent ?? '');
  return out;
}

const ACTION_ID = new RegExp(`\\b(${ACTION_IDS.map((id) => id.replace('.', '\\.')).join('|')})\\b`);
const POINTER = /(^|\s)\/[a-z]+(\/|\s|$)/;

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
  document.head.querySelector('[data-test-css]')?.remove();
  /* useMountEffect defers its cleanup by one task, so the unmounted shell's keydown listener
     would otherwise still see the next test's first key */
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('the editor shell in its default state', () => {
  it('draws the title row, the ten menus, the toolbar of 3.1 and the bottom bar', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    expect(container.querySelector('.ts-title-row')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Presentation title' }).textContent).toBe(
      doc.deck.title,
    );
    expect(screen.getByText('All changes saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Slideshow/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    const titles = [...container.querySelectorAll('[role="menubar"] [role="menuitem"]')].map(
      (el) => el.textContent,
    );
    /* the ten menus; the Accessibility menu joins while screen reader support is on (SPEC-5 7.5) */
    expect(titles).toEqual(
      MENUS.filter((menu) => menu.setting === undefined).map((menu) => menu.label),
    );
    const toolbar = container.querySelector('[data-control="toolbar"]') as HTMLElement;
    const controls = [...toolbar.querySelectorAll<HTMLElement>('[data-control^="toolbar."]')]
      .map((el) => el.dataset.control as string)
      .filter((id) =>
        [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT].some((control) => control.control === id),
      );
    expect(controls).toEqual(
      [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT].map((control) => control.control),
    );
    /* SPEC-3 5.3: Insert comment is live for an editor in Editing mode; gslides-parity SPEC-5
       2.1: Transition opens the Motion panel, so it is live too and in the tab order */
    const comment = toolbar.querySelector('[data-control="toolbar.insertComment"]') as HTMLElement;
    expect(comment.getAttribute('aria-disabled')).toBeNull();
    const transition = toolbar.querySelector('[data-control="toolbar.transition"]') as HTMLElement;
    expect(transition.getAttribute('aria-disabled')).toBeNull();
    expect(transition.hasAttribute('disabled')).toBe(false);
    expect(container.querySelector('[data-control="bottombar"]')).not.toBeNull();
    expect(container.querySelector('[data-control="panel.toggle"]')).not.toBeNull();
    expect(container.querySelector('.ts-rpanel')?.childElementCount).toBe(0);
  });

  it('keeps every engineering word, action id and JSON pointer out of the text and the tooltips', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    for (const text of defaultViewText(container)) {
      expect(forbiddenWordsIn(text), text).toEqual([]);
      expect(ACTION_ID.test(text), `action id in "${text}"`).toBe(false);
      expect(POINTER.test(text), `pointer in "${text}"`).toBe(false);
    }
    for (const el of container.querySelectorAll('[title]'))
      expect(el, 'no native titles').toBeNull();
    expect(FORBIDDEN_DEFAULT_VIEW_WORDS.length).toBeGreaterThan(10);
  });

  it('opens the File menu, keeps its words clean, closes on Esc with focus back on the title', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const file = container.querySelector('[data-control="menubar.file"]') as HTMLElement;
    fireEvent.click(file);
    const menu = screen.getByRole('menu', { name: 'File menu' });
    expect(menu.querySelector('[data-menu-item="file.open"]')).not.toBeNull();
    /* SPEC-3 13.3: Email is present with Email collaborators as its Later row */
    expect(menu.querySelector('[data-menu-item="file.email"]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(menu.querySelector('[data-menu-item="file.move"]')).toBeNull();
    for (const text of defaultViewText(menu)) expect(forbiddenWordsIn(text), text).toEqual([]);
    for (const row of menu.querySelectorAll('[role^="menuitem"]')) {
      expect(row.getAttribute('data-tip')).toBeTruthy();
      expect(row.hasAttribute('title')).toBe(false);
    }
    expect(file.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'File menu' })).toBeNull();
    expect(document.activeElement).toBe(file);
    expect(file.getAttribute('aria-expanded')).toBe('false');
  });

  it('runs File > Details from the menu and the dialog names the presentation', async () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    fireEvent.click(container.querySelector('[data-control="menubar.file"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-menu-item="file.details"]') as HTMLElement);
    /* the dialogs load on first open (gslides-parity SPEC-4 0.44, lib/lazyDialog.ts) */
    const dialog = await screen.findByRole('dialog', { name: 'Details' });
    expect(dialog.querySelector('[data-control="dialog.details.title"]')?.textContent).toBe(
      doc.deck.title,
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Details' })).toBeNull();
  });

  it('Ctrl+Shift+F is compact mode and Esc restores; Cmd+/ opens the shortcuts dialog', async () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    fireEvent.keyDown(document.body, { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true });
    expect(
      container.querySelector('.ts-title-row [data-control="toolbar.showMenus"]'),
    ).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(container.querySelector('[data-control="toolbar.showMenus"]')).toBeNull();
    fireEvent.keyDown(document.body, { key: '/', code: 'Slash', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('binds no bare letter: S shows the one time sentence, changes nothing, and stays quiet after', () => {
    vi.useFakeTimers();
    const shell = shellState();
    const { container } = render(<Harness input={input()} shell={shell} />);
    fireEvent.keyDown(document.body, { key: 's', code: 'KeyS' });
    expect(shell.setSidebar).not.toHaveBeenCalled();
    expect(container.querySelector('[data-control="snackbar"]')?.textContent).toContain(
      'S now hides the filmstrip from the View menu',
    );
    expect(JSON.parse(localStorage.getItem(RETIRED_KEYS_STORAGE) ?? '[]')).toEqual(['s']);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.keyDown(document.body, { key: 's', code: 'KeyS' });
    expect(container.querySelector('[data-control="snackbar"]')?.textContent ?? '').toBe('');
    for (const key of ['g', 'b', 'd', 'e', 'p', 'f'])
      fireEvent.keyDown(document.body, { key, code: `Key${key.toUpperCase()}` });
    expect(shell.setMode).not.toHaveBeenCalled();
    expect(shell.setPresent).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('runs Google’s chords: Ctrl+M is New slide with the current layout after the current slide', async () => {
    render(<Harness input={input()} shell={shellState()} />);
    fireEvent.keyDown(document.body, { key: 'm', code: 'KeyM', ctrlKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith(
      'slide.new',
      expect.objectContaining({ after: SLIDE, baseRevision: 412 }),
    );
  });

  it('Format options opens the empty panel and the bottom chevron closes it', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    fireEvent.click(container.querySelector('[data-control="menubar.format"]') as HTMLElement);
    fireEvent.click(
      document.querySelector('[data-menu-item="format.formatOptions"]') as HTMLElement,
    );
    const panel = container.querySelector('[data-control="panel.formatOptions"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Select something on the slide to see its options');
    fireEvent.click(container.querySelector('[data-control="panel.toggle"]') as HTMLElement);
    expect(container.querySelector('[data-control="panel.formatOptions"]')).toBeNull();
    /* the Theme button opens Themes with the two thumbnails */
    fireEvent.click(container.querySelector('[data-control="toolbar.theme"]') as HTMLElement);
    expect(container.querySelector('[data-control="panel.themes"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-control^="themes.gt."]')).toHaveLength(2);
  });

  it('the New slide arrow opens the layout grid and a tile runs slide.new with that layout', async () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    fireEvent.click(
      container.querySelector('[data-control="toolbar.newSlide.arrow"]') as HTMLElement,
    );
    const grid = screen.getByRole('dialog', { name: 'New slide with layout' });
    expect(grid.querySelectorAll('.ts-layout-tile')).toHaveLength(21);
    fireEvent.click(grid.querySelector('[data-layout="big-number"]') as HTMLElement);
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith(
      'slide.new',
      expect.objectContaining({ layout: 'big-number', after: SLIDE }),
    );
    expect(screen.queryByRole('dialog', { name: 'New slide with layout' })).toBeNull();
  });
});

// The Insert menu, compact mode and the title row after the verifier's pass (VERIFICATION 9.3 to
// 9.7): every Insert row acts, Full screen hides the bars, the title field keeps what is typed,
// and the title row's Last edit and Show all comments carry the audit's hook.
describe('the Insert menu, compact mode and the title row', () => {
  it('Insert > Text box arms the draw tool; without one it writes a text box as an object centred on the sheet', async () => {
    const onDrawTool = vi.fn();
    const first = render(<Harness input={input({ onDrawTool })} shell={shellState()} />);
    clickMenuPath(first.container, 'insert', 'insert.textBox');
    expect(onDrawTool).toHaveBeenCalledWith({ kind: 'text' });
    expect(dispatch).not.toHaveBeenCalled();
    clickMenuPath(first.container, 'insert', 'insert.shape', 'insert.shape.shapes');
    /* the Shapes row opens the shape picker plate (SPEC-2 4.1); a tile arms the draw tool */
    const ellipse = document.querySelector('[data-control="insert.shape.shapes.pick.ellipse"]');
    expect(ellipse).not.toBeNull();
    fireEvent.click(ellipse as HTMLElement);
    expect(onDrawTool).toHaveBeenLastCalledWith({ kind: 'shape', shape: 'ellipse' });
    clickMenuPath(first.container, 'insert', 'insert.line', 'insert.line.rule');
    expect(onDrawTool).toHaveBeenLastCalledWith({ kind: 'line', line: 'rule' });
    cleanup();
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    clickMenuPath(container, 'insert', 'insert.textBox');
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, written] = dispatch.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(action).toBe('block.insert');
    expect(written.slideId).toBe(SLIDE);
    expect(written.slot).toBe('main');
    expect((written.block as Block).type).toBe('text');
    expect((written.block as Block).pos).toBeDefined();
    expect(container.querySelector('[data-control="snackbar"]')?.textContent ?? '').toBe('');
  });

  it('Insert > Table opens the hover grid inside the menu; a cell writes a table of that size with a header row (SPEC-2 0.26)', async () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    clickMenuPath(container, 'insert', 'insert.table');
    /* the plate is the Table row's submenu, not a dialog */
    expect(screen.queryByRole('dialog', { name: 'Table' })).toBeNull();
    const plate = screen.getByRole('menu', { name: 'Table' });
    const grid = plate.querySelector('[data-control="insert.table.grid"]') as HTMLElement;
    expect(grid.getAttribute('role')).toBe('grid');
    expect(plate.querySelectorAll('[data-control^="insert.table.pick."]')).toHaveLength(400);
    const cell = plate.querySelector('[data-control="insert.table.pick.2x3"]') as HTMLElement;
    fireEvent.mouseEnter(cell);
    /* Google's caption: a plain x */
    expect(plate.querySelector('[data-control="insert.table.size"]')?.textContent).toBe('2 x 3');
    expect(plate.querySelectorAll('.ts-tablegrid-cell.is-in')).toHaveLength(6);
    fireEvent.click(cell);
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, written] = dispatch.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(action).toBe('block.insert');
    expect(written.slideId).toBe(SLIDE);
    const block = written.block as TableBlock;
    expect(block.type).toBe('table');
    expect(block.columns).toHaveLength(2);
    expect(block.rows).toHaveLength(3);
    expect(block.rows[0]?.header).toBe(true);
    /* the pick closes the menu */
    expect(screen.queryByRole('menu', { name: 'Table' })).toBeNull();
    /* the arrow keys move the highlight and Enter inserts the pointed size */
    clickMenuPath(container, 'insert', 'insert.table');
    const again = screen.getByRole('menu', { name: 'Table' });
    const grid2 = again.querySelector('[data-control="insert.table.grid"]') as HTMLElement;
    fireEvent.keyDown(grid2, { key: 'ArrowRight' });
    fireEvent.keyDown(grid2, { key: 'ArrowRight' });
    fireEvent.keyDown(grid2, { key: 'ArrowDown' });
    expect(again.querySelector('[data-control="insert.table.size"]')?.textContent).toBe('3 x 2');
    fireEvent.keyDown(grid2, { key: 'Enter' });
    await flush();
    const [, second] = dispatch.mock.calls[1] as unknown as [string, Record<string, unknown>];
    expect((second.block as TableBlock).columns).toHaveLength(3);
    expect((second.block as TableBlock).rows).toHaveLength(2);
  });

  it('Insert > Icon opens the symbol picker; a symbol writes an icon block of that name', async () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    clickMenuPath(container, 'insert', 'insert.icon');
    const dialog = await screen.findByRole('dialog', { name: 'Icon' });
    /* the picker is embedded: one dialog, the host's close button, the symbols with pick ids */
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog.querySelector('[data-control="dialog.insertIcon.filter"]')).not.toBeNull();
    const symbol = dialog.querySelector(
      '[data-control="dialog.insertIcon.pick.check-circle"]',
    ) as HTMLElement;
    fireEvent.click(symbol);
    await flush();
    expect(dispatch).toHaveBeenCalledWith(
      'block.insert',
      expect.objectContaining({
        slideId: SLIDE,
        block: expect.objectContaining({ type: 'icon', name: 'check-circle' }),
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Icon' })).toBeNull();
  });

  it('Insert > Material lists the catalog; a row writes a material block with that recipe', async () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    clickMenuPath(container, 'insert', 'insert.material');
    const dialog = await screen.findByRole('dialog', { name: 'Material' });
    const rows = dialog.querySelectorAll<HTMLElement>(
      '[data-control^="dialog.insertMaterial.pick."]',
    );
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0] as HTMLElement;
    const id = (first.dataset.control ?? '').replace('dialog.insertMaterial.pick.', '');
    fireEvent.click(first);
    await flush();
    expect(dispatch).toHaveBeenCalledWith(
      'block.insert',
      expect.objectContaining({
        slideId: SLIDE,
        block: expect.objectContaining({ type: 'material', materialId: id }),
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Material' })).toBeNull();
  });

  it('Insert > Image > Upload from computer opens the file picker on the current slide; without one it says so', () => {
    const uploadPicture = vi.fn();
    const first = render(<Harness input={input({ uploadPicture })} shell={shellState()} />);
    clickMenuPath(first.container, 'insert', 'insert.image', 'insert.image.upload');
    expect(uploadPicture).toHaveBeenCalledWith({ kind: 'insert', slideId: SLIDE });
    expect(dispatch).not.toHaveBeenCalled();
    cleanup();
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    clickMenuPath(container, 'insert', 'insert.image', 'insert.image.upload');
    expect(dispatch).not.toHaveBeenCalled();
    expect(container.querySelector('[data-control="snackbar"]')?.textContent).toContain(
      SNACKBARS.noFilePicker,
    );
  });

  it('View > Full screen puts is-compact on the root and the shell’s CSS hides the menu bar and the toolbar; Esc restores', () => {
    withShellCss();
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const root = container.querySelector('.pt-viewer') as HTMLElement;
    const menubar = container.querySelector('.ts-menubar') as HTMLElement;
    const toolbar = container.querySelector('.ts-toolbar') as HTMLElement;
    expect(menubar).not.toBeNull();
    expect(getComputedStyle(menubar).display).not.toBe('none');
    clickMenuPath(container, 'view', 'view.fullScreen');
    expect(root.classList.contains('is-compact')).toBe(true);
    expect(getComputedStyle(menubar).display).toBe('none');
    expect(getComputedStyle(toolbar).display).toBe('none');
    expect(container.querySelector('[data-control="toolbar.showMenus"]')).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(root.classList.contains('is-compact')).toBe(false);
    expect(getComputedStyle(menubar).display).not.toBe('none');
    /* the key does the same */
    fireEvent.keyDown(document.body, { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true });
    expect(root.classList.contains('is-compact')).toBe(true);
    expect(getComputedStyle(toolbar).display).toBe('none');
    fireEvent.click(container.querySelector('[data-control="toolbar.showMenus"]') as HTMLElement);
    expect(root.classList.contains('is-compact')).toBe(false);
  });

  it('the title field selects the name once on open and keeps every typed character', () => {
    render(<Harness input={input()} shell={shellState()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Presentation title' }));
    const field = screen.getByRole('textbox', { name: 'Presentation title' }) as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, doc.deck.title.length]);
    /* typing replaces the selection once; the re-render must not select the field again */
    fireEvent.change(field, { target: { value: 'A' } });
    expect(field.value).toBe('A');
    expect(field.selectionStart).toBe(field.selectionEnd);
    fireEvent.change(field, { target: { value: 'Au' } });
    fireEvent.change(field, { target: { value: 'Audit renamed' } });
    expect(field.value).toBe('Audit renamed');
    expect(field.selectionStart).toBe(field.selectionEnd);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith('deck.rename', {
      name: 'Audit renamed',
      baseRevision: 412,
    });
  });

  it('Last edit and Show all comments carry the menu item hook of SPEC 14.4', () => {
    const { container } = render(<Harness input={input()} shell={shellState()} />);
    const row = container.querySelector('[data-control="title.row"]') as HTMLElement;
    const lastEdit = row.querySelector('[data-menu-item="title.lastEdit"]') as HTMLElement;
    expect(lastEdit).not.toBeNull();
    expect(lastEdit.getAttribute('data-control')).toBe('deck.lastEdit');
    fireEvent.click(lastEdit);
    expect(container.querySelector('[data-control="panel.versionHistory"]')).not.toBeNull();
    /* SPEC-3 5.3, 13.1: Show all comments is live and opens the Comments panel */
    const comments = row.querySelector('[data-menu-item="title.comments"]') as HTMLElement;
    expect(comments).not.toBeNull();
    expect(comments.getAttribute('aria-disabled')).toBeNull();
    expect(comments.hasAttribute('disabled')).toBe(false);
    fireEvent.click(comments);
    expect(container.querySelector('[data-control="panel.comments"]')).not.toBeNull();
  });
});
