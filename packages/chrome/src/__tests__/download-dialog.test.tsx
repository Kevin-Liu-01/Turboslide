// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import {
  DownloadDialog,
  deckHasTableOrChart,
  downloadFileName,
  downloadFileNames,
  estimateSentence,
  progressSentence,
  TABLE_SENTENCE,
} from '../dialogs/Download';
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

/** The worked document with one table on a content slide (rank 8: the row opens the dialog). */
function withTable(): DeckDocument {
  const copy = workedDocument();
  const slide = copy.slides['content-rule'] as ContentSlide;
  const table = { id: 'tbl-1', type: 'table' } as unknown as Block;
  slide.slots.main = [...(slide.slots.main ?? []), table];
  return copy;
}

type SayMock = ReturnType<typeof vi.fn<EditorShellState['say']>>;

function host(
  dispatch: EditorShellInput['dispatch'],
  document: DeckDocument = doc,
  say: SayMock = vi.fn<EditorShellState['say']>(),
): EditorShellState {
  const input: EditorShellInput = {
    deckId: document.deck.id,
    document,
    slideId: 'content-rule',
    revision: 4,
    origin: 'https://x.test',
    dispatch,
    export: { onShowReport: vi.fn() },
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
    say,
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

function mount(
  format: 'pptx' | 'pdf',
  { options = false, document = doc }: { options?: boolean; document?: DeckDocument } = {},
) {
  const dispatch = vi.fn(() => Promise.resolve({}));
  const say = vi.fn<EditorShellState['say']>();
  const state = host(dispatch as unknown as EditorShellInput['dispatch'], document, say);
  const view = render(
    <EditorShellContext value={state}>
      <DownloadDialog format={format} options={options} />
    </EditorShellContext>,
  );
  const control = (id: string) => view.container.querySelector(`[data-control="${id}"]`);
  return { view, dispatch, control, state, say };
}

// The product round (docs/PRODUCT.md section 2 ranks 7, 8 and 11; the rows export.download.
// pdf-direct, pptx-direct, options-dialog, mode-sentence and named-after-title): the PDF row and
// the PowerPoint row of a deck without a table or a chart start the download at once with no
// dialog, the snackbar carrying the progress and the saved name; a deck with a table opens the
// dialog with Editable text preselected and the table sentence; Download options opens the whole
// dialog, which closes itself when the file is saved.
describe('the one click downloads (product round)', () => {
  it('starts a PDF at once from the row: no dialog, the estimate in the snackbar, then the saved name', async () => {
    const { view, dispatch, say, state } = mount('pdf');
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [id, input] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe('export.run');
    expect(input.format).toBe('pdf');
    expect(input).not.toHaveProperty('includeNotes');
    expect(say.mock.calls[0]?.[0]).toMatch(/^Preparing your PDF, about/);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const saved = say.mock.calls.at(-1) as unknown as [string, { label: string } | undefined];
    expect(saved[0]).toBe(`Saved ${doc.deck.title}.pdf`);
    expect(saved[1]?.label).toBe('Details');
    expect(state.closeDialog).toHaveBeenCalledTimes(1);
  });

  it('starts the Perfect PowerPoint at once on a deck without a table or a chart', () => {
    const { view, dispatch } = mount('pptx');
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [, input] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(input.format).toBe('pptx');
    expect(input.mode).toBe('flatten');
  });

  it('opens the dialog for a deck with a table, Editable text preselected under the table sentence', () => {
    const { view, control, dispatch } = mount('pptx', { document: withTable() });
    expect(dispatch).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(control('dialog.download.tableSentence')?.textContent).toBe(TABLE_SENTENCE);
    expect(control('dialog.download.mode.native')?.getAttribute('aria-checked')).toBe('true');
    expect(control('dialog.download.mode.flatten')?.textContent).toContain(
      'Tables and charts are pictures in this mode',
    );
    expect(deckHasTableOrChart(withTable())).toBe(true);
    expect(deckHasTableOrChart(doc)).toBe(false);
  });

  it('names the file after the title, the mode and the appearance the way rank 7 says', () => {
    expect(downloadFileName('GT pitch for Acme', 'x1', 'pdf')).toBe('GT pitch for Acme.pdf');
    expect(downloadFileName('GT pitch for Acme', 'x1', 'pptx', { mode: 'native' })).toBe(
      'GT pitch for Acme (editable).pptx',
    );
    expect(downloadFileName('Q3: "plan" / review?', 'x1', 'pdf')).toBe('Q3 plan review.pdf');
    expect(downloadFileName('Untitled presentation', 'untitled-20260919-ab12', 'pdf')).toBe(
      'untitled-20260919-ab12.pdf',
    );
    expect(downloadFileNames('GT pitch for Acme', 'x1', 'pptx', { theme: 'both' })).toEqual([
      'GT pitch for Acme.pptx',
      'GT pitch for Acme (dark).pptx',
    ]);
  });

  it('reads the progress per slide into the sentence, else the measured estimate, never under 10 s', () => {
    expect(progressSentence('pdf', { label: 'Exporting', line: 'slide 3 of 6' }, 6)).toBe(
      'Preparing your PDF, slide 3 of 6',
    );
    expect(progressSentence('pptx', { label: 'Slide 2 of 6 (dark)' }, 6)).toBe(
      'Preparing your PowerPoint file, slide 2 of 6',
    );
    expect(estimateSentence(1, 'pdf', 1.2)).toBe(
      'Preparing your PDF, about 10 seconds for 1 slide',
    );
    expect(estimateSentence(85, 'pptx', 2.5)).toBe(
      'Preparing your PowerPoint file, about 4 minutes for 85 slides',
    );
  });
});

describe('DownloadDialog and the speaker notes (docs/FOCUS.md rank 24)', () => {
  it('offers Include speaker notes for a PowerPoint file and sends includeNotes when checked', () => {
    const { control, dispatch } = mount('pptx', { options: true });
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
    const { view, control, dispatch } = mount('pdf', { options: true });
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

// The dialog closes itself when the file is saved (docs/PRODUCT.md section 2 rank 8) and the
// snackbar names the file with Details; cycle 2's Escape rule (VERIFICATION.md F-shapes-export,
// build/b3.md R19) stays the Dialog component's and is covered by dialog.test.tsx.
describe('DownloadDialog after a run completes', () => {
  it('closes itself and names the saved file with Details', async () => {
    const { control, state, say } = mount('pdf', { options: true });
    fireEvent.click(control('dialog.download.ok') as HTMLButtonElement);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(state.closeDialog).toHaveBeenCalledTimes(1);
    const saved = say.mock.calls.at(-1) as unknown as [string, { label: string } | undefined];
    expect(saved[0]).toBe(`Saved ${doc.deck.title}.pdf`);
    expect(saved[1]?.label).toBe('Details');
  });
});
