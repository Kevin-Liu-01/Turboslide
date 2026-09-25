// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHADER_CONTROLS } from '@turboslide/materials/controls';
import type { Asset } from '@turboslide/schema/assets';
import type { PictureBlock } from '@turboslide/schema/blocks';
import type { MaterialBlock } from '@turboslide/schema/blocks/material';
import { WORKED_DECK } from '@turboslide/schema/fixtures';
import type { Deck } from '@turboslide/schema/deck';

import type { EditorDispatch } from '../dispatch';
import type { SectionWrite } from '../inspector/fields';
import { SHADER_WORDS, ShaderSection, isShaderGround } from '../inspector/shader';
import { hideTooltip } from '../Tooltip';

// The Shader section (docs/FEATURES.md 5.3, 7.2, 7.3): the groups in order, the ten slider
// sentences in the tooltips, the preset tiles in sentence case with the current one pressed, the
// kit's six swatches, one `slide.update` per release carrying the controls and the resolved
// uniforms, a preset change clearing both, and a parked control not drawn while the switch is
// off and drawn with it on (the B5 surface of parked-controls.test.ts's todo).

vi.mock('../parked-controls', async () => {
  const actual = await vi.importActual<typeof import('../parked-controls')>('../parked-controls');
  return {
    ...actual,
    PARKED_CONTROLS: new Set<string>(['formatOptions.shader.grain']),
    isParked: (id: string, settings: import('../parked-controls').ParkedSettings | undefined) =>
      actual.isParkedIn(id, new Set(['formatOptions.shader.grain']), settings),
  };
});

afterEach(() => {
  hideTooltip();
  cleanup();
});

const block: MaterialBlock = {
  id: 'shader',
  type: 'material',
  materialId: 'paper:liquid-metal',
  preset: 'diamond',
  pos: { x: 100, y: 400, w: 480, h: 272 },
  alt: 'The liquid metal shader',
};

const deck = WORKED_DECK as Deck;

function writeOf(dispatch: EditorDispatch): SectionWrite {
  return { slideId: 'free', revision: 12, dispatch, busy: false, report: () => undefined };
}

