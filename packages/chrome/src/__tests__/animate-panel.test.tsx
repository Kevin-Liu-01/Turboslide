// @vitest-environment jsdom
// The Animate panel (HTML-SLIDES-DESIGN 2.5, its first part): the selected object's effects with
// their preset, start, delay and duration, each change one motion action through the editor's
// dispatch with the revision it read; Add animation adds a click effect of the chosen role and
// preset; Remove takes one effect away; a time outside the range writes nothing and says so.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { slideBlocks } from '@turboslide/schema/deck';
import type { Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { PANELS } from '../menus/strings';
import { AnimatePanel } from '../panels/AnimatePanel';
import { hideTooltip } from '../Tooltip';
import { chooseOption } from './choose-option';

afterEach(() => {
  hideTooltip();
  cleanup();
});

const SLIDE = 'content-rule';

function setup(effects: Slide['effects'] = undefined) {
  const doc = workedDocument();
  const base = doc.slides[SLIDE] as Slide;
  const block = slideBlocks(base)[0]!.block;
  const slide = {
    ...base,
    ...(effects === undefined
      ? {}
      : { effects: effects.map((effect) => ({ ...effect, block: block.id })) }),
  } as Slide;
  const dispatch = vi.fn((_action: string, _input: unknown) => Promise.resolve({}));
  const onNotice = vi.fn();
  render(
    <AnimatePanel
      slideId={SLIDE}
      slide={slide}
      block={block}
      revision={412}
      dispatch={dispatch}
      onNotice={onNotice}
      onClose={vi.fn()}
    />,
  );
  return { block, dispatch, onNotice };
}

function control(id: string, root: ParentNode = document): HTMLElement {
  return root.querySelector(`[data-control="${id}"]`) as HTMLElement;
}

describe('AnimatePanel', () => {
  it('asks for an object when none is selected', () => {
    render(
      <AnimatePanel
        slideId={SLIDE}
        slide={undefined}
        block={undefined}
        revision={1}
        dispatch={vi.fn()}
        onNotice={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(PANELS.animate.empty)).toBeTruthy();
  });

  it('adds an effect of the chosen role and preset on click', () => {
    const { block, dispatch } = setup();
    expect(screen.getByText(PANELS.animate.none)).toBeTruthy();
    chooseOption('panel.animate.add', 'exit.rise-in');
    expect(dispatch).toHaveBeenCalledWith('motion.add', {
      slideId: SLIDE,
      baseRevision: 412,
      effect: { block: block.id, role: 'exit', motion: { preset: 'rise-in' }, start: 'click' },
    });
  });

  it('sets the preset, the start, the delay and the duration, one motion.set each', () => {
    const { dispatch } = setup([
      {
        id: 'fx-1',
        block: '',
        role: 'enter',
        motion: { preset: 'fade' },
        start: 'click',
        durationMs: 500,
      },
    ]);
    const card = document.querySelector('[data-effect-id="fx-1"]') as HTMLElement;
    expect(card.textContent).toContain('Entrance');
    expect(card.textContent).toContain('Click 1');
    chooseOption('panel.animate.preset', 'pop-in', card);
    chooseOption('panel.animate.start', 'after', card);
    const delay = control('panel.animate.delay', card);
    fireEvent.change(delay, { target: { value: '0.25' } });
    fireEvent.blur(delay);
    const duration = control('panel.animate.duration', card);
    fireEvent.change(duration, { target: { value: '1.2' } });
    fireEvent.keyDown(duration, { key: 'Enter' });
    const sets = dispatch.mock.calls.filter(([action]) => action === 'motion.set');
    expect(sets.map(([, input]) => input)).toEqual([
      {
        slideId: SLIDE,
        baseRevision: 412,
        effectId: 'fx-1',
        path: '/motion/preset',
        value: 'pop-in',
      },
      { slideId: SLIDE, baseRevision: 412, effectId: 'fx-1', path: '/start', value: 'after' },
      { slideId: SLIDE, baseRevision: 412, effectId: 'fx-1', path: '/delayMs', value: 250 },
      { slideId: SLIDE, baseRevision: 412, effectId: 'fx-1', path: '/durationMs', value: 1200 },
    ]);
  });

  it('removes one effect, and refuses a time outside the range without a write', () => {
    const { dispatch, onNotice } = setup([
      {
        id: 'fx-1',
        block: '',
        role: 'emphasis',
        motion: { preset: 'pulse' },
        start: 'with',
        durationMs: 800,
      },
    ]);
    const card = document.querySelector('[data-effect-id="fx-1"]') as HTMLElement;
    const duration = control('panel.animate.duration', card);
    fireEvent.change(duration, { target: { value: '0' } });
    fireEvent.blur(duration);
    expect(onNotice).toHaveBeenCalledWith(PANELS.animate.timeRange);
    expect((duration as HTMLInputElement).value).toBe('0.8');
    fireEvent.click(control('panel.animate.remove', card));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual(['motion.remove']);
    expect(dispatch).toHaveBeenCalledWith('motion.remove', {
      slideId: SLIDE,
      baseRevision: 412,
      effectId: 'fx-1',
    });
  });
});
