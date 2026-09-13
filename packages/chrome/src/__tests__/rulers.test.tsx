// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inchesLabel,
  PX_PER_INCH,
  rulerNumerals,
  rulerTicks,
  rulerToSheet,
  tickLength,
} from '@turboslide/viewer/rulers-model';

import { GUIDES } from '../menus/strings';
import { Rulers } from '../Rulers';
import { hideTooltip } from '../Tooltip';

// The rulers of View > Show ruler (gslides-parity SPEC-2 6.1 row 29, 0.82, 0.108): inches at 120
// px, a tick every eighth, 14 and 8 numerals with the origin carrying its numeral, the selection's
// extent, the pointer's hairline, the drag out.

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('the tick math', () => {
  it('ticks every eighth of an inch and numbers every inch: 0 to 13 across, 0 to 7 down', () => {
    expect(PX_PER_INCH).toBe(120);
    const across = rulerTicks('x');
    expect(across[0]).toEqual({ at: 0, kind: 'inch', label: '0' });
    expect(across[1]).toEqual({ at: 15, kind: 'eighth' });
    expect(across[2]).toEqual({ at: 30, kind: 'quarter' });
    expect(across[4]).toEqual({ at: 60, kind: 'half' });
    expect(across[across.length - 1]?.at).toBeLessThanOrEqual(1600);
    expect(rulerNumerals('x')).toEqual([...Array(14).keys()].map(String));
    expect(rulerNumerals('y')).toEqual([...Array(8).keys()].map(String));
    expect(tickLength('inch')).toBe(20);
    expect(tickLength('eighth')).toBeLessThan(tickLength('quarter'));
  });

  it('reads a client position back to sheet pixels inside the sheet and prints inches like the strings', () => {
    expect(rulerToSheet('x', 500, 100, 0.5)).toBe(800);
    expect(rulerToSheet('x', 0, 100, 0.5)).toBe(0);
    expect(rulerToSheet('y', 10_000, 0, 0.5)).toBe(900);
    expect(inchesLabel(800)).toBe('6.67 in');
    expect(inchesLabel(800)).toBe(GUIDES.inches(800));
  });
});

describe('Rulers', () => {
  it('draws two rulers with 14 and 8 numerals at the stage scale, the selection shaded and the hairline placed', () => {
    const onRulerDown = vi.fn();
    const { container } = render(
      <Rulers
        k={0.5}
        pointer={{ x: 400, y: 300 }}
        selection={[200, 200, 300, 100]}
        onRulerDown={onRulerDown}
      />,
    );
    const rulers = container.querySelectorAll<HTMLElement>('.ts-ruler');
    expect(rulers).toHaveLength(2);
    const across = container.querySelector<HTMLElement>('.ts-ruler.is-x');
    const down = container.querySelector<HTMLElement>('.ts-ruler.is-y');
    if (!across || !down) throw new Error('no rulers');
    expect(across.querySelectorAll('.ts-ruler-numeral')).toHaveLength(14);
    expect(down.querySelectorAll('.ts-ruler-numeral')).toHaveLength(8);
    expect(across.querySelector('.ts-ruler-numeral')?.textContent).toBe('0');
    /* the extent of the selection: 200 by 300 sheet px at k 0.5 */
    expect(across.querySelector<HTMLElement>('.ts-ruler-extent')?.style.left).toBe('100px');
    expect(across.querySelector<HTMLElement>('.ts-ruler-extent')?.style.width).toBe('150px');
    expect(across.querySelector<HTMLElement>('.ts-ruler-hair')?.style.left).toBe('200px');
    expect(down.querySelector<HTMLElement>('.ts-ruler-hair')?.style.top).toBe('150px');
    /* every ruler is a named region with the tooltip primitive and no title */
    for (const ruler of rulers) {
      expect(ruler.getAttribute('role')).toBe('region');
      expect(ruler.getAttribute('aria-label')).toBeTruthy();
      expect(ruler.getAttribute('data-tip')).toBeTruthy();
      expect(ruler.hasAttribute('title')).toBe(false);
    }
    fireEvent.pointerDown(down, { button: 0 });
    expect(onRulerDown).toHaveBeenCalledWith('y', expect.anything());
    fireEvent.pointerDown(across, { button: 2 });
    expect(onRulerDown).toHaveBeenCalledTimes(1);
  });
});
