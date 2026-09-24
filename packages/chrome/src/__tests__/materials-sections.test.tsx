// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Block, MaterialBlock, PictureBlock } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { LIQUID_METAL_DIAMOND, WORKED_DECK, workedDocument } from '@turboslide/schema/fixtures';

import { AssetPicker, filterAssets } from '../AssetPicker';
import { BackgroundDialog } from '../dialogs/Background';
import type { EditorDispatch } from '../dispatch';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorHandle, EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { Inspector } from '../Inspector';
import { AssetIntake } from '../inspector/asset';
import {
  DitherFormatSection,
  DitherSection,
  defaultPlate,
  draftTreatment,
  metricsWords,
  patchDither,
} from '../inspector/dither';
import type { SectionWrite } from '../inspector/fields';
import { DITHER } from '../menus/strings';
import { TIP_DELAY_MS, hideTooltip, shownTooltipAnchor } from '../Tooltip';

// The M5 editor surfaces (MILESTONES M5 items 1 to 3): the asset picker over the deck's twins,
// the dither tool with its generated treatment controls and its two writes, and the intake form
// that ends in one asset.add. Every control carries the label and data-control id the window API
// matches (SPEC 6.5, 7.4). Round one's Material section left this panel in the features round,
// ship two (docs/FEATURES.md 5.3): its one home is the Shader section of Format options
// (__tests__/shader-section.test.tsx) and the Background dialog's Shader row is
// __tests__/background-shader.test.tsx.

afterEach(cleanup);

const block: MaterialBlock = {
  id: 'mat',
  type: 'material',
  materialId: 'paper:liquid-metal',
  preset: 'diamond',
  anchor: 5500,
  twoTone: true,
  plate: 'lower-left',
  alt: 'A liquid metal diamond, dithered',
};

const slide: Slide = {
  schemaVersion: 1,
  id: 'mats',
  kind: 'content',
  layout: { type: 'center' },
  slots: { main: [block] },
};

describe('AssetPicker', () => {
  it('lists the deck assets with data-control ids, filters, and picks on click', () => {
    const onPick = vi.fn();
    render(
      <AssetPicker
        assets={WORKED_DECK.assets}
        value="site-home"
        label="fig: Asset picker"
        control="block.fig.asset.picker"
        onPick={onPick}
      />,
    );
    const list = screen.getByRole('listbox', { name: 'fig: Asset picker list' });
    expect(list.querySelectorAll('[role="option"]').length).toBe(
      Object.keys(WORKED_DECK.assets).length,
    );
    const row = screen.getByRole('option', { name: /liquid-metal-diamond/ });
    expect(row.getAttribute('data-control')).toBe('block.fig.asset.picker.liquid-metal-diamond');
    fireEvent.change(screen.getByLabelText('fig: Asset picker filter'), {
      target: { value: 'earth' },
    });
    expect(list.querySelectorAll('[role="option"]').length).toBe(1);
    fireEvent.click(screen.getByRole('option', { name: /mood-earth/ }));
    expect(onPick).toHaveBeenCalledWith('mood-earth');
    expect(filterAssets(WORKED_DECK.assets, '', 'opener').map((a) => a.id)).toEqual([
      'liquid-metal-diamond',
    ]);
  });
});

