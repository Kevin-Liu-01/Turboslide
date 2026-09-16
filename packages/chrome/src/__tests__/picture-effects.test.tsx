// @vitest-environment jsdom
// Reflection and Recolor in Format options (gslides-parity SPEC-5 0.47; MILESTONES-5 B2 day 6):
// the Adjustments section of a picture object gains the Reflection check with Google's three
// sliders and the Recolor dropdown, each control one `block.adjust` call carrying the field it
// writes, and Reset clears the two beside the three of round two.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { RECOLOR_PRESETS } from '@turboslide/schema/blocks';

import type { EditorDispatch } from '../dispatch';
import { AdjustmentsSection, DEFAULT_REFLECTION, RECOLOR_LABELS } from '../inspector/picture';
import type { SectionWrite } from '../inspector/fields';

afterEach(cleanup);

function writeStub(): { write: SectionWrite; dispatch: ReturnType<typeof vi.fn<EditorDispatch>> } {
  const dispatch = vi.fn<EditorDispatch>(async () => ({}));
  return {
    dispatch,
    write: {
      slideId: 'gallery',
      revision: 7,
      dispatch,
      busy: false,
      report: () => undefined,
    },
  };
}

const picture: Block = {
  id: 'pic',
  type: 'picture',
  asset: 'photo',
  pos: { x: 0, y: 0, w: 800, h: 450, z: 1 },
} as Block;

describe('the Adjustments section of a picture', () => {
  it('lists every recolor preset with its label and writes the chosen one through block.adjust', () => {
    const { write, dispatch } = writeStub();
    const { container } = render(<AdjustmentsSection block={picture} write={write} />);
    const select = container.querySelector<HTMLSelectElement>(
      '[data-control="formatOptions.adjustments.recolor"]',
    );
    expect(select).not.toBeNull();
    const labels = [...select!.querySelectorAll('option')].map((option) => option.textContent);
    expect(labels).toEqual(RECOLOR_PRESETS.map((preset) => RECOLOR_LABELS[preset]));
    expect(labels[0]).toBe('No recolor');
    fireEvent.change(select!, { target: { value: 'grayscale' } });
    expect(dispatch).toHaveBeenCalledWith('block.adjust', {
      slideId: 'gallery',
      blockId: 'pic',
      recolor: 'grayscale',
      baseRevision: 7,
    });
    // back to No recolor clears the field with null
    fireEvent.change(select!, { target: { value: 'none' } });
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.adjust',
      expect.objectContaining({ recolor: null }),
    );
  });

  it('switches the reflection on with the default sliders, moves one slider, and switches it off with null', () => {
    const { write, dispatch } = writeStub();
    const { container, rerender } = render(<AdjustmentsSection block={picture} write={write} />);
    expect(
      container.querySelector('[data-control="formatOptions.adjustments.reflection.size.slider"]'),
    ).toBeNull();
    const check = container.querySelector<HTMLInputElement>(
      '[data-control="formatOptions.adjustments.reflection.on"]',
    );
    fireEvent.click(check!);
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.adjust',
      expect.objectContaining({ reflection: DEFAULT_REFLECTION }),
    );
    const reflected = {
      ...picture,
      adjust: { reflection: { transparency: 0.5, distance: 8, size: 0.4 } },
    } as Block;
    rerender(<AdjustmentsSection block={reflected} write={write} />);
    const size = container.querySelector<HTMLInputElement>(
      '[data-control="formatOptions.adjustments.reflection.size.slider"]',
    );
    expect(size).not.toBeNull();
    expect(size!.value).toBe('40');
    fireEvent.change(size!, { target: { value: '60' } });
    fireEvent.keyUp(size!, { key: 'ArrowRight' });
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.adjust',
      expect.objectContaining({ reflection: { transparency: 0.5, distance: 8, size: 0.6 } }),
    );
    const distance = container.querySelector<HTMLInputElement>(
      '[data-control="formatOptions.adjustments.reflection.distance.slider"]',
    );
    fireEvent.change(distance!, { target: { value: '24' } });
    fireEvent.keyUp(distance!, { key: 'ArrowRight' });
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.adjust',
      expect.objectContaining({ reflection: { transparency: 0.5, distance: 24, size: 0.4 } }),
    );
    fireEvent.click(
      container.querySelector<HTMLInputElement>(
        '[data-control="formatOptions.adjustments.reflection.on"]',
      )!,
    );
    expect(dispatch).toHaveBeenLastCalledWith(
      'block.adjust',
      expect.objectContaining({ reflection: null }),
    );
  });

  it('resets the five fields together and offers neither row on an icon', () => {
    const { write, dispatch } = writeStub();
    const adjusted = { ...picture, adjust: { brightness: 0.2, recolor: 'sepia' } } as Block;
    const { container } = render(<AdjustmentsSection block={adjusted} write={write} />);
    fireEvent.click(container.querySelector('[data-control="formatOptions.adjustments.reset"]')!);
    expect(dispatch).toHaveBeenLastCalledWith('block.adjust', {
      slideId: 'gallery',
      blockId: 'pic',
      transparency: null,
      brightness: null,
      contrast: null,
      reflection: null,
      recolor: null,
      baseRevision: 7,
    });
    cleanup();
    const icon = {
      id: 'i',
      type: 'icon',
      name: 'bolt',
      pos: { x: 0, y: 0, w: 48, h: 48, z: 1 },
    } as unknown as Block;
    const second = render(<AdjustmentsSection block={icon} write={writeStub().write} />);
    expect(
      second.container.querySelector('[data-control="formatOptions.adjustments.recolor"]'),
    ).toBeNull();
    expect(
      second.container.querySelector('[data-control="formatOptions.adjustments.reflection.on"]'),
    ).toBeNull();
  });
});
