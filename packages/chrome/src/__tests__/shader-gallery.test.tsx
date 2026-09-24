// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GALLERY_MATERIAL_IDS,
  MATERIAL_IDS,
  SHADER_CATEGORIES,
  materialEntry,
} from '@turboslide/materials/catalog';
import type { MaterialEntry } from '@turboslide/materials/catalog';
import { shaderPreviewFile } from '@turboslide/materials/previews';
import { materialBlockSchema } from '@turboslide/schema/blocks/material';
import { workedDocument } from '@turboslide/schema/fixtures';

import {
  SHADER_GALLERY,
  ShaderGalleryDialog,
  ShaderGalleryGrid,
  engineOf,
  featuredPresetOf,
  insertableMaterials,
  schemaHasMotion,
  shaderBlockOf,
  shaderEngines,
  shaderFailureSentence,
  shaderGalleryEntries,
  shaderPreviewUrl,
  shaderWordsOf,
} from '../dialogs/ShaderGallery';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The Shader gallery (docs/FEATURES.md 5.4; the rows shaders.insert.gallery-thumbnails and the P1
// shaders.insert.gallery-hover-live of 7.1): the dialog titled Shader with the black and white
// sentence under the title; one card per available catalog entry in the catalog's gallery order,
// each with its still (B5's `@turboslide/materials/previews` file; a plate with no text when the
// file is not on the build) and its presets as tiles inside the card; the search over the name,
// the description and the engine narrowing to "metal"; a category chip narrowing the grid; no
// canvas in the dialog; a click inserting the entry's featured preset through `block.insert`,
// selecting the block and closing; the block maker's alt, preset and the `motion` default written
// only once the schema knows the field. The rows themselves are driven by B4's walk against a
// server; this file drives the dialog in jsdom over the real catalog.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();

function host(
  dispatch: EditorShellInput['dispatch'],
  extra: Partial<EditorShellInput> = {},
  shell: Partial<EditorShellState> = {},
): EditorShellState {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 7,
    dispatch,
    ...extra,
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
    ...shell,
  };
}

