// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatOklch } from '@turboslide/theme/color-space';
import { TOKENS } from '@turboslide/theme/tokens';

import { ColorPlate, fieldStartHex } from '../pickers/ColorPlate';
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
  it('focuses the first swatch on mount, the brand kit’s Text swatch (docs/archive/rounds/PRODUCT.md 4.1)', () => {
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

// The free colour field (the Glyphfield port, wave 2 item 6, from Glyphfield's ColorControl and
// ScreenColorPicker): every part changes one draft and nothing is written until Apply or Enter,
// so a pick from the field is one write like a swatch's; the field starts from the colour the
// target draws; Pick Screen Color shows only where the browser has the EyeDropper API; `hexOnly`
// draws the field alone (the Brand kit panel's roles) and `onPreview` hears each draft.
describe('ColorPlate colour field', () => {
  const box = (el: Element, width: number, height: number) => {
    el.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
  };
  const part = (container: HTMLElement, id: string) => {
    const el = container.querySelector<HTMLElement>(`[data-control="toolbar.fillColor.${id}"]`);
    if (el === null) throw new Error(`no ${id}`);
    return el;
  };

  it('starts from the colour the target draws and shows it in Hex and OKLCH', () => {
    const first = plate(() => undefined);
    const { container } = render(first.node);
    const hex = part(container, 'hex') as HTMLInputElement;
    const oklch = part(container, 'custom.oklch') as HTMLInputElement;
    /* current is blue, the kit's Primary, which GT's sheet draws #2f5ce0 outside an editor */
    expect(hex.value).toBe(fieldStartHex('blue', TOKENS.light));
    expect(hex.value).toMatch(/^#[0-9a-f]{6}$/);
    expect(oklch.value).toBe(formatOklch(hex.value)?.replace(/^oklch\((.*)\)$/, '$1'));
    expect(oklch.value).toMatch(/^\d{1,3}% [\d.]+ \d{1,3}$/);
    first.anchor.remove();
  });

  it('a drag in the area changes the draft and writes nothing; Apply writes it once', () => {
    const onPick = vi.fn();
    const first = plate(() => undefined, onPick);
    const { container } = render(first.node);
    const area = part(container, 'custom.area');
    const hue = part(container, 'custom.hue');
    box(area, 200, 100);
    box(hue, 360, 12);
    /* hue 120, then the area's top right corner: pure green */
    fireEvent.pointerDown(hue, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 120,
      clientY: 6,
    });
    fireEvent.pointerUp(hue, { pointerId: 1, button: 0, clientX: 120, clientY: 6 });
    fireEvent.pointerDown(area, {
      pointerId: 2,
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: 50,
    });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 200, clientY: 0 });
    fireEvent.pointerUp(area, { pointerId: 2, button: 0, clientX: 200, clientY: 0 });
    expect(onPick).not.toHaveBeenCalled();
    expect((part(container, 'hex') as HTMLInputElement).value).toBe('#00ff00');
    expect(area.getAttribute('aria-valuetext')).toBe('Saturation 100%, brightness 100%');
    /* a move after the release is not a drag */
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 0, clientY: 100 });
    expect((part(container, 'hex') as HTMLInputElement).value).toBe('#00ff00');
    fireEvent.click(part(container, 'custom.apply'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('#00ff00');
    first.anchor.remove();
  });

  it('keeps the hue through a grey, steps with the arrow keys and applies on Enter', () => {
    const onPick = vi.fn();
    const first = plate(() => undefined, onPick);
    const { container } = render(first.node);
    const area = part(container, 'custom.area');
    const hue = part(container, 'custom.hue');
    box(area, 100, 100);
    box(hue, 360, 12);
    fireEvent.pointerDown(hue, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 240,
      clientY: 6,
    });
    fireEvent.pointerUp(hue, { pointerId: 1, button: 0, clientX: 240, clientY: 6 });
    /* the left edge is a grey, which a hex cannot hold a hue for */
    fireEvent.pointerDown(area, {
      pointerId: 2,
      isPrimary: true,
      button: 0,
      clientX: 0,
      clientY: 50,
    });
    fireEvent.pointerUp(area, { pointerId: 2, button: 0, clientX: 0, clientY: 50 });
    expect(hue.getAttribute('aria-valuenow')).toBe('240');
    fireEvent.keyDown(area, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(area, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(area, { key: 'ArrowUp' });
    expect(area.getAttribute('aria-valuetext')).toBe('Saturation 20%, brightness 51%');
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    /* hue 240 at 20% and 51%: a blue grey */
    expect(onPick).toHaveBeenCalledWith('#686882');
    first.anchor.remove();
  });

  it('reads a typed OKLCH and writes its hex on Enter, and leaves a value it cannot read', () => {
    const onPick = vi.fn();
    const first = plate(() => undefined, onPick);
    const { container } = render(first.node);
    const oklch = part(container, 'custom.oklch') as HTMLInputElement;
    oklch.focus();
    fireEvent.change(oklch, { target: { value: 'oklch(62.8% 0.258' } });
    fireEvent.keyDown(oklch, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.change(oklch, { target: { value: 'oklch(62.8% 0.258 29.2)' } });
    expect((part(container, 'hex') as HTMLInputElement).value).toBe('#ff0000');
    fireEvent.keyDown(oklch, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('#ff0000');
    first.anchor.remove();
  });

  it('shows Pick Screen Color only with the EyeDropper API; a sample becomes the draft', async () => {
    const onPick = vi.fn();
    const without = plate(() => undefined, onPick);
    const one = render(without.node);
    expect(one.container.querySelector('[data-control="toolbar.fillColor.custom.screen"]')).toBe(
      null,
    );
    one.unmount();
    without.anchor.remove();
    const open = vi.fn(async () => ({ sRGBHex: '#12a37a' }));
    (window as unknown as { EyeDropper?: unknown }).EyeDropper = class {
      open = open;
    };
    try {
      const first = plate(() => undefined, onPick);
      const { container } = render(first.node);
      const screen = part(container, 'custom.screen');
      expect(screen.textContent).toBe('Pick Screen Color');
      fireEvent.click(screen);
      await waitFor(() =>
        expect((part(container, 'hex') as HTMLInputElement).value).toBe('#12a37a'),
      );
      expect(open).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
      fireEvent.click(part(container, 'custom.apply'));
      expect(onPick).toHaveBeenCalledWith('#12a37a');
      first.anchor.remove();
    } finally {
      delete (window as unknown as { EyeDropper?: unknown }).EyeDropper;
    }
  });

  it('hexOnly draws the field alone, focuses the area and previews each draft', () => {
    const onPick = vi.fn();
    const onPreview = vi.fn();
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const { container } = render(
      <ColorPlate
        anchor={anchor}
        label="Primary"
        current="#2f5ce0"
        control="panel.brand.color.primary"
        hexOnly
        onPreview={onPreview}
        onPick={onPick}
        onClose={() => undefined}
      />,
    );
    expect(container.querySelectorAll('.ts-color-swatch')).toHaveLength(0);
    const area = container.querySelector<HTMLElement>(
      '[data-control="panel.brand.color.primary.custom.area"]',
    );
    expect(document.activeElement).toBe(area);
    if (area === null) throw new Error('no area');
    fireEvent.keyDown(area, { key: 'ArrowDown', shiftKey: true });
    expect(onPreview).toHaveBeenCalledTimes(1);
    const drafted = onPreview.mock.calls[0]?.[0] as string;
    expect(drafted).toMatch(/^#[0-9a-f]{6}$/);
    expect(drafted).not.toBe('#2f5ce0');
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(drafted);
    anchor.remove();
  });
});
