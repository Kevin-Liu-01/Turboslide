// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SliderField } from '../inspector/fields';
import { hideTooltip } from '../Tooltip';

// The Format options slider (docs/FOCUS.md `images.options.transparency`; F-transparency, b1
// R25): the value the pointer moved to is committed on the release, read from the ref the input
// event set and not from the state of the render the handler was bound in, and a release the
// document sees while the input does not (a drag that ends past the track) commits too.
afterEach(() => {
  hideTooltip();
  cleanup();
});

function slider(onCommit: (value: number) => void) {
  const view = render(
    <SliderField
      label="Transparency"
      value={0}
      min={0}
      max={100}
      onCommit={onCommit}
      control="formatOptions.picture.transparency"
    />,
  );
  return view.container.querySelector('input[type="range"]') as HTMLInputElement;
}

describe('SliderField', () => {
  it('commits the value the pointer set when the press and the release land inside one event turn', () => {
    const onCommit = vi.fn();
    const input = slider(onCommit);
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.pointerUp(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(60);
    /* a second release commits nothing: the live value was cleared */
    fireEvent.pointerUp(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits on a release the document sees after a drag that left the input', () => {
    const onCommit = vi.fn();
    const input = slider(onCommit);
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: '35' } });
    fireEvent.pointerUp(document.body);
    expect(onCommit).toHaveBeenCalledWith(35);
  });

  it('commits a keyboard step on the key up and nothing when the value did not move', () => {
    const onCommit = vi.fn();
    const input = slider(onCommit);
    fireEvent.keyUp(input, { key: 'ArrowRight' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyUp(input, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenCalledWith(1);
  });
});
