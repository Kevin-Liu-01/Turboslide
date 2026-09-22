// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { LogoDialog } from './dialogs/Logo';
import { DEFAULT_SETTINGS, buildMenuContext } from './editor-shell';
import type { EditorShellInput, ShellSettings } from './editor-shell';
import { EditorShellContext } from './editor-shell-context';
import type { EditorShellState } from './editor-shell-context';
import { PARKED_CONTROLS, isParked, isParkedIn } from './parked-controls';
import { hideTooltip } from './Tooltip';

// The parked controls (docs/FEATURES.md 7.2, 7.3): an id in the set is not drawn by the surfaces
// that read the module; the same id is drawn when the Advanced tools setting is on; an empty set
// draws everything. The pure rule is pinned over its own set (the committed set is empty until a
// ship parks a control), and the Logo dialog is the surface this lane owns; Overlay.tsx (the
// handles and the bar, B3) and the Shader gallery and section (B5, ship two) pin their reads in
// their own lanes' tests, as 7.3 lists them.

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('isParkedIn', () => {
  const set = new Set(['dialog.logo.everySlide', 'handle.table.row', 'bar.table']);

  it('parks the id itself and every id under it, and nothing beside it', () => {
    expect(isParkedIn('dialog.logo.everySlide', set, {})).toBe(true);
    expect(isParkedIn('handle.table.row', set, {})).toBe(true);
    expect(isParkedIn('handle.table.row.2', set, {})).toBe(true);
    expect(isParkedIn('bar.table.insertRowBelow', set, {})).toBe(true);
    /* a sibling that shares a string prefix is its own control */
    expect(isParkedIn('dialog.logo.everySlideLine', set, {})).toBe(false);
    expect(isParkedIn('handle.table.rows', set, {})).toBe(false);
    expect(isParkedIn('dialog.logo.search', set, {})).toBe(false);
    expect(isParkedIn('bar.chart.editData', set, {})).toBe(false);
  });

  it('is false for every id while Advanced tools is on, and over an empty set', () => {
    expect(isParkedIn('dialog.logo.everySlide', set, { advancedTools: true })).toBe(false);
    expect(isParkedIn('handle.table.row.2', set, { advancedTools: true })).toBe(false);
    expect(isParkedIn('dialog.logo.everySlide', new Set(), {})).toBe(false);
    /* no settings at hand reads as the switch off */
    expect(isParkedIn('dialog.logo.everySlide', set, null)).toBe(true);
    expect(isParkedIn('dialog.logo.everySlide', set, undefined)).toBe(true);
    expect(isParkedIn('dialog.logo.everySlide', set, { advancedTools: 'true' })).toBe(true);
  });

  it('binds the committed set, which is empty until a ship parks a control', async () => {
    /* the module is mocked below for the dialog's surface; the committed module is read here */
    const real = await vi.importActual<typeof import('./parked-controls')>('./parked-controls');
    expect(real.PARKED_CONTROLS.size).toBe(0);
    expect(real.isParked('dialog.logo.everySlide', DEFAULT_SETTINGS)).toBe(false);
    expect(real.isParked('handle.table.row.1', { advancedTools: false })).toBe(false);
    /* the mocked set the dialog tests read */
    expect(PARKED_CONTROLS.size).toBe(2);
    expect(isParked('dialog.logo.everySlide', DEFAULT_SETTINGS)).toBe(true);
  });
});

/* the Logo dialog's reads: the module is replaced with a set that parks the check and the brand
   group, and the dialog is rendered with the switch off and on. The factory is hoisted, so the
   set is spelled inside it. */
vi.mock('./parked-controls', async (importOriginal) => {
  const original = await importOriginal<typeof import('./parked-controls')>();
  const set = new Set<string>(['dialog.logo.everySlide', 'dialog.logo.group.brand']);
  return {
    ...original,
    PARKED_CONTROLS: set,
    isParked: (id: string, settings: Parameters<typeof original.isParked>[1]) =>
      original.isParkedIn(id, set, settings),
  };
});

const doc = workedDocument();

function host(settings: ShellSettings): EditorShellState {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 412,
    dispatch: vi.fn(() => Promise.resolve({})),
    defaultKit: { name: 'General Translation', appearance: 'light' },
  };
  return {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, settings, 'mac'),
    settings,
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
  };
}

const control = (id: string) => document.querySelector(`[data-control="${id}"]`);

describe('the Logo dialog reads the parked set', () => {
  it('draws neither a parked check nor a parked group while the switch is off', () => {
    render(
      createElement(
        EditorShellContext,
        { value: host({ ...DEFAULT_SETTINGS, advancedTools: false }) },
        createElement(LogoDialog, {}),
      ),
    );
    expect(control('dialog.logo')).not.toBeNull();
    expect(control('dialog.logo.search')).not.toBeNull();
    expect(control('dialog.logo.everySlide')).toBeNull();
    expect(control('dialog.logo.group.brand')).toBeNull();
    /* an id the set does not name is drawn */
    expect(control('dialog.logo.source')).not.toBeNull();
  });

  it('draws both when Advanced tools is on', () => {
    render(
      createElement(
        EditorShellContext,
        { value: host({ ...DEFAULT_SETTINGS, advancedTools: true }) },
        createElement(LogoDialog, {}),
      ),
    );
    expect(control('dialog.logo.everySlide')).not.toBeNull();
    expect(control('dialog.logo.group.brand')).not.toBeNull();
    expect(control('dialog.logo.tile.kit')).not.toBeNull();
  });

  it.todo(
    'Overlay.tsx hides a parked handle and the bar (B3 pins it in overlay-component.test.tsx)',
  );
  it.todo('the Shader gallery and the Shader section hide a parked control (B5, ship two)');
});
