// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Block, PictureBlock } from '@turboslide/schema/blocks';
import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { BackgroundDialog } from '../dialogs/Background';
import { SHADER_GALLERY } from '../dialogs/ShaderGallery';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Background dialog's Shader row (docs/FEATURES.md 5.4, 5.5; audit-shaders 1, 3, 13, 19; the
// row shaders.background.place-answers): Choose opens the gallery's grid inside the dialog, a card
// or a preset tile picks the shader and the button reads its words, Place is one
// `slide.setBackgroundMaterial` at the catalog's anchor with the dither, the button reads
// "Placing" with the seconds while the write is in flight, a rejection reads as one sentence and
// never a log, and a covering material reads by its words with the Shader options link opening
// Format options at the Shader section. The ground itself and the 30 s bound are the server's
// (B7) and the walk's; this file drives the dialog in jsdom.

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useRealTimers();
});

function Host({
  input: value,
  shell,
  children,
}: {
  input: EditorShellInput;
  shell?: Partial<EditorShellState>;
  children: ReactNode;
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
    commentCard: null,
    openCommentCard: vi.fn(),
    closeCommentCard: vi.fn(),
    stepComment: vi.fn(),
    diff: null,
    ...shell,
  } as EditorShellState;
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

/** A canvas slide with one text box and, when given, a covering picture at the back. */
function canvasDocument(covering: PictureBlock | null, asset?: Asset): DeckDocument {
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
  const assets = asset === undefined ? base.deck.assets : { ...base.deck.assets, [asset.id]: asset };
  return {
    deck: { ...base.deck, assets },
    slides: { ...base.slides, cv: canvas as never },
  };
}

const control = (id: string) => document.querySelector<HTMLElement>(`[data-control="${id}"]`);
const flush = () => act(async () => {});

function input(dispatch: EditorShellInput['dispatch'], document: DeckDocument): EditorShellInput {
  return { deckId: 'w', document, slideId: 'cv', revision: 9, dispatch };
}

describe('the Background dialog’s Shader row', () => {
  it('Choose opens the gallery grid; a card picks the featured preset and the button reads its words; Place is one slide.setBackgroundMaterial', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 10 }));
    const closeDialog = vi.fn();
    render(
      <Host input={input(dispatch, canvasDocument(null))} shell={{ closeDialog }}>
        <BackgroundDialog />
      </Host>,
    );
    const choose = control('dialog.background.shader') as HTMLButtonElement;
    const place = control('dialog.background.shader.place') as HTMLButtonElement;
    expect(choose.textContent).toBe(SHADER_GALLERY.choose);
    expect(choose.getAttribute('aria-expanded')).toBe('false');
    expect(place.disabled).toBe(true);
    expect(control('dialog.shader.grid')).toBeNull();
    fireEvent.click(choose);
    expect(choose.getAttribute('aria-expanded')).toBe('true');
    const grid = control('dialog.shader.grid') as HTMLElement;
    expect(grid.dataset.count).toBe('17');
    expect(document.querySelector('.ts-shader.is-compact')).not.toBeNull();
    /* no canvas mounts in the dialog */
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    fireEvent.click(control('dialog.shader.tile.paper:liquid-metal') as HTMLElement);
    expect(control('dialog.shader.grid')).toBeNull();
    expect(choose.textContent).toBe('Liquid metal, Diamond');
    expect(choose.dataset.material).toBe('paper:liquid-metal');
    expect(choose.dataset.preset).toBe('diamond');
    expect(place.disabled).toBe(false);
    fireEvent.click(control('dialog.background.shader.dither') as HTMLElement);
    fireEvent.click(place);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith('slide.setBackgroundMaterial', {
      slideIds: ['cv'],
      materialId: 'paper:liquid-metal',
      preset: 'diamond',
      anchor: 5500,
      dither: { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 },
      baseRevision: 9,
    });
    await flush();
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });

  it('a preset tile picks that preset; Place reads Placing with the seconds while the write waits', async () => {
    vi.useFakeTimers();
    let settle: (value: { revision: number }) => void = () => {};
    const dispatch = vi.fn(
      () =>
        new Promise<{ revision: number }>((resolve) => {
          settle = resolve;
        }),
    );
    const closeDialog = vi.fn();
    render(
      <Host input={input(dispatch, canvasDocument(null))} shell={{ closeDialog }}>
        <BackgroundDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.background.shader') as HTMLElement);
    fireEvent.click(control('dialog.shader.tile.paper:gem-smoke.preset.fire') as HTMLElement);
    const choose = control('dialog.background.shader') as HTMLButtonElement;
    expect(choose.textContent).toBe('Gem smoke, Fire');
    const place = control('dialog.background.shader.place') as HTMLButtonElement;
    fireEvent.click(place);
    expect(dispatch).toHaveBeenLastCalledWith('slide.setBackgroundMaterial', {
      slideIds: ['cv'],
      materialId: 'paper:gem-smoke',
      preset: 'fire',
      anchor: 5500,
      baseRevision: 9,
    });
    expect(place.textContent).toBe('Placing');
    expect(place.dataset.placing).toBe('true');
    expect(place.disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(place.textContent).toBe('Placing, 3 s');
    await act(async () => {
      settle({ revision: 10 });
      await Promise.resolve();
    });
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });

  it('a rejection reads as one sentence, never a log, and Place is offered again', async () => {
    const dispatch = vi.fn(() =>
      Promise.reject(
        new Error(
          'browserContext.close: Target page, context or browser has been closed Browser logs: <launching> /tmp/chromium-nocore.sh --disable-field-trial-config --headless',
        ),
      ),
    );
    render(
      <Host input={input(dispatch, canvasDocument(null))}>
        <BackgroundDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.background.shader') as HTMLElement);
    fireEvent.click(control('dialog.shader.tile.paper:liquid-metal') as HTMLElement);
    fireEvent.click(control('dialog.background.shader.place') as HTMLElement);
    await flush();
    const error = control('dialog.background.error') as HTMLElement;
    expect(error.textContent).toBe(SHADER_GALLERY.placeFailed);
    expect(error.textContent).not.toContain('Browser logs');
    const place = control('dialog.background.shader.place') as HTMLButtonElement;
    expect(place.disabled).toBe(false);
    expect(place.textContent).toBe(SHADER_GALLERY.place);
    /* a one sentence rejection reads as itself */
    const plain = vi.fn(() => Promise.reject(new Error('The frame took too long')));
    cleanup();
    render(
      <Host input={input(plain, canvasDocument(null))}>
        <BackgroundDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.background.shader') as HTMLElement);
    fireEvent.click(control('dialog.shader.tile.paper:liquid-metal') as HTMLElement);
    fireEvent.click(control('dialog.background.shader.place') as HTMLElement);
    await flush();
    expect(control('dialog.background.error')?.textContent).toBe('The frame took too long');
  });

  it('a covering shader reads by its words and Shader options opens Format options at the Shader section', () => {
    const asset: Asset = {
      id: 'frame-1',
      alt: 'The liquid metal shader',
      twins: { neutral: 'assets/frame-1.png' },
      source: {
        kind: 'material',
        materialId: 'paper:liquid-metal',
        uniforms: {},
        size: [3200, 1800],
        timeMs: 5500,
        backend: 'swiftshader',
        recipeKey: 'k',
      },
      ext: { preset: 'diamond' },
    } as unknown as Asset;
    const covering = {
      id: 'bg',
      type: 'picture',
      asset: 'frame-1',
      pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
    } as unknown as PictureBlock;
    const openPanel = vi.fn();
    const closeDialog = vi.fn();
    const onSelectBlock = vi.fn();
    render(
      <Host
        input={{ ...input(vi.fn(), canvasDocument(covering, asset)), onSelectBlock }}
        shell={{ openPanel, closeDialog }}
      >
        <BackgroundDialog />
      </Host>,
    );
    const current = control('dialog.background.shader.current') as HTMLElement;
    expect(current.textContent).toContain('Liquid metal, Diamond');
    expect(current.textContent).not.toContain('paper:');
    expect(current.dataset.material).toBe('paper:liquid-metal');
    expect(current.dataset.preset).toBe('diamond');
    fireEvent.click(control('dialog.background.shader.options') as HTMLElement);
    expect(onSelectBlock).toHaveBeenCalledWith('bg');
    expect(openPanel).toHaveBeenCalledWith('formatOptions', { section: 'shader' });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-control="dialog.background.materialOptions"]')).toBeNull();
  });
});
