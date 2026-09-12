// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';

import { blockControls } from '../inspector/generate';
import { PaletteControl } from '../inspector/palette';

// The palette control's keys (this round): Enter and Space on a focused swatch pick it as one
// onChange, the way a click does, and the stage's Enter (inline editing of the selected block)
// never reads the key. Measured on the editor depth preview before the fix: Enter on
// block.box.fill.plate left the fill at #ff6600 and opened the box's text for editing.

const box: Block = { id: 'b', type: 'box', fill: '#ff6600' };

function fillSpec() {
  const spec = blockControls(box).controls.find((control) => control.path === '/fill');
  if (!spec) throw new Error('the box has no fill control');
  return spec;
}

afterEach(cleanup);

describe('PaletteControl keys', () => {
  it('picks a swatch on Enter and on Space, once each, and stops the key there', () => {
    const onChange = vi.fn();
    const { container } = render(<PaletteControl spec={fillSpec()} onChange={onChange} />);
    const plate = container.querySelector<HTMLButtonElement>('[data-control="block.b.fill.plate"]');
    if (!plate) throw new Error('no plate swatch');
    plate.focus();
    const seen: string[] = [];
    document.addEventListener('keydown', (event) => seen.push(event.key));
    const enter = fireEvent.keyDown(plate, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('plate');
    /* the default (a click, which would pick again) and the propagation are stopped */
    expect(enter).toBe(false);
    expect(seen).toEqual([]);
    const ink = container.querySelector<HTMLButtonElement>('[data-control="block.b.fill.ink"]');
    if (!ink) throw new Error('no ink swatch');
    fireEvent.keyDown(ink, { key: ' ' });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('ink');
    /* another key is not a pick */
    fireEvent.keyDown(ink, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-editing]')).toBeNull();
  });

  it('carries the tooltip on every swatch and no native title', () => {
    const { container } = render(<PaletteControl spec={fillSpec()} onChange={vi.fn()} />);
    const swatches = container.querySelectorAll<HTMLButtonElement>('.ts-ctl-swatches button');
    expect(swatches.length).toBeGreaterThan(8);
    for (const swatch of swatches) {
      expect(swatch.getAttribute('data-tip')).toBeTruthy();
      expect(swatch.hasAttribute('title')).toBe(false);
    }
  });
});
