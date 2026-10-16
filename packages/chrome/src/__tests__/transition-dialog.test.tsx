// @vitest-environment jsdom
// Slide > Transition (HTML-SLIDES-DESIGN 2.5), built like Slide numbers and Playback: Apply to all
// writes the deck's `/defaults/transition` and takes every slide's own away in one commit; Apply to
// selected writes one `slide.set /transition` per selected slide in one commit; Standard removes
// the field; a duration outside 0 to 3 seconds is refused with a sentence and writes nothing; the
// From row shows only for the transitions that travel.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { TransitionDialog } from '../dialogs/Transition';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { hideTooltip } from '../Tooltip';
import { chooseOption } from './choose-option';

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

describe('TransitionDialog', () => {
  it('Apply to all writes the deck’s transition and clears every slide’s own, as one commit', async () => {
    const doc = workedDocument();
    const other = Object.keys(doc.slides).find((id) => id !== SLIDE) as string;
    doc.slides[other] = {
      ...doc.slides[other]!,
      transition: { name: 'crossfade', durationMs: 300 },
    };
    const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
    const closeDialog = vi.fn();
    render(
      <Host input={input(doc, { commit })} closeDialog={closeDialog}>
        <TransitionDialog />
      </Host>,
    );
    expect(screen.getByRole('dialog', { name: 'Transition' })).toBeTruthy();
    chooseOption('dialog.transition.name', 'slide-fade');
    fireEvent.change(control('dialog.transition.duration'), { target: { value: '0.6' } });
    chooseOption('dialog.transition.from', 'left');
    fireEvent.click(control('dialog.transition.apply'));
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      [
        {
          op: 'deck.set',
          path: '/defaults/transition',
          value: { name: 'slide-fade', durationMs: 600, from: 'left' },
        },
        { op: 'slide.set', slideId: other, path: '/transition' },
      ],
      'Transition',
    );
    expect(closeDialog).toHaveBeenCalled();
  });

  it('Apply to selected writes the transition on each selected slide, as one commit', async () => {
    const doc = workedDocument();
    const ids = Object.keys(doc.slides).slice(0, 2);
    const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
    render(
      <Host input={input(doc, { commit, selectedSlideIds: ids })}>
        <TransitionDialog />
      </Host>,
    );
    chooseOption('dialog.transition.name', 'crossfade');
    /* a transition that does not travel has no From row */
    expect(control('dialog.transition.from')).toBeNull();
    fireEvent.click(control('dialog.transition.selected'));
    await flush();
    expect(commit).toHaveBeenCalledWith(
      ids.map((slideId) => ({
        op: 'slide.set',
        slideId,
        path: '/transition',
        value: { name: 'crossfade', durationMs: 400 },
      })),
      'Transition',
    );
  });

  it('opens on the slide’s transition; Standard removes the field and None cuts', async () => {
    const doc = workedDocument();
    doc.deck.defaults = {
      ...doc.deck.defaults,
      transition: { name: 'rise-fade', durationMs: 250 },
    };
    const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
    render(
      <Host input={input(doc, { commit })}>
        <TransitionDialog />
      </Host>,
    );
    expect(control('dialog.transition.name').textContent).toContain('Rise and fade');
    expect((control('dialog.transition.duration') as HTMLInputElement).value).toBe('0.25');
    chooseOption('dialog.transition.name', 'standard');
    expect(control('dialog.transition.duration')).toBeNull();
    fireEvent.click(control('dialog.transition.selected'));
    await flush();
    expect(commit).toHaveBeenLastCalledWith(
      [{ op: 'slide.set', slideId: SLIDE, path: '/transition' }],
      'Transition',
    );
    cleanup();
    render(
      <Host input={input(doc, { commit })}>
        <TransitionDialog />
      </Host>,
    );
    chooseOption('dialog.transition.name', 'none');
    fireEvent.click(control('dialog.transition.selected'));
    await flush();
    expect(commit).toHaveBeenLastCalledWith(
      [
        {
          op: 'slide.set',
          slideId: SLIDE,
          path: '/transition',
          value: { name: 'none', durationMs: 0 },
        },
      ],
      'Transition',
    );
  });

  it('refuses a duration outside 0 to 3 seconds with a sentence and writes nothing', async () => {
    const doc = workedDocument();
    const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
    render(
      <Host input={input(doc, { commit })}>
        <TransitionDialog />
      </Host>,
    );
    chooseOption('dialog.transition.name', 'crossfade');
    fireEvent.change(control('dialog.transition.duration'), { target: { value: '4' } });
    fireEvent.click(control('dialog.transition.apply'));
    await flush();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(DIALOGS.transition.durationRange);
  });
});
