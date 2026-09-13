// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BULLET_PRESETS, NUMBER_PRESETS } from '@turboslide/schema/text';
import { DASHES, LINE_ENDS, SHAPE_PRESETS } from '@turboslide/schema/shapes';

import { DashList } from '../pickers/DashList';
import { LineEndPicker } from '../pickers/LineEndPicker';
import { PresetPicker, presetLabel } from '../pickers/PresetPicker';
import { ShapePicker, shapeTiles } from '../pickers/ShapePicker';
import { WeightList } from '../pickers/WeightList';
import { hideTooltip } from '../Tooltip';

// The pickers of round two (gslides-parity SPEC-2 4.1, 6.2, section 10): every tile is a
// gridcell or an option with an accessible name drawn from the shape table or the preset table,
// the arrows walk the grid, Home and End jump, Enter picks, ArrowLeft on the first column is left
// to the menu, the glyphs come from shapePath and lineEndPath and nothing carries a title.

afterEach(() => {
  hideTooltip();
  cleanup();
});

function noTitles(root: ParentNode): void {
  for (const el of root.querySelectorAll('[title]')) expect(el, 'no native titles').toBeNull();
}

describe('ShapePicker', () => {
  it('draws every preset of the table under the four categories, or one category alone', () => {
    const all = render(<ShapePicker onPick={() => undefined} />);
    expect(all.container.querySelectorAll('[role="gridcell"]')).toHaveLength(SHAPE_PRESETS.length);
    expect(all.container.querySelectorAll('.ts-picker-title')).toHaveLength(4);
    expect(all.container.querySelectorAll('svg path')).toHaveLength(SHAPE_PRESETS.length);
    noTitles(all.container);
    cleanup();
    const arrows = render(<ShapePicker category="arrows" onPick={() => undefined} />);
    expect(arrows.container.querySelectorAll('[role="gridcell"]')).toHaveLength(
      shapeTiles('arrows').length,
    );
    expect(arrows.container.querySelectorAll('.ts-picker-title')).toHaveLength(0);
    const tile = arrows.container.querySelector(
      '[data-control="shapes.pick.rightArrow"]',
    ) as HTMLElement;
    expect(tile.getAttribute('aria-label')).toBe('Right arrow');
  });

  it('picks on a click and on Enter, walks with the arrows, and leaves ArrowLeft on the first column to the menu', () => {
    const onPick = vi.fn();
    const outer = vi.fn();
    const { container } = render(
      <div onKeyDown={outer}>
        <ShapePicker category="equation" onPick={onPick} autoFocus />
      </div>,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(document.activeElement).toBe(grid);
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith(shapeTiles('equation')[1]?.id);
    fireEvent.keyDown(grid, { key: 'Home' });
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(outer).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(grid, { key: 'End' });
    fireEvent.keyDown(grid, { key: ' ' });
    expect(onPick).toHaveBeenLastCalledWith('mathNotEqual');
    fireEvent.click(
      container.querySelector('[data-control="shapes.pick.mathPlus"]') as HTMLElement,
    );
    expect(onPick).toHaveBeenLastCalledWith('mathPlus');
  });
});

describe('PresetPicker', () => {
  it('lists the nine bullet presets and the six numbering presets with their three level forms as the name', () => {
    const bullets = render(<PresetPicker family="bullet" onPick={() => undefined} />);
    expect(bullets.container.querySelectorAll('[role="gridcell"]')).toHaveLength(
      BULLET_PRESETS.length,
    );
    expect(presetLabel('bullet', 'disc-circle-square')).toBe('● ○ ■');
    expect(presetLabel('number', 'digit-alpha-roman')).toBe('1. a. i.');
    expect(presetLabel('number', 'digit-alpha-roman-parens')).toBe('1) a) i)');
    noTitles(bullets.container);
    cleanup();
    const onPick = vi.fn();
    const numbers = render(<PresetPicker family="number" onPick={onPick} autoFocus />);
    expect(numbers.container.querySelectorAll('[role="gridcell"]')).toHaveLength(
      NUMBER_PRESETS.length,
    );
    const grid = numbers.container.querySelector('[role="grid"]') as HTMLElement;
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith(NUMBER_PRESETS[3]);
  });
});

describe('LineEndPicker and DashList', () => {
  it('draw the ten decorations and the six dashes, named in Google’s words, and pick with a click', () => {
    const onEnd = vi.fn();
    const ends = render(<LineEndPicker end="end" onPick={onEnd} picked="fillArrow" />);
    expect(ends.container.querySelectorAll('[role="gridcell"]')).toHaveLength(LINE_ENDS.length);
    expect(
      ends.container
        .querySelector('[data-control="lineEnd.pick.stealth"]')
        ?.getAttribute('aria-label'),
    ).toBe('Stealth arrow');
    expect(
      ends.container
        .querySelector('[data-control="lineEnd.pick.fillArrow"]')
        ?.classList.contains('is-picked'),
    ).toBe(true);
    fireEvent.click(
      ends.container.querySelector('[data-control="lineEnd.pick.openCircle"]') as HTMLElement,
    );
    expect(onEnd).toHaveBeenLastCalledWith('openCircle');
    noTitles(ends.container);
    cleanup();
    const onDash = vi.fn();
    const dashes = render(<DashList onPick={onDash} picked="dot" autoFocus />);
    expect(dashes.container.querySelectorAll('[role="option"]')).toHaveLength(DASHES.length);
    const list = dashes.container.querySelector('[role="listbox"]') as HTMLElement;
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onDash).toHaveBeenLastCalledWith('dash');
    expect(
      dashes.container.querySelector('[data-control="dash.pick.longDashDot"]')?.textContent,
    ).toContain('Long dash dot');
  });

  it('the weight list is anchored under its opener, names None for 0 and closes on Esc back to the anchor', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <WeightList
        anchor={anchor}
        label="Border weight"
        weights={[0, 1, 1.5, 2]}
        current={1}
        onPick={onPick}
        onClose={onClose}
        control="weights"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLElement;
    expect(list.getAttribute('aria-label')).toBe('Border weight');
    expect(container.querySelector('[data-control="weights.0"]')?.textContent).toContain('None');
    expect(
      container.querySelector('[data-control="weights.1"]')?.getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.click(container.querySelector('[data-control="weights.2"]') as HTMLElement);
    expect(onPick).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(anchor);
    anchor.remove();
  });
});