describe('DitherSection', () => {
  it('generates the treatment controls, shows the recorded metrics without a source, and writes asset.dither', async () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const asset: Asset = LIQUID_METAL_DIAMOND;
    render(<DitherSection asset={asset} revision={13} dispatch={dispatch} />);
    for (const label of [
      'Black point',
      'White point',
      'Gamma',
      'Blur',
      'Channel',
      'Invert',
      'Min filter',
      'Polarity',
      'Crop',
    ]) {
      expect(screen.getByLabelText(`liquid-metal-diamond: ${label}`), label).toBeTruthy();
    }
    expect(
      screen.getByLabelText('liquid-metal-diamond: Black point').getAttribute('data-control'),
    ).toBe('asset.liquid-metal-diamond.treatment.black');
    expect(screen.getByText('20.7 percent')).toBeTruthy();
    expect(screen.getAllByText('0 cells')).toHaveLength(2);
    expect(screen.getByText(/not in the deck \(sourceFile\)/)).toBeTruthy();
    expect(defaultPlate(asset)).toBe('lower-left');
    expect(draftTreatment(asset)).toBe(asset.treatment);
    fireEvent.click(screen.getByRole('button', { name: /^Recapture/ }));
    expect(dispatch).toHaveBeenCalledWith('asset.dither', {
      assetId: 'liquid-metal-diamond',
      treatment: asset.treatment,
      plate: 'lower-left',
      baseRevision: 13,
    });
    fireEvent.click(screen.getByRole('button', { name: /^Measure/ }));
    expect(dispatch).toHaveBeenLastCalledWith('asset.dither', {
      assetId: 'liquid-metal-diamond',
      fromRecorded: true,
      plate: 'lower-left',
      baseRevision: 13,
    });
    expect(screen.getByRole('button', { name: /^Recapture/ }).getAttribute('data-control')).toBe(
      'asset.liquid-metal-diamond.recapture',
    );
  });
});

