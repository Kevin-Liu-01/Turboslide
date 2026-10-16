// @vitest-environment jsdom
// Slide > Playback (the shader design 3.1 and 3.8, the fields named by the HTML slides design 2.2):
// Apply writes the deck's `/defaults/play` and takes every slide's own word away in one commit;
// Apply to selected writes one `slide.set /play` per selected slide in one commit; the radios open
// on the current slide's Playback.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { PlaybackDialog } from '../dialogs/Playback';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

afterEach(() => {
  hideTooltip();
  cleanup();
});

const SLIDE = 'content-rule';
const dispatch = vi.fn(() => Promise.resolve({ revision: 413 }));

function input(doc: DeckDocument, extra: Partial<EditorShellInput> = {}): EditorShellInput {
  return { deckId: doc.deck.id, document: doc, slideId: SLIDE, revision: 412, dispatch, ...extra };
}

function Host({
  input: value,
  children,
  closeDialog = vi.fn(),
}: {
  input: EditorShellInput;
  children: React.ReactNode;
  closeDialog?: () => void;
}) {
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
    closeDialog,
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

function control(id: string): HTMLElement {
  return document.querySelector(`[data-control="${id}"]`) as HTMLElement;
}

describe('PlaybackDialog', () => {
  it('Apply writes the deck’s play and clears every slide’s own word, as one commit', async () => {
    const doc = workedDocument();
    const other = Object.keys(doc.slides).find((id) => id !== SLIDE) as string;
    doc.slides[other] = { ...doc.slides[other]!, play: 'play' };
    const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
    const closeDialog = vi.fn();
    render(
      <Host input={input(doc, { commit })} closeDialog={closeDialog}>
        <PlaybackDialog />
      </Host>,
    );
    expect(screen.getByRole('dialog', { name: 'Playback' })).toBeTruthy();
    fireEvent.click(control('dialog.playback.hold'));
    fireEvent.click(control('dialog.playback.apply'));
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      [
        { op: 'deck.set', path: '/defaults/play', value: 'hold' },
        { op: 'slide.set', slideId: other, path: '/play' },
      ],
      'Playback',
    );
    expect(closeDialog).toHaveBeenCalled();
  });

  it('Apply to selected writes play on each selected slide, as one commit', async () => {
    const doc = workedDocument();
    doc.deck.defaults = { ...doc.deck.defaults, play: 'hold' };
    const ids = Object.keys(doc.slides).slice(0, 2);
    const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
    render(
      <Host input={input(doc, { commit, selectedSlideIds: ids })}>
        <PlaybackDialog />
      </Host>,
    );
    /* the radios open on the slide's Playback: the deck holds */
    expect((control('dialog.playback.hold') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(control('dialog.playback.play'));
    fireEvent.click(control('dialog.playback.selected'));
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      ids.map((slideId) => ({ op: 'slide.set', slideId, path: '/play', value: 'play' })),
      'Playback',
    );
  });
});
