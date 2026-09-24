// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { DownloadDialog, exportReportRows } from '../dialogs/Download';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { ExportProgress } from '../ExportMenu';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Download dialog's report rows (the features round, ship two, docs/FEATURES.md 5.5; the row
// shaders.export.missing-frame-row, B7's; build/b1.md R6): the route's `progress.rows` name what
// the export waited for, the dialog draws each as `dialog.download.report.<id>` while the run is
// in flight, and the direct path says each row once through the snackbar. The rows' content is
// the server's; this file pins the dialog's half over a stubbed progress.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc: DeckDocument = workedDocument();

function host(progress: unknown, say = vi.fn<EditorShellState['say']>()): EditorShellState {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 4,
    dispatch: vi.fn(() => new Promise(() => {})),
    /* `rows` is the optional field the route fills (R6); the type gains it with B7's ExportProgress change */
    export: { progress: progress as ExportProgress | null },
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
  };
}

const SHADERS = { id: 'shaders', text: '2 shaders had no frame; the export waited 8 s for them' };

describe('exportReportRows', () => {
  it('reads the rows of a progress record and drops what is not a row', () => {
    expect(exportReportRows(null)).toEqual([]);
    expect(exportReportRows(undefined)).toEqual([]);
    expect(exportReportRows({ label: 'Preparing' })).toEqual([]);
    expect(exportReportRows({ label: 'Preparing', rows: [SHADERS] })).toEqual([SHADERS]);
    expect(
      exportReportRows({
        rows: [SHADERS, { id: 'bad id', text: 'x' }, { id: 'empty', text: '  ' }, 'x', null],
      }),
    ).toEqual([SHADERS]);
  });
});

describe('the Download dialog draws the rows while the export runs', () => {
  it('draws dialog.download.report.<id> under the progress and says it once on the direct path', () => {
    const say = vi.fn<EditorShellState['say']>();
    /* the direct path: a PDF from the row starts at once and speaks through the snackbar alone */
    const first = render(
      <EditorShellContext value={host({ label: 'Preparing', rows: [SHADERS] }, say)}>
        <DownloadDialog format="pdf" />
      </EditorShellContext>,
    );
    expect(say.mock.calls.map((call) => call[0])).toContain(SHADERS.text);
    expect(say.mock.calls.filter((call) => call[0] === SHADERS.text)).toHaveLength(1);
    first.rerender(
      <EditorShellContext value={host({ label: 'Preparing', rows: [SHADERS] }, say)}>
        <DownloadDialog format="pdf" />
      </EditorShellContext>,
    );
    expect(say.mock.calls.filter((call) => call[0] === SHADERS.text)).toHaveLength(1);
    cleanup();
    /* the dialog path: Download options, the run started by OK */
    const state = host({ label: 'Preparing', rows: [SHADERS] });
    render(
      <EditorShellContext value={state}>
        <DownloadDialog format="pptx" options />
      </EditorShellContext>,
    );
    expect(document.querySelector('[data-control="dialog.download.report.shaders"]')).toBeNull();
    (document.querySelector('[data-control="dialog.download.ok"]') as HTMLButtonElement).click();
    return Promise.resolve().then(() => {
      const row = document.querySelector('[data-control="dialog.download.report.shaders"]');
      expect(row?.textContent).toBe(SHADERS.text);
      expect(row?.classList.contains('ts-dialog-sentence')).toBe(true);
    });
  });
});
