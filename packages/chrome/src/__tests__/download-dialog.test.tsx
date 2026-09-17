// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { DownloadDialog } from '../dialogs/Download';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Download dialog of the focus round (docs/FOCUS.md rank 24, `export.pdf.notes-honest`): the
// PDF builder prints one page per slide and never the speaker notes (packages/export/src/pdf/
// build.ts), so Include speaker notes is offered for a PowerPoint file alone, where the notes parts
// are real (packages/export/src/pptx/build.ts `addSceneNotes`); a PDF download never sends
// `includeNotes`. Audit-export row 15 saw the checked box change nothing but the file's date.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();

function host(dispatch: EditorShellInput['dispatch']): EditorShellState {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 4,
    origin: 'https://x.test',
    dispatch,
  };
  return {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, DEFAULT_SETTINGS, 'mac'),
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
  } satisfies EditorShellState as EditorShellState;
}

function mount(format: 'pptx' | 'pdf') {
  const dispatch = vi.fn(() => Promise.resolve({}));
  const state = host(dispatch as unknown as EditorShellInput['dispatch']);
  const view = render(
    <EditorShellContext value={state}>
      <DownloadDialog format={format} />
    </EditorShellContext>,
  );
  const control = (id: string) => view.container.querySelector(`[data-control="${id}"]`);
  return { view, dispatch, control, state };
}

describe('DownloadDialog and the speaker notes (docs/FOCUS.md rank 24)', () => {
  it('offers Include speaker notes for a PowerPoint file and sends includeNotes when checked', () => {
    const { control, dispatch } = mount('pptx');
    const box = control('dialog.download.includeNotes');
    expect(box).not.toBeNull();
    fireEvent.click(box as HTMLInputElement);
    fireEvent.click(control('dialog.download.ok') as HTMLButtonElement);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [id, input] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe('export.run');
    expect(input.format).toBe('pptx');
    expect(input.includeNotes).toBe(true);
  });

  it('does not offer Include speaker notes for a PDF, says so, and never sends includeNotes', () => {
    const { view, control, dispatch } = mount('pdf');
    expect(control('dialog.download.includeNotes')).toBeNull();
    /* the skipped slides box stays: the PDF builder honours includeSkipped */
    expect(control('dialog.download.includeSkipped')).not.toBeNull();
    expect(view.container.textContent).toContain('The speaker notes are not in the PDF');
    fireEvent.click(control('dialog.download.ok') as HTMLButtonElement);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [id, input] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe('export.run');
    expect(input.format).toBe('pdf');
    expect(input).not.toHaveProperty('includeNotes');
  });
});

// Cycle 2 (VERIFICATION.md F-shapes-export, build/b3.md R19): two downloads in one test, or a
// seller's second download, met a dialog whose OK button had left with the focus on it, so Escape
// reached nothing and the next menu click landed under the scrim. The Dialog now moves the focus
// to Done when the run completes and closes on a document Escape.
describe('DownloadDialog after a run completes', () => {
  it('focuses Done when the file is ready and closes on Escape wherever the focus sits', async () => {
    const { view, control, state } = mount('pdf');
    const ok = control('dialog.download.ok') as HTMLButtonElement;
    ok.focus();
    fireEvent.click(ok);
    await act(async () => {
      await Promise.resolve();
    });
    const done = control('dialog.download.done');
    expect(done).not.toBeNull();
    expect(view.container.textContent).toContain('Your file is ready');
    expect(document.activeElement).toBe(done);
    /* the focus on the body, as after a re-render that removed the focused control */
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(state.closeDialog).toHaveBeenCalledTimes(1);
  });
});
