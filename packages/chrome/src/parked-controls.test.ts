// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { LogoDialog } from './dialogs/Logo';
import { ShaderGalleryDialog } from './dialogs/ShaderGallery';
import { DEFAULT_SETTINGS, buildMenuContext } from './editor-shell';
import type { EditorShellInput, ShellSettings } from './editor-shell';
import { EditorShellContext } from './editor-shell-context';
import type { EditorShellState } from './editor-shell-context';
import { PARKED_CONTROLS, isParked, isParkedIn } from './parked-controls';
import { hideTooltip } from './Tooltip';

// The parked controls (docs/FEATURES.md 7.2, 7.3): an id in the set is not drawn by the surfaces
// that read the module; the same id is drawn when the Advanced tools setting is on; an empty set
// draws everything. The pure rule is pinned over its own set, the committed set is pinned to the
// parked list of the ship (ship-f1afe1e.json), and the Logo dialog and the Shader gallery (ship
// two) are the surfaces this lane owns; Overlay.tsx (the handles and the bar, B3) and the Shader
// section (B5, ship two) pin their reads in their own lanes' tests, as 7.3 lists them.

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

  it('binds the committed set, the parked list of the features round, ship one', async () => {
    /* the module is mocked below for the dialog's surface; the committed module is read here. The
       set is what core-matrix.mjs --emit-parked wrote from docs/gslides-parity/focus/ship-f1afe1e.json:
       the union of the `parks` of its ten parkedRows (the two carried rows of the earlier ships and
       the eight P1 rows of ship one whose controls are not on the build), sorted */
    const real = await vi.importActual<typeof import('./parked-controls')>('./parked-controls');
    expect([...real.PARKED_CONTROLS].sort()).toEqual([
      'bar.table',
      'dialog.logo.kind.wordmark',
      'dialog.logo.tone.mono',
      'file.versionHistory.showChanges',
      'handle.table.add.column',
      'handle.table.add.row',
      'handle.table.head.column',
      'handle.table.head.row',
      'handle.table.row',
      'panel.brand.logo.find',
      'toolbar.group.text',
      'toolbar.wordart.outline',
      'view.livePointers.collaborators',
      'view.livePointers.mine',
    ]);
    /* a P1 family and a carried row are parked while the switch is off, and drawn while it is on */
    expect(real.isParked('handle.table.row.1', { advancedTools: false })).toBe(true);
    expect(real.isParked('bar.table.insertRowBelow', DEFAULT_SETTINGS)).toBe(true);
    expect(real.isParked('view.livePointers.mine', DEFAULT_SETTINGS)).toBe(true);
    expect(real.isParked('handle.table.row.1', { advancedTools: true })).toBe(false);
    /* a control of the picker that ships is not in the set; the Go to slide word left the list */
    expect(real.isParked('dialog.logo.everySlide', DEFAULT_SETTINGS)).toBe(false);
    expect(real.isParked('dialog.logo.search', DEFAULT_SETTINGS)).toBe(false);
    expect(real.isParked('bar.chart.editData', DEFAULT_SETTINGS)).toBe(false);
    expect(real.isParked('title.presence.goTo', DEFAULT_SETTINGS)).toBe(false);
    /* the mocked set the dialog tests read */
    expect(PARKED_CONTROLS.size).toBe(4);
    expect(isParked('dialog.logo.everySlide', DEFAULT_SETTINGS)).toBe(true);
    expect(isParked('dialog.shader.category.metal', DEFAULT_SETTINGS)).toBe(true);
  });
});

/* the Logo dialog's and the Shader gallery's reads: the module is replaced with a set that parks
   the check and the brand group of the Logo dialog and the Metal chip and the hover mount of the
   gallery, and each dialog is rendered with the switch off and on. The factory is hoisted, so the
   set is spelled inside it. */
vi.mock('./parked-controls', async (importOriginal) => {
  const original = await importOriginal<typeof import('./parked-controls')>();
  const set = new Set<string>([
    'dialog.logo.everySlide',
    'dialog.logo.group.brand',
    'dialog.shader.category.metal',
    'dialog.shader.hover',
  ]);
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
  it.todo('the Shader section hides a parked formatOptions.shader.* control (B5, ship two)');
});

describe('the Shader gallery reads the parked set (ship two)', () => {
  it('draws neither a parked chip nor the hover host while the switch is off', () => {
    render(
      createElement(
        EditorShellContext,
        { value: host({ ...DEFAULT_SETTINGS, advancedTools: false }) },
        createElement(ShaderGalleryDialog, {}),
      ),
    );
    expect(control('dialog.shader')).not.toBeNull();
    expect(control('dialog.shader.search')).not.toBeNull();
    expect(control('dialog.shader.category.fluid')).not.toBeNull();
    expect(control('dialog.shader.category.metal')).toBeNull();
    /* a parked hover mount leaves no host under any card */
    expect(document.querySelectorAll('.ts-shader-hover')).toHaveLength(0);
    /* an id the set does not name is drawn */
    expect(control('dialog.shader.tile.paper:liquid-metal')).not.toBeNull();
  });

  it('draws both when Advanced tools is on', () => {
    render(
      createElement(
        EditorShellContext,
        { value: host({ ...DEFAULT_SETTINGS, advancedTools: true }) },
        createElement(ShaderGalleryDialog, {}),
      ),
    );
    expect(control('dialog.shader.category.metal')).not.toBeNull();
    expect(document.querySelectorAll('.ts-shader-hover').length).toBeGreaterThan(0);
  });
});