function Host({ state, children }: { state: EditorShellState; children: ReactNode }) {
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

const control = (id: string) => document.querySelector<HTMLElement>(`[data-control="${id}"]`);
const controls = (prefix: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-control^="${prefix}"]`));
/** The cards as B4's reader takes them: the top level `dialog.shader.tile.*` elements, the tiles inside them left out. */
const cards = () =>
  controls('dialog.shader.tile.').filter(
    (el) => el.parentElement?.closest('[data-control^="dialog.shader.tile."]') === null,
  );
const flush = () => act(async () => {});

const LIQUID = materialEntry('paper:liquid-metal') as MaterialEntry;
const SMOKE = materialEntry('paper:gem-smoke') as MaterialEntry;

describe('the catalog as the gallery reads it', () => {
  it('lists every available entry in the catalog’s gallery order, the featured six first', () => {
    const ordered = insertableMaterials().map((entry) => entry.id);
    expect(ordered).toEqual([...GALLERY_MATERIAL_IDS]);
    expect(ordered.slice(0, 6)).toEqual([
      'paper:liquid-metal',
      'paper:gem-smoke',
      'paper:god-rays',
      'paper:mesh-gradient',
      'paper:smoke-ring',
      'paper:grain-gradient',
    ]);
    expect(ordered).toHaveLength(MATERIAL_IDS.length);
    expect(shaderGalleryEntries('').map((entry) => entry.id)).toEqual(ordered);
  });

  it('files every entry under its catalog category; the union of the five chips is the whole grid', () => {
    const ids = new Set<string>(SHADER_CATEGORIES.map((each) => each.id));
    for (const entry of insertableMaterials()) expect(ids.has(entry.category)).toBe(true);
    const byChip = SHADER_CATEGORIES.flatMap((each) => shaderGalleryEntries('', each.id));
    expect(byChip.map((entry) => entry.id).sort()).toEqual([...MATERIAL_IDS].sort());
    expect(shaderGalleryEntries('', 'metal').map((entry) => entry.id)).toEqual(
      insertableMaterials()
        .filter((entry) => entry.category === 'metal')
        .map((entry) => entry.id),
    );
    expect(shaderGalleryEntries('', 'metal').map((entry) => entry.id)).toContain(
      'paper:liquid-metal',
    );
  });

  it('searches the name, the description and the engine; "metal" narrows to one card', () => {
    expect(shaderGalleryEntries('metal').map((entry) => entry.id)).toEqual(['paper:liquid-metal']);
    expect(shaderGalleryEntries('meta').map((entry) => entry.id)).toEqual([
      'paper:liquid-metal',
      'paper:metaballs',
    ]);
    expect(shaderGalleryEntries('Paper Shaders')).toHaveLength(MATERIAL_IDS.length);
    expect(shaderGalleryEntries('smoky ring').map((entry) => entry.id)).toEqual([
      'paper:smoke-ring',
    ]);
    expect(shaderGalleryEntries('zzqx')).toEqual([]);
    /* a chip and the query both apply */
    expect(shaderGalleryEntries('liquid', 'graphic')).toEqual([]);
    expect(shaderGalleryEntries('liquid', 'metal').map((entry) => entry.id)).toEqual([
      'paper:liquid-metal',
    ]);
  });

  it('names one engine family for Paper and draws no engine chips until a second exists', () => {
    expect(engineOf('paper:liquid-metal')).toEqual({ family: 'paper', label: 'Paper Shaders' });
    expect(engineOf('proto:studio-field')).toEqual({ family: 'proto', label: 'Prototemplate' });
    expect(engineOf('glyph:mesh-gradient')).toEqual({ family: 'glyph', label: 'Glyphfield' });
    expect(shaderEngines()).toEqual([{ family: 'paper', label: 'Paper Shaders' }]);
  });

  it('lands the catalog’s featured preset: the diamond for liquid metal, the first preset where none is named', () => {
    expect(featuredPresetOf(LIQUID)?.name).toBe('diamond');
    expect(featuredPresetOf(SMOKE)?.name).toBe('brand-blue');
    const rays = materialEntry('paper:god-rays') as MaterialEntry;
    expect(featuredPresetOf(rays)?.name).toBe(rays.featuredPreset ?? rays.presets[0]?.name);
    const named = { ...LIQUID, featuredPreset: 'sphere' } as MaterialEntry;
    expect(featuredPresetOf(named)?.name).toBe('sphere');
  });

  it('names the still and the preset tiles as @turboslide/materials/previews spells them', () => {
    expect(shaderPreviewUrl(LIQUID).endsWith(`/${shaderPreviewFile('paper:liquid-metal')}`)).toBe(
      true,
    );
    expect(shaderPreviewUrl(LIQUID)).toMatch(/\/previews\/liquid-metal\.webp$/);
    const diamond = LIQUID.presets.find((preset) => preset.name === 'diamond');
    expect(shaderPreviewUrl(LIQUID, diamond)).toMatch(/\/previews\/liquid-metal--diamond\.webp$/);
  });

  it('makes the block with the entry, the preset, the alt and the motion default once the schema knows it', () => {
    const block = shaderBlockOf('m-1', LIQUID);
    expect(block.type).toBe('material');
    expect(block.materialId).toBe('paper:liquid-metal');
    expect(block.preset).toBe('diamond');
    expect(block.alt).toBe('The liquid metal shader');
    expect(block.uniforms).toBeUndefined();
    const hasMotion = 'motion' in materialBlockSchema.shape;
    expect(schemaHasMotion()).toBe(hasMotion);
    expect((block as { motion?: unknown }).motion).toEqual(
      hasMotion ? { play: 'show' } : undefined,
    );
    /* a preset tile's pick */
    const sphere = LIQUID.presets.find((each) => each.name === 'sphere');
    expect(shaderBlockOf('m-2', LIQUID, sphere).preset).toBe('sphere');
    /* the block validates against the strict schema, so a validator never refuses it */
    expect(materialBlockSchema.safeParse(block).success).toBe(true);
  });

  it('reads a covering shader by its words, never its id', () => {
    expect(shaderWordsOf('paper:liquid-metal', 'diamond')).toBe('Liquid metal, Diamond');
    expect(shaderWordsOf('paper:liquid-metal')).toBe('Liquid metal');
    expect(shaderWordsOf('paper:liquid-metal', 'nope')).toBe('Liquid metal');
    expect(shaderWordsOf('paper:unknown')).toBe('paper:unknown');
  });

  it('shows a rejection as one sentence and never a log', () => {
    expect(shaderFailureSentence(new Error('The frame took too long'))).toBe(
      'The frame took too long',
    );
    expect(shaderFailureSentence(new Error(SHADER_GALLERY.placeFailed))).toBe(
      SHADER_GALLERY.placeFailed,
    );
    expect(
      shaderFailureSentence(
        new Error(
          'browserContext.close: Target page, context or browser has been closed Browser logs: <launching> /tmp/chromium-nocore.sh --disable-field-trial-config',
        ),
      ),
    ).toBe(SHADER_GALLERY.placeFailed);
    expect(shaderFailureSentence(new Error('one\ntwo'))).toBe(SHADER_GALLERY.placeFailed);
    expect(shaderFailureSentence(new Error('x'.repeat(200)))).toBe(SHADER_GALLERY.placeFailed);
    expect(shaderFailureSentence('')).toBe(SHADER_GALLERY.placeFailed);
    expect(shaderFailureSentence(new Error('TypeError: fetch failed at file.ts:12'))).toBe(
      SHADER_GALLERY.placeFailed,
    );
  });
});

describe('the Shader gallery dialog', () => {
  it('draws the title, the sentence, the focused search, the chips and one card per entry with no canvas', () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 8 }));
    render(
      <Host state={host(dispatch)}>
        <ShaderGalleryDialog />
      </Host>,
    );
    expect(screen.getByRole('dialog', { name: 'Shader' })).toBeTruthy();
    expect(control('dialog.shader')).not.toBeNull();
    expect(control('dialog.shader.sentence')?.textContent).toBe(SHADER_GALLERY.sentence);
    expect(document.activeElement).toBe(control('dialog.shader.search'));
    for (const each of ['all', ...SHADER_CATEGORIES.map((chip) => chip.id)])
      expect(control(`dialog.shader.category.${each}`), each).not.toBeNull();
    expect(control('dialog.shader.category.all')?.getAttribute('aria-checked')).toBe('true');
    const grid = control('dialog.shader.grid') as HTMLElement;
    expect(grid.dataset.count).toBe(String(MATERIAL_IDS.length));
    expect(grid.dataset.query).toBe('');
    const list = cards();
    expect(list).toHaveLength(MATERIAL_IDS.length);
    expect(list[0]?.dataset.material).toBe('paper:liquid-metal');
    expect(list[0]?.dataset.preset).toBe('diamond');
    expect(list[0]?.getAttribute('role')).toBe('option');
    expect(list[0]?.getAttribute('aria-selected')).toBe('true');
    expect(list[0]?.getAttribute('aria-label')).toBe('Liquid metal');
    expect(list[1]?.dataset.material).toBe('paper:gem-smoke');
    /* the still: the first img of the card names B5's file; no canvas anywhere in the dialog */
    const thumb = control('dialog.shader.tile.paper:liquid-metal.thumb') as HTMLImageElement;
    expect(thumb.tagName).toBe('IMG');
    expect(thumb.getAttribute('src')).toMatch(/\/previews\/liquid-metal\.webp$/);
    expect(list[0]?.querySelector('img')).toBe(thumb);
    expect(thumb.dataset.decoded).toBeUndefined();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    /* a still whose file is not on the build becomes a plate with no text */
    fireEvent.error(thumb);
    const plate = control('dialog.shader.tile.paper:liquid-metal.thumb') as HTMLElement;
    expect(plate.tagName).toBe('SPAN');
    expect(plate.dataset.thumb).toBe('none');
    expect(plate.textContent).toBe('');
    /* the preset tiles inside the card, labelled by the preset's label, never counted as cards */
    const presets = controls('dialog.shader.tile.paper:liquid-metal.preset.');
    expect(presets.map((tile) => tile.dataset.preset)).toEqual(
      LIQUID.presets.map((preset) => preset.name),
    );
    expect(presets[0]?.getAttribute('aria-label')).toBe(LIQUID.presets[0]?.label);
    expect(presets.every((tile) => list[0]?.contains(tile))).toBe(true);
    /* every control carries a tooltip */
    for (const el of [...list, ...presets, control('dialog.shader.category.fluid')])
      expect(el?.getAttribute('data-tip'), el?.getAttribute('data-control') ?? '').toBeTruthy();
  });

  it('the search narrows to "metal" and a chip narrows the grid; the empty state names the query', () => {
    render(
      <Host state={host(vi.fn(() => Promise.resolve({})))}>
        <ShaderGalleryDialog />
      </Host>,
    );
    const search = control('dialog.shader.search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'metal' } });
    let grid = control('dialog.shader.grid') as HTMLElement;
    expect(grid.dataset.count).toBe('1');
    expect(grid.dataset.query).toBe('metal');
    expect(cards().map((card) => card.dataset.material)).toEqual(['paper:liquid-metal']);
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(control('dialog.shader.category.graphic') as HTMLElement);
    grid = control('dialog.shader.grid') as HTMLElement;
    expect(grid.dataset.category).toBe('graphic');
    expect(control('dialog.shader.category.graphic')?.getAttribute('aria-checked')).toBe('true');
    expect(control('dialog.shader.category.all')?.getAttribute('aria-checked')).toBe('false');
    const graphic = insertableMaterials().filter((entry) => entry.category === 'graphic');
    expect(grid.dataset.count).toBe(String(graphic.length));
    expect(graphic.length).toBeGreaterThan(0);
    expect(graphic.length).toBeLessThan(MATERIAL_IDS.length);
    expect(control('dialog.shader.tile.paper:liquid-metal')).toBeNull();
    expect(control(`dialog.shader.tile.${graphic[0]?.id}`)).not.toBeNull();
    fireEvent.change(search, { target: { value: 'zzqx' } });
    expect(control('dialog.shader.empty')?.textContent).toBe('No shader matches “zzqx”');
    expect((control('dialog.shader.grid') as HTMLElement).dataset.count).toBe('0');
  });

  it('a card click inserts the featured preset, selects the block and closes; a preset tile inserts its preset', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 8 }));
    const onSelectBlock = vi.fn();
    const closeDialog = vi.fn();
    const state = host(dispatch, { onSelectBlock }, { closeDialog });
    const view = render(
      <Host state={state}>
        <ShaderGalleryDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.shader.tile.paper:liquid-metal') as HTMLElement);
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, input] = dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(action).toBe('block.insert');
    expect(input.slideId).toBe('content-rule');
    expect(input.baseRevision).toBe(7);
    const block = input.block as Record<string, unknown>;
    expect(block.type).toBe('material');
    expect(block.materialId).toBe('paper:liquid-metal');
    expect(block.preset).toBe('diamond');
    expect(block.alt).toBe('The liquid metal shader');
    expect(onSelectBlock).toHaveBeenCalledWith(block.id);
    expect(closeDialog).toHaveBeenCalledTimes(1);
    view.unmount();

    const second = vi.fn(() => Promise.resolve({ revision: 9 }));
    render(
      <Host state={host(second)}>
        <ShaderGalleryDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.shader.tile.paper:liquid-metal.preset.sphere') as HTMLElement);
    await flush();
    /* the tile's click stops at the tile: one insert, the tile's preset */
    expect(second).toHaveBeenCalledTimes(1);
    const picked = (second.mock.calls[0] as unknown as [string, { block: { preset: string } }])[1];
    expect(picked.block.preset).toBe('sphere');
  });

  it('Enter in the search inserts the active card; the arrows move it', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ revision: 8 }));
    render(
      <Host state={host(dispatch)}>
        <ShaderGalleryDialog />
      </Host>,
    );
    const search = control('dialog.shader.search') as HTMLInputElement;
    fireEvent.keyDown(search, { key: 'ArrowRight' });
    expect(control('dialog.shader.tile.paper:gem-smoke')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(search.getAttribute('aria-activedescendant')).toBe(
      control('dialog.shader.tile.paper:gem-smoke')?.id,
    );
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(control('dialog.shader.tile.paper:mesh-gradient')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(search, { key: 'Enter' });
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const picked = (
      dispatch.mock.calls[0] as unknown as [string, { block: { materialId: string } }]
    )[1];
    expect(picked.block.materialId).toBe('paper:mesh-gradient');
  });

  it('a refused insert reads as one sentence and the dialog stays open', async () => {
    const dispatch = vi.fn(() => Promise.reject(new Error('The write was refused')));
    const closeDialog = vi.fn();
    render(
      <Host state={host(dispatch, {}, { closeDialog })}>
        <ShaderGalleryDialog />
      </Host>,
    );
    fireEvent.click(control('dialog.shader.tile.paper:god-rays') as HTMLElement);
    await flush();
    expect(control('dialog.shader.error')?.textContent).toBe('The write was refused');
    expect(closeDialog).not.toHaveBeenCalled();
    /* a second click runs again once the first settled */
    fireEvent.click(control('dialog.shader.tile.paper:god-rays') as HTMLElement);
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('carries the P1 hover surface on the dialog’s grid and none while Play shaders is Off', () => {
    render(
      <Host state={host(vi.fn(() => Promise.resolve({})))}>
        <ShaderGalleryDialog />
      </Host>,
    );
    expect(document.querySelector('.ts-shader[data-hover-live="true"]')).not.toBeNull();
    expect(document.querySelectorAll('.ts-shader-hover')).toHaveLength(MATERIAL_IDS.length);
    /* nothing is live before a hover: no host carries the control id and no canvas exists */
    expect(controls('dialog.shader.hover')).toHaveLength(0);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    cleanup();
    render(
      <Host
        state={host(vi.fn(() => Promise.resolve({})), {}, {
          settings: { ...DEFAULT_SETTINGS, playShaders: 'off' } as EditorShellState['settings'],
        })}
      >
        <ShaderGalleryDialog />
      </Host>,
    );
    expect(document.querySelector('.ts-shader[data-hover-live]')).toBeNull();
    expect(document.querySelectorAll('.ts-shader-hover')).toHaveLength(0);
  });
});

describe('the grid inside another dialog', () => {
  it('draws compact under its own dialog.shader root, without the focus or the hover, and hands the pick back', () => {
    const onPick = vi.fn();
    render(
      <Host state={host(vi.fn(() => Promise.resolve({})))}>
        <ShaderGalleryGrid compact control="dialog.shader" onPick={onPick} />
      </Host>,
    );
    const root = control('dialog.shader') as HTMLElement;
    expect(root.classList.contains('ts-shader')).toBe(true);
    expect(root.classList.contains('is-compact')).toBe(true);
    expect(root.dataset.hoverLive).toBeUndefined();
    expect(document.activeElement).not.toBe(control('dialog.shader.search'));
    expect(document.querySelectorAll('.ts-shader-hover')).toHaveLength(0);
    fireEvent.click(control('dialog.shader.tile.paper:gem-smoke.preset.fire') as HTMLElement);
    expect(onPick).toHaveBeenCalledTimes(1);
    const pick = onPick.mock.calls[0]?.[0] as { entry: MaterialEntry; preset?: { name: string } };
    expect(pick.entry.id).toBe('paper:gem-smoke');
    expect(pick.preset?.name).toBe('fire');
  });
});
