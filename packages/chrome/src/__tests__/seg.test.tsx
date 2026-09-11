// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Seg } from '../Seg';
import type { SegOption } from '../Seg';

// Seg (SPEC 2.2, 6.3): one active option, a click on another option selects it, a click on the
// active option changes nothing unless `toggle` is on, where the ported return to the first
// option applies (measured in the M5 verification: the Export menu's Mode and Theme segs reset
// to Flatten and Both when the chosen option was clicked again as a confirmation).
const MODES: readonly SegOption<'flatten' | 'native'>[] = [
  { value: 'flatten', label: 'Flatten', title: 'Flatten' },
  { value: 'native', label: 'Native', title: 'Native' },
];

afterEach(cleanup);

function option(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-control="export.mode.${id}"]`);
  if (!el) throw new Error(`no option ${id}`);
  return el;
}

describe('Seg', () => {
  it('selects another option and marks it pressed', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Seg
        options={MODES}
        value="flatten"
        onChange={onChange}
        label="Mode"
        control="export.mode"
      />,
    );
    expect(option(container, 'flatten').getAttribute('aria-pressed')).toBe('true');
    expect(option(container, 'native').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(option(container, 'native'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('native');
  });

  it('leaves the active option alone on a repeated click', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Seg options={MODES} value="native" onChange={onChange} label="Mode" control="export.mode" />,
    );
    fireEvent.click(option(container, 'native'));
    fireEvent.click(option(container, 'native'));
    expect(onChange).not.toHaveBeenCalled();
    expect(option(container, 'native').getAttribute('aria-pressed')).toBe('true');
  });

  it('returns to the first option on a repeated click only with toggle', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Seg
        options={MODES}
        value="native"
        onChange={onChange}
        label="Mode"
        control="export.mode"
        toggle
      />,
    );
    fireEvent.click(option(container, 'native'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('flatten');
    /* the first option is the resting place: a repeated click on it changes nothing */
    onChange.mockClear();
    cleanup();
    const again = render(
      <Seg
        options={MODES}
        value="flatten"
        onChange={onChange}
        label="Mode"
        control="export.mode"
        toggle
      />,
    );
    fireEvent.click(option(again.container, 'flatten'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