describe('AssetIntake', () => {
  it('dispatches one asset.add with the license fields', async () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({ id: 'wave', role: 'mood' }));
    render(<AssetIntake revision={3} dispatch={dispatch} defaultRole="mood" plate="lower-right" />);
    fireEvent.change(screen.getByLabelText('asset intake: URL'), {
      target: { value: 'https://commons.wikimedia.org/wiki/File:Wave.jpg' },
    });
    fireEvent.change(screen.getByLabelText('asset intake: Alt text'), {
      target: { value: 'The Great Wave' },
    });
    fireEvent.change(screen.getByLabelText('asset intake: Artist'), {
      target: { value: 'Katsushika Hokusai' },
    });
    fireEvent.change(screen.getByLabelText('asset intake: License'), {
      target: { value: 'public domain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add asset/ }));
    expect(dispatch).toHaveBeenCalledWith('asset.add', {
      url: 'https://commons.wikimedia.org/wiki/File:Wave.jpg',
      role: 'mood',
      alt: 'The Great Wave',
      artist: 'Katsushika Hokusai',
      license: 'public domain',
      twoTone: true,
      plate: 'lower-right',
      baseRevision: 3,
    });
    expect(screen.getByLabelText('asset intake: drop zone').getAttribute('data-control')).toBe(
      'asset.intake.drop',
    );
  });
});

describe('Inspector', () => {
  it('shows the intake in the Asset section for a selected material block and no Material section (its one home is the Shader section of Format options, docs/FEATURES.md 5.3)', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector deck={WORKED_DECK} slide={slide} blockId="mat" revision={5} dispatch={dispatch} />,
    );
    expect(screen.queryByRole('button', { name: 'Material · mat' })).toBeNull();
    expect(screen.queryByLabelText('mat: Preset')).toBeNull();
    expect(screen.getByLabelText('asset intake: Alt text')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// Round three (gslides-parity SPEC-3 10.6, 10.7, 10.8, 10.10 chrome row): the Format options Dither
// section with every row and its control id, the toggle writing the identity and off removing the
// field, the presets highlighted by equality and writing the three numbers, a slider previewing
// through the editor's handle and committing once on release, Reset; the Background dialog's
// Dither toggle writing the Photograph numbers on the covering picture, the Neutral chip, the
// remembered toggle carried by one `slide.setBackgroundPicture` on a canvas slide.
const PHOTOGRAPH = { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 } as const;

function pictureBlock(dither?: Record<string, unknown>): PictureBlock {
  return {
    id: 'bg',
    type: 'picture',
    asset: 'mood-earth',
    pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
    ...(dither !== undefined ? { dither } : {}),
  } as PictureBlock;
}

function control(id: string): HTMLElement {
  const el = document.querySelector(`[data-control="${id}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`no control ${id}`);
  return el;
}

function writeOf(dispatch: EditorDispatch, editor?: EditorHandle): SectionWrite {
  return {
    slideId: 'cv',
    revision: 9,
    dispatch,
    busy: false,
    report: () => undefined,
    ...(editor !== undefined ? { editor } : {}),
  };
}

describe('the Format options Dither section', () => {
  it('shows every row with its control id, the toggle writes the identity and off removes the field', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(<DitherFormatSection block={pictureBlock()} write={writeOf(dispatch)} />);
    for (const id of [
      'formatOptions.dither.on',
      'formatOptions.dither.preset.neutral',
      'formatOptions.dither.preset.photograph',
      'formatOptions.dither.pattern',
      'formatOptions.dither.tone',
      'formatOptions.dither.cell',
      'formatOptions.dither.strength',
      'formatOptions.dither.black',
      'formatOptions.dither.white',
      'formatOptions.dither.gamma',
      'formatOptions.dither.invert',
      'formatOptions.dither.polarity',
      'formatOptions.dither.metrics',
      'formatOptions.dither.advanced',
      'formatOptions.dither.reset',
    ])
      expect(control(id), id).toBeTruthy();
    expect(control('formatOptions.dither.metrics').textContent).toBe('Not measured');
    fireEvent.click(control('formatOptions.dither.on'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'bayer8' },
      baseRevision: 9,
    });
    cleanup();
    render(
      <DitherFormatSection block={pictureBlock({ ...PHOTOGRAPH })} write={writeOf(dispatch)} />,
    );
    fireEvent.click(control('formatOptions.dither.on'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      baseRevision: 9,
    });
    for (const el of document.querySelectorAll('[title]')) expect(el).toBeNull();
  });

  it('highlights the preset by equality, writes the three numbers, and Reset returns to the identity', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <DitherFormatSection block={pictureBlock({ ...PHOTOGRAPH })} write={writeOf(dispatch)} />,
    );
    expect(control('formatOptions.dither.preset.photograph').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(control('formatOptions.dither.preset.neutral').getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(control('formatOptions.dither.preset.neutral'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'bayer8' },
      baseRevision: 9,
    });
    cleanup();
    render(
      <DitherFormatSection
        block={pictureBlock({ pattern: 'blue64', black: 40 })}
        write={writeOf(dispatch)}
      />,
    );
    expect(control('formatOptions.dither.preset.photograph').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(control('formatOptions.dither.preset.neutral').getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(control('formatOptions.dither.preset.photograph'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'blue64', black: 120, white: 230, gamma: 0.9 },
      baseRevision: 9,
    });
    fireEvent.click(control('formatOptions.dither.reset'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'bayer8' },
      baseRevision: 9,
    });
    expect(patchDither({ pattern: 'bayer8', black: 120 }, { black: 0 })).toEqual({
      pattern: 'bayer8',
    });
    expect(patchDither({ pattern: 'bayer8' }, { cell: 2, strength: 0.5 })).toEqual({
      pattern: 'bayer8',
      strength: 0.5,
    });
  });

  it('puts every control under the Tooltip primitive; an option keeps its own plate and a click shows none', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <DitherFormatSection block={pictureBlock({ ...PHOTOGRAPH })} write={writeOf(dispatch)} />,
    );
    /* the audit's rule (gslides-parity SPEC-3 10.7): every data-control sits under a data-tip */
    const untipped = [...document.querySelectorAll('[data-control^="formatOptions.dither"]')]
      .filter((el) => el.closest('[data-tip]') === null)
      .map((el) => el.getAttribute('data-control'));
    expect(untipped).toEqual([]);
    for (const [id, name] of [
      ['pattern', DITHER.pattern],
      ['tone', DITHER.tone],
      ['cell', DITHER.cell],
      ['polarity', DITHER.lightTheme],
    ] as const) {
      const row = control(`formatOptions.dither.${id}`).closest('[data-tip]');
      expect(row?.getAttribute('data-tip'), id).toBe(name);
      expect(row?.querySelector('.ts-fo-field-label')?.textContent, id).toBe(name);
    }
    /* keyboard focus on an option names the option, not its row */
    const option = control('formatOptions.dither.pattern.blue64');
    fireEvent.focus(option);
    expect(shownTooltipAnchor()).toBe(option);
    hideTooltip();
    /* a click on an option shows no plate */
    fireEvent.mouseDown(option);
    fireEvent.focus(option);
    expect(shownTooltipAnchor()).toBeNull();
    /* a rest over the row's label names the row; moving onto an option names the option */
    vi.useFakeTimers();
    try {
      const row = control('formatOptions.dither.tone').closest('[data-tip]');
      const label = row?.querySelector('.ts-fo-field-label');
      if (!(row instanceof HTMLElement) || !(label instanceof HTMLElement))
        throw new Error('no Tone row');
      fireEvent.mouseEnter(label);
      act(() => {
        vi.advanceTimersByTime(TIP_DELAY_MS);
      });
      expect(shownTooltipAnchor()).toBe(row);
      const three = control('formatOptions.dither.tone.three');
      fireEvent.mouseOut(label, { relatedTarget: three });
      expect(shownTooltipAnchor()).toBe(three);
    } finally {
      hideTooltip();
      vi.useRealTimers();
    }
  });

  it('a slider previews through the editor’s handle on every input and commits once on release', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const ditherPreview = vi.fn();
    render(
      <DitherFormatSection
        block={pictureBlock({ ...PHOTOGRAPH })}
        write={writeOf(dispatch, { ditherPreview })}
      />,
    );
    const slider = control('formatOptions.dither.black.slider');
    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.change(slider, { target: { value: '80' } });
    expect(ditherPreview).toHaveBeenCalledTimes(2);
    expect(ditherPreview).toHaveBeenLastCalledWith('bg', {
      pattern: 'bayer8',
      black: 80,
      white: 230,
      gamma: 0.9,
    });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'bayer8', black: 80, white: 230, gamma: 0.9 },
      baseRevision: 9,
    });
    // the commit clears the preview
    expect(ditherPreview).toHaveBeenLastCalledWith('bg', null);
    fireEvent.click(control('formatOptions.dither.pattern.blue64'));
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.set',
      expect.objectContaining({ value: { ...PHOTOGRAPH, pattern: 'blue64' } }),
    );
    fireEvent.click(control('formatOptions.dither.polarity.same'));
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.set',
      expect.objectContaining({ value: { ...PHOTOGRAPH, polarity: 'same' } }),
    );
  });

  it('the metrics line reads a live frame and the plate clearance in words', () => {
    expect(metricsWords(null)).toBe('Not measured');
    expect(metricsWords({ litFraction: 0.089 })).toBe('Lit 8.9 percent');
    expect(metricsWords({ litFraction: 0.3, plateClear: { litUnder: 0, nearestLitPx: 12 } })).toBe(
      'Lit 30.0 percent; 0 cells under the plate, 12 px to the nearest',
    );
    expect(metricsWords({ litFraction: 0.01 })).toContain('empty sheet');
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <DitherFormatSection block={pictureBlock({ ...PHOTOGRAPH })} write={writeOf(dispatch)} />,
    );
    act(() => {
      document.dispatchEvent(
        new CustomEvent('ts-dither-frame', { detail: { blockId: 'bg', litFraction: 0.5 } }),
      );
    });
    expect(control('formatOptions.dither.metrics').textContent).toBe('Lit 50.0 percent');
  });
});

/* the Background dialog needs the editor shell context; the same host the dialogs test builds */
function Host({
  input: value,
  shell,
  children,
}: {
  input: EditorShellInput;
  /** shell fields a test reads back (openPanel, closeDialog) */
  shell?: Record<string, unknown>;
  children: React.ReactNode;
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
    // the round three fields the dialog never reads (the comment card, the diff) grow with B6's
    // shell; the cast keeps this host on the fields the Background dialog touches
    ...shell,
  } as unknown as EditorShellState;
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

function canvasDocument(covering: PictureBlock | null): DeckDocument {
  const base = workedDocument();
  const canvas = {
    schemaVersion: 1,
    id: 'cv',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        {
          id: 't',
          type: 'text',
          text: 'Hello',
          pos: { x: 100, y: 100, w: 480, h: 64, z: 1 },
        } as Block,
        ...(covering === null ? [] : [covering]),
      ],
    },
  };
  return { deck: base.deck, slides: { ...base.slides, cv: canvas as never } };
}

describe('the Background dialog’s dither rows', () => {
  it('the Dither toggle writes the Photograph numbers on the covering picture and the Neutral chip switches them', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 10 }));
    const doc = canvasDocument(pictureBlock());
    render(
      <Host input={{ deckId: 'w', document: doc, slideId: 'cv', revision: 9, dispatch }}>
        <BackgroundDialog />
      </Host>,
    );
    expect(control('dialog.background.picture')).toBeTruthy();
    expect(control('dialog.background.formatOptions')).toBeTruthy();
    expect(control('dialog.background.uploading').textContent).toBe('');
    fireEvent.click(control('dialog.background.dither'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 },
      baseRevision: 9,
    });
    cleanup();
    render(
      <Host
        input={{
          deckId: 'w',
          document: canvasDocument(pictureBlock({ ...PHOTOGRAPH })),
          slideId: 'cv',
          revision: 9,
          dispatch,
        }}
      >
        <BackgroundDialog />
      </Host>,
    );
    expect(control('dialog.background.dither.photograph').getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(control('dialog.background.dither.neutral'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      value: { pattern: 'bayer8' },
      baseRevision: 9,
    });
    fireEvent.click(control('dialog.background.dither'));
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'cv',
      blockId: 'bg',
      path: '/dither',
      baseRevision: 9,
    });
    for (const el of document.querySelectorAll('[title]')) expect(el).toBeNull();
  });

  it('Format options selects the covering picture, opens the panel at Dither and closes the dialog', () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 10 }));
    const onSelectBlock = vi.fn();
    const openPanel = vi.fn();
    const closeDialog = vi.fn();
    const doc = canvasDocument(pictureBlock({ ...PHOTOGRAPH }));
    render(
      <Host
        input={{ deckId: 'w', document: doc, slideId: 'cv', revision: 9, dispatch, onSelectBlock }}
        shell={{ openPanel, closeDialog }}
      >
        <BackgroundDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.background.formatOptions'));
    expect(onSelectBlock).toHaveBeenCalledWith('bg');
    expect(openPanel).toHaveBeenCalledWith('formatOptions', { section: 'dither' });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(onSelectBlock.mock.invocationCallOrder[0]).toBeLessThan(
      openPanel.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('a remembered toggle carries the dither into one slide.setBackgroundPicture on a canvas slide', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 10 }));
    const doc = canvasDocument(null);
    const asset = Object.keys(doc.deck.assets)[0] ?? 'a';
    render(
      <Host input={{ deckId: 'w', document: doc, slideId: 'cv', revision: 9, dispatch }}>
        <BackgroundDialog />
      </Host>,
    );
    expect(document.querySelector('[data-control="dialog.background.picture"]')).toBeNull();
    fireEvent.click(control('dialog.background.dither'));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(control(`dialog.background.choose.${asset}`));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('slide.setBackgroundPicture', {
      slideIds: ['cv'],
      assetId: asset,
      dither: { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 },
      baseRevision: 9,
    });
  });
});
