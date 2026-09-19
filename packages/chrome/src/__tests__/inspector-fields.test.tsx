// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberField, SliderField } from '../inspector/fields';
import { StepperControl } from '../inspector/stepper';
import type { ControlSpec } from '../inspector/generate';
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

// One history entry per typed value (docs/RETURN.md 2.14 item 3; audit-formatting rows 12, 13,
// 64 to 66): Enter commits and blurs the field in one event, and the blur's commit ran again on
// the draft of the render its handler was bound in, so a typed width made two writes and the
// first Cmd+Z restored nothing.
describe('a typed number commits once (RETURN.md 2.14 item 3)', () => {
  it('NumberField: Enter then the blur it causes call onCommit once, with the typed value', () => {
    const onCommit = vi.fn();
    const view = render(
      <NumberField
        label="Width"
        value={480}
        onCommit={onCommit}
        control="formatOptions.size.width"
      />,
    );
    const input = view.container.querySelector('input') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '400' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    /* the blur the Enter handler asks for: jsdom fires it through blur(); the handler runs with
       the ref cleared by the first commit */
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(400);
    /* a later blur with nothing typed commits nothing */
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('NumberField: Escape drops the draft and commits nothing; a second typed value commits again', () => {
    const onCommit = vi.fn();
    const view = render(
      <NumberField
        label="Width"
        value={480}
        onCommit={onCommit}
        control="formatOptions.size.width"
      />,
    );
    const input = view.container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '400' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(300);
  });

  it('StepperControl: the change event on Enter and the change event on the blur before the write lands commit the value once', () => {
    const onChange = vi.fn();
    const spec = {
      control: 'formatOptions.size.width',
      label: 'Width',
      path: '/pos/w',
      kind: 'stepper',
      inspector: { label: 'Width', control: 'number' },
      group: 'Size',
      value: 480,
      optional: false,
      text: false,
      schema: { safeParse: () => ({ success: true }) },
    } as unknown as ControlSpec;
    const view = render(<StepperControl spec={spec} onChange={onChange} />);
    const input = view.container.querySelector('input[type="number"]') as HTMLInputElement;
    /* the native change event the stepper listens to, twice for one typed value */
    input.value = '400';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(400);
    /* once the document carries the value, a new typed value commits again */
    view.rerender(
      <StepperControl spec={{ ...spec, value: 400 } as ControlSpec} onChange={onChange} />,
    );
    input.value = '300';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(300);
  });
});
