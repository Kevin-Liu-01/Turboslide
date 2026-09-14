// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { BackgroundDialog } from '../dialogs/Background';
import { CustomSpacingDialog } from '../dialogs/CustomSpacing';
import { SpecialCharactersDialog } from '../dialogs/SpecialCharacters';
import { SPECIAL_CHARACTERS, searchSpecialCharacters } from '../dialogs/special-characters-data';
import { WordArtBar } from '../dialogs/WordArtBar';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The dialogs of round two (gslides-parity SPEC-2 0.20, 0.36, 0.74, 4.1, section 5, section 10):
// Background writes the slide's colour on Done and the deck default on Add to theme and inserts a
// picture object from the presentation's pictures; Custom spacing is one text.spacing; the special
// characters dialog searches a committed table by name and inserts at the caret or into a new text
// box; the word art bar inserts on Enter and cancels on Esc. Every control carries the tooltip
// primitive and no native title.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();
const SLIDE = 'content-rule';
const dispatch = vi.fn(() => Promise.resolve({ revision: 413 }));

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
    focusTitle: vi.fn(),
    registerTitleField: vi.fn(),
    commentCard: null,
    openCommentCard: vi.fn(),
    closeCommentCard: vi.fn(),
    stepComment: vi.fn(),
    diff: null,
  } satisfies EditorShellState;
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function noTitles(): void {
  for (const el of document.querySelectorAll('[title]')) expect(el, 'no native titles').toBeNull();
}