describe('the Shader section', () => {
  it('draws the groups in order with the ten sentences, the tiles and the swatches, and no id', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const { container } = render(
      <ShaderSection block={block} deck={deck} write={writeOf(dispatch)} settings={{}} />,
    );
    const titles = [...container.querySelectorAll('.ts-shader-group-title')].map((el) =>
      el.textContent?.trim(),
    );
    expect(titles).toEqual([
      SHADER_WORDS.preset,
      SHADER_WORDS.colors,
      SHADER_WORDS.form,
      SHADER_WORDS.light,
      SHADER_WORDS.orientation,
      SHADER_WORDS.motion,
      SHADER_WORDS.dither,
      SHADER_WORDS.advanced,
    ]);
    for (const spec of SHADER_CONTROLS) {
      if (spec.name === 'grain') continue;
      const range = container.querySelector<HTMLInputElement>(
        `[data-control="formatOptions.shader.${spec.name}.slider"]`,
      );
      expect(range, spec.name).not.toBeNull();
      expect(range?.getAttribute('data-tip')).toBe(spec.label);
      const label = range?.previousElementSibling;
      expect(label?.getAttribute('data-tip-doc') ?? label?.getAttribute('data-tip')).toBeTruthy();
    }
    // the tiles are the entry's presets in sentence case, the current one pressed
    const tiles = [...container.querySelectorAll<HTMLButtonElement>('.ts-shader-tile')];
    expect(tiles.map((tile) => tile.textContent?.trim())).toEqual([
      'Paper on ink',
      'Ink on paper',
      'Primary',
      'Accent',
      'Captions',
      'Hints',
      'Diamond',
      'Sphere',
      'Chrome',
      'Noir',
    ]);
    expect(
      tiles
        .find((tile) => tile.dataset.control === 'formatOptions.shader.preset.diamond')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    // the kit's six swatches by role
    const swatches = [
      ...container.querySelectorAll('[data-control^="formatOptions.shader.color."]'),
    ];
    expect(swatches.map((el) => el.getAttribute('data-control'))).toEqual([
      'formatOptions.shader.color.text',
      'formatOptions.shader.color.background',
      'formatOptions.shader.color.caption',
      'formatOptions.shader.color.hint',
      'formatOptions.shader.color.primary',
      'formatOptions.shader.color.accent',
      'formatOptions.shader.color.custom',
    ]);
    // no id and no not captured on the surface
    expect(container.textContent).not.toMatch(/paper:|not captured|sha256/);
    expect(container.textContent).toContain('Liquid metal');
  });

  it('writes one slide.update per release with the controls and the uniforms, and a preset clears both', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const { container } = render(
      <ShaderSection block={block} deck={deck} write={writeOf(dispatch)} settings={{}} />,
    );
    const range = container.querySelector<HTMLInputElement>(
      '[data-control="formatOptions.shader.frequency.slider"]',
    );
    if (range === null) throw new Error('no slider');
    fireEvent.change(range, { target: { value: '9' } });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.pointerUp(range);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action, input] = dispatch.mock.calls[0] ?? [];
    expect(action).toBe('slide.update');
    const mutations = (input as { mutations: { path: string; value?: unknown }[] }).mutations;
    expect(mutations.map((m) => m.path)).toEqual(['/controls', '/uniforms']);
    expect(mutations[0]?.value).toEqual({ frequency: 9 });
    expect((mutations[1]?.value as Record<string, unknown>).u_repetition).toBeDefined();

    const sphere = container.querySelector<HTMLButtonElement>(
      '[data-control="formatOptions.shader.preset.sphere"]',
    );
    if (sphere === null) throw new Error('no tile');
    fireEvent.click(sphere);
    expect(dispatch).toHaveBeenCalledTimes(2);
    const preset = (
      dispatch.mock.calls[1]?.[1] as { mutations: { path: string; value?: unknown }[] }
    ).mutations;
    expect(preset.map((m) => m.path)).toEqual(['/preset']);
    expect(preset[0]?.value).toBe('sphere');

    // a kit swatch writes the role's palette preset
    const primary = container.querySelector<HTMLButtonElement>(
      '[data-control="formatOptions.shader.color.primary"]',
    );
    if (primary === null) throw new Error('no swatch');
    fireEvent.click(primary);
    const colour = (
      dispatch.mock.calls[2]?.[1] as { mutations: { path: string; value?: unknown }[] }
    ).mutations;
    expect(colour[0]).toMatchObject({ path: '/preset', value: 'brand-blue' });
  });

  it('hides a parked control while the switch is off and draws it with the switch on', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const off = render(
      <ShaderSection block={block} deck={deck} write={writeOf(dispatch)} settings={{}} />,
    );
    expect(off.container.querySelector('[data-control="formatOptions.shader.grain"]')).toBeNull();
    expect(
      off.container.querySelector('[data-control="formatOptions.shader.strength"]'),
    ).not.toBeNull();
    cleanup();
    const on = render(
      <ShaderSection
        block={block}
        deck={deck}
        write={writeOf(dispatch)}
        settings={{ advancedTools: true }}
      />,
    );
    expect(
      on.container.querySelector('[data-control="formatOptions.shader.grain"]'),
    ).not.toBeNull();
    expect(screen.getByText(SHADER_WORDS.advanced)).toBeTruthy();
  });

  it('keeps the sentence plus "not used by this shader" as the tooltip of a control the shader does not use', () => {
    // liquid metal maps no uniform to Strength (build/integrator.md finding 3): the range is
    // aria-disabled and out of the tab order, never `disabled`, so a hover still shows the plate
    // (the fix round of ship two, verification F.5 item 3)
    vi.useFakeTimers();
    try {
      const dispatch = vi.fn<EditorDispatch>(async () => ({}));
      const { container } = render(
        <ShaderSection block={block} deck={deck} write={writeOf(dispatch)} settings={{}} />,
      );
      const strength = container.querySelector<HTMLInputElement>(
        '[data-control="formatOptions.shader.strength.slider"]',
      );
      const amplitude = container.querySelector<HTMLInputElement>(
        '[data-control="formatOptions.shader.amplitude.slider"]',
      );
      if (strength === null || amplitude === null) throw new Error('no slider');
      expect(strength.disabled).toBe(false);
      expect(strength.getAttribute('aria-disabled')).toBe('true');
      expect(strength.tabIndex).toBe(-1);
      expect(strength.closest('.ts-shader-slider')?.classList.contains('is-off')).toBe(true);
      expect(amplitude.getAttribute('aria-disabled')).toBeNull();
      fireEvent.mouseEnter(strength);
      vi.advanceTimersByTime(400);
      const plate = document.querySelector('.pt-tip');
      expect(plate?.textContent).toContain('how strong the effect is');
      expect(plate?.textContent?.toLowerCase()).toContain('not used by this shader');
      // the gesture is refused: a change writes nothing and previews nothing
      fireEvent.change(strength, { target: { value: '1.8' } });
      fireEvent.pointerUp(strength);
      expect(dispatch).not.toHaveBeenCalled();
      hideTooltip();
      fireEvent.mouseEnter(amplitude);
      vi.advanceTimersByTime(400);
      const used = document.querySelector('.pt-tip');
      expect(used?.textContent).toContain('how far the pattern moves from rest');
      expect(used?.textContent?.toLowerCase()).not.toContain('not used');
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws a placed shader ground as a target and re-renders it through slide.setBackgroundMaterial', () => {
    // the covering picture Change background > Shader > Place writes (FEATURES.md 5.1) has the
    // Shader section as its home (5.3): the recipe read off the asset, no slider groups, one
    // slide.setBackgroundMaterial per tile or swatch with the picture's dither carried over
    const asset = {
      id: 'bg-liquid-metal-diamond-5500',
      role: 'frame',
      alt: 'The liquid metal shader',
      twins: { light: 'assets/bg.png', dark: 'assets/bg.png' },
      size: [3200, 1800],
      scale: 2,
      inline: 'never',
      source: {
        kind: 'material',
        materialId: 'paper:liquid-metal',
        uniforms: { u_repetition: 4 },
        size: [3200, 1800],
        timeMs: 5500,
        backend: 'swiftshader',
        renderer: 'SwiftShader',
        recipeKey: 'sha256:0',
      },
      ext: { preset: 'diamond' },
    } as unknown as Asset;
    const groundDeck = { ...deck, assets: { ...deck.assets, [asset.id]: asset } } as Deck;
    const picture: PictureBlock = {
      id: 'bg',
      type: 'picture',
      asset: asset.id,
      pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
      dither: { pattern: 'bayer8', strength: 1 },
    };
    expect(isShaderGround(picture, groundDeck)).toBe(true);
    expect(isShaderGround({ ...picture, asset: 'missing' }, groundDeck)).toBe(false);
    expect(isShaderGround(block, groundDeck)).toBe(false);
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const { container } = render(
      <ShaderSection block={picture} deck={groundDeck} write={writeOf(dispatch)} settings={{}} />,
    );
    const root = container.querySelector('.ts-shader');
    expect(root?.getAttribute('data-ground')).toBe('1');
    expect(container.textContent).toContain('Liquid metal');
    expect(container.textContent).toContain(SHADER_WORDS.ground);
    const titles = [...container.querySelectorAll('.ts-shader-group-title')].map((el) =>
      el.textContent?.trim(),
    );
    expect(titles).toEqual([SHADER_WORDS.preset, SHADER_WORDS.colors, SHADER_WORDS.advanced]);
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(
      container
        .querySelector('[data-control="formatOptions.shader.preset.diamond"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    const chrome = container.querySelector<HTMLButtonElement>(
      '[data-control="formatOptions.shader.preset.chrome"]',
    );
    if (chrome === null) throw new Error('no tile');
    fireEvent.click(chrome);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toBe('slide.setBackgroundMaterial');
    expect(dispatch.mock.calls[0]?.[1]).toEqual({
      baseRevision: 12,
      slideIds: ['free'],
      materialId: 'paper:liquid-metal',
      preset: 'chrome',
      anchor: 5500,
      dither: { pattern: 'bayer8', strength: 1 },
    });
    const primary = container.querySelector<HTMLButtonElement>(
      '[data-control="formatOptions.shader.color.primary"]',
    );
    if (primary === null) throw new Error('no swatch');
    fireEvent.click(primary);
    expect(dispatch.mock.calls[1]?.[1]).toMatchObject({ preset: 'brand-blue', anchor: 5500 });
    expect(container.textContent).not.toMatch(/paper:|not captured|sha256/);
  });
});
