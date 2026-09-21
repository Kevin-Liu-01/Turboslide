// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ColorPlate } from '../pickers/ColorPlate';
import { hideTooltip } from '../Tooltip';

// The colour plate's focus (the focus round, cycle 3 fix; b3 C3-R1, VERIFICATION C3-F7): the
// first swatch takes the focus once, on mount, and a render of the caller that passes a fresh
// `onClose` (the tail re-renders on every revision, and on the memory tier the checkpoint of the
// swatch write lands while the hex value is typed) leaves the focus where the person put it. The
// row `shapes.fill.colour` read the hex field losing its caret mid word, Enter landing on the
// None swatch and the value never reaching the shape.

afterEach(() => {
  hideTooltip();
  cleanup();
});

function plate(onClose: () => void, onPick: (value: string) => void = () => undefined) {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  return {
    anchor,
    node: (
      <ColorPlate
        anchor={anchor}
        label="Fill color"
        current="blue"
        control="toolbar.fillColor"
        onPick={onPick}
        onClose={onClose}
      />
    ),
  };
}

describe('ColorPlate', () => {
  it('focuses the first swatch on mount, the brand kit’s Text swatch (docs/PRODUCT.md 4.1)', () => {
    const first = plate(() => undefined);
    const { container } = render(first.node);
    const text = container.querySelector('[data-control="toolbar.fillColor.kit.text"]');
    expect(document.activeElement).toBe(text);
    /* the container is the menu id, the plate token's swatch keeps `.plate` (brand.colors.control-ids-unique) */
    expect(container.querySelectorAll('[data-control="toolbar.fillColor.plate"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-control="toolbar.fillColor.menu"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-control^="toolbar.fillColor.kit."]')).toHaveLength(6);
    first.anchor.remove();
  });

  it('keeps the focus in the hex field across a render with a new onClose', () => {
    const first = plate(() => undefined);
    const { container, rerender } = render(first.node);
    const hex = container.querySelector<HTMLInputElement>('[data-control="toolbar.fillColor.hex"]');
    if (!hex) throw new Error('no hex field');
    hex.focus();
    fireEvent.change(hex, { target: { value: '#aa336' } });
    expect(document.activeElement).toBe(hex);
    /* the caller's render: a fresh closure for onClose, the same anchor */
    const second = (
      <ColorPlate
        anchor={first.anchor}
        label="Fill color"
        current="blue"
        control="toolbar.fillColor"
        onPick={() => undefined}
        onClose={() => undefined}
      />
    );
    rerender(second);
    expect(document.activeElement).toBe(hex);
    expect(hex.value).toBe('#aa336');
    first.anchor.remove();
  });

  it('picks the typed hex on Enter and follows the latest onClose on a click outside', () => {
    const onPick = vi.fn();
    const closeOne = vi.fn();
    const closeTwo = vi.fn();
    const first = plate(closeOne, onPick);
    const { container, rerender } = render(first.node);
    const hex = container.querySelector<HTMLInputElement>('[data-control="toolbar.fillColor.hex"]');
    if (!hex) throw new Error('no hex field');
    hex.focus();
    fireEvent.change(hex, { target: { value: '#aa3366' } });
    rerender(
      <ColorPlate
        anchor={first.anchor}
        label="Fill color"
        current="blue"
        control="toolbar.fillColor"
        onPick={onPick}
        onClose={closeTwo}
      />,
    );
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('#aa3366');
    /* the outside click listener is the latest caller's */
    fireEvent.mouseDown(document.body);
    expect(closeOne).not.toHaveBeenCalled();
    expect(closeTwo).toHaveBeenCalledTimes(1);
    first.anchor.remove();
  });
});