describe('BackgroundDialog', () => {
  it('writes the slide colour on Done, the deck default on Add to theme, and previews through the editor', async () => {
    dispatch.mockClear();
    const previewBackground = vi.fn();
    render(
      <Host input={input({ editor: { previewBackground } })}>
        <BackgroundDialog />
      </Host>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Background' });
    expect(dialog.querySelectorAll('[role="radio"]').length).toBeGreaterThan(8);
    fireEvent.click(
      dialog.querySelector('[data-control="dialog.background.color.plate"]') as HTMLElement,
    );
    expect(previewBackground).toHaveBeenLastCalledWith({ color: 'plate' });
    fireEvent.click(
      dialog.querySelector('[data-control="dialog.background.addToTheme"]') as HTMLElement,
    );
    await flush();
    expect(dispatch).toHaveBeenCalledWith('deck.setBackground', {
      background: { color: 'plate' },
      baseRevision: 412,
    });
    fireEvent.click(dialog.querySelector('[data-control="dialog.background.done"]') as HTMLElement);
    await flush();
    expect(dispatch).toHaveBeenCalledWith('slide.setBackground', {
      slideIds: [SLIDE],
      background: { color: 'plate' },
      baseRevision: 412,
    });
    noTitles();
  });

  it('Choose from this presentation inserts the picture object at the bottom of the stack through the editor’s handle when wired, else two writes', async () => {
    dispatch.mockClear();
    const insertBackgroundPicture = vi.fn();
    const asset = Object.keys(doc.deck.assets)[0] ?? '';
    render(
      <Host input={input({ editor: { insertBackgroundPicture } })}>
        <BackgroundDialog />
      </Host>,
    );
    fireEvent.click(
      document.querySelector(`[data-control="dialog.background.choose.${asset}"]`) as HTMLElement,
    );
    expect(insertBackgroundPicture).toHaveBeenCalledWith(asset);
    cleanup();
    render(
      <Host input={input()}>
        <BackgroundDialog />
      </Host>,
    );
    fireEvent.click(
      document.querySelector(`[data-control="dialog.background.choose.${asset}"]`) as HTMLElement,
    );
    await flush();
    await flush();
    const [action, written] = dispatch.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(action).toBe('block.insert');
    expect(written.slot).toBe('main');
    expect((written.block as Block).type).toBe('picture');
    expect((written.block as Block).pos).toEqual({ x: 0, y: 0, w: 1600, h: 900, z: 0 });
    const [second, order] = dispatch.mock.calls[1] as unknown as [string, Record<string, unknown>];
    expect(second).toBe('block.order');
    expect(order.move).toBe('back');
    expect(order.baseRevision).toBe(413);
  });
});

describe('CustomSpacingDialog', () => {
  it('is one text.spacing on the selected text block with the three fields', async () => {
    dispatch.mockClear();
    const slide = doc.slides[SLIDE] as Slide;
    const paragraph =
      slide.kind === 'content'
        ? Object.values(slide.slots)
            .flatMap((blocks) => blocks ?? [])
            .find((block) => block.type === 'paragraph')
        : undefined;
    render(
      <Host input={input({ selection: { blockId: paragraph?.id } })}>
        <CustomSpacingDialog />
      </Host>,
    );
    fireEvent.change(screen.getByLabelText('Line spacing'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Before (px)'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('After (px)'), { target: { value: '0' } });
    fireEvent.click(
      document.querySelector('[data-control="dialog.customSpacing.apply"]') as HTMLElement,
    );
    await flush();
    expect(dispatch).toHaveBeenCalledWith('text.spacing', {
      slideId: SLIDE,
      blockIds: [paragraph?.id],
      line: 1.5,
      before: 8,
      after: null,
      baseRevision: 412,
    });
    noTitles();
  });
});

describe('SpecialCharactersDialog', () => {
  it('searches the table by name and inserts at the caret through text.insert, else into a new text box', async () => {
    expect(SPECIAL_CHARACTERS.length).toBeGreaterThan(300);
    expect(searchSpecialCharacters('rightwards arrow', null)[0]?.char).toBe('→');
    expect(
      searchSpecialCharacters('', 'Currency').every((entry) => entry.category === 'Currency'),
    ).toBe(true);
    dispatch.mockClear();
    const slide = doc.slides[SLIDE] as Slide;
    const heading =
      slide.kind === 'content'
        ? Object.values(slide.slots)
            .flatMap((blocks) => blocks ?? [])
            .find((block) => block.type === 'heading')
        : undefined;
    const { unmount } = render(
      <Host input={input({ selection: { blockId: heading?.id, text: true, range: [2, 2] } })}>
        <SpecialCharactersDialog />
      </Host>,
    );
    const search = screen.getByRole('searchbox', { name: 'Search by name' });
    fireEvent.change(search, { target: { value: 'euro sign' } });
    const tile = document.querySelector(
      '[data-control="dialog.specialCharacters.pick.8364"]',
    ) as HTMLElement;
    expect(tile.getAttribute('aria-label')).toBe('Euro sign');
    fireEvent.click(tile);
    await flush();
    expect(dispatch).toHaveBeenCalledWith('text.insert', {
      slideId: SLIDE,
      blockId: heading?.id,
      path: '/text',
      at: 2,
      text: '€',
      baseRevision: 412,
    });
    expect(
      document.querySelector('[data-control="dialog.specialCharacters.notice"]')?.textContent,
    ).toBe('Inserted Euro sign');
    noTitles();
    unmount();
    dispatch.mockClear();
    render(
      <Host input={input()}>
        <SpecialCharactersDialog />
      </Host>,
    );
    fireEvent.click(
      document.querySelector('[data-control="dialog.specialCharacters.pick.8594"]') as HTMLElement,
    );
    await flush();
    const [action, written] = dispatch.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(action).toBe('block.insert');
    expect((written.block as Block).type).toBe('text');
    expect((written.block as { text: string }).text).toBe('→');
  });
});

describe('WordArtBar', () => {
  it('inserts the typed text on Enter and cancels on Esc', () => {
    const onInsert = vi.fn();
    const onCancel = vi.fn();
    render(<WordArtBar onInsert={onInsert} onCancel={onCancel} />);
    const field = screen.getByRole('textbox', { name: 'Word art' });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onInsert).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'Hello' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onInsert).toHaveBeenCalledWith('Hello');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    noTitles();
  });
});
