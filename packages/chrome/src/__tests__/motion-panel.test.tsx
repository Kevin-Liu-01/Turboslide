// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import { ANIMATION_LABELS_IN_ORDER, MOTION_LABELS } from '@turboslide/schema/motion';
import { setMotionPreview } from '@turboslide/viewer/present/SlideshowLayer';

import { forbiddenWordsIn } from '../menus/strings';
import { MOTION_PANEL_TEXT, MotionPanel } from '../panels/MotionPanel';

// The Motion panel (gslides-parity SPEC-5 2.1; MILESTONES-5 B1 day 3): the Slide Transition
// section with Google's eight kinds in Google's order, the speed slider shown while the kind is
// not None with its seconds readout, Apply to all slides; the Object Animations list in play order
// with the fifteen labels, the start dropdown, By paragraph on a carrier alone, the trash, the six
// dot handle; Add animation writing motion.add for the selected objects and reading "Select an
// object to animate" with nothing selected; Alt+Up and Alt+Down writing motion.reorder; Play
// dispatching motion.play and reading Stop while the preview runs; every write with the revision
// it read; no forbidden word.

afterEach(() => {
  cleanup();
  setMotionPreview(null);
});

function documentWith(slide: Partial<Slide>): DeckDocument {
  const worked = workedDocument();
  const base = worked.slides['content-rule']!;
  return {
    ...worked,
    slides: { ...worked.slides, 'content-rule': { ...base, ...slide } as Slide },
  };
}

const ANIMATIONS: Slide['animations'] = [
  { id: 'a1', blockId: 'h', effect: 'fadeIn', trigger: 'click', durationMs: 500 },
  {
    id: 'a2',
    blockId: 'list',
    effect: 'appear',
    trigger: 'afterPrevious',
    durationMs: 1000,
    byParagraph: true,
  },
  {
    id: 'a3',
    blockId: 'h',
    effect: 'flyOut',
    direction: 'right',
    trigger: 'withPrevious',
    durationMs: 2000,
  },
];

function mount(
  options: {
    slide?: Partial<Slide>;
    selection?: string[];
    section?: 'transition' | 'animations';
  } = {},
) {
  const document = documentWith(options.slide ?? {});
  const dispatch = vi.fn((id: string) =>
    Promise.resolve(
      id === 'motion.add' ? { ids: ['a9'], animations: [], revision: 8 } : { revision: 8 },
    ),
  );
  const onNotice = vi.fn();
  const onClose = vi.fn();
  const onSelectBlock = vi.fn();
  render(
    <MotionPanel
      document={document}
      slideId="content-rule"
      selection={options.selection ?? []}
      revision={7}
      dispatch={dispatch}
      section={options.section}
      onNotice={onNotice}
      onSelectBlock={onSelectBlock}
      onClose={onClose}
    />,
  );
  return { document, dispatch, onNotice, onClose, onSelectBlock };
}

function control(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-control="${id}"]`);
  if (!el) throw new Error(`no control ${id}`);
  return el;
}

function blockIdsOf(document: DeckDocument): string[] {
  const slide = document.slides['content-rule']!;
  return slide.kind === 'content'
    ? Object.values(slide.slots)
        .flat()
        .map((b) => b.id)
    : [];
}

describe('MotionPanel', () => {
  it('draws the two sections with Google’s labels and the eight kinds in order; the slider hides under None', () => {
    mount();
    expect(document.querySelector('[data-control="panel.motion"]')).not.toBeNull();
    expect(document.querySelector('.ts-panel-title')?.textContent).toContain('Motion');
    expect(document.getElementById('ts-motion-transition')?.textContent).toBe('Slide Transition');
    expect(document.getElementById('ts-motion-animations')?.textContent).toBe('Object Animations');
    const kind = control('motion.transition.kind') as HTMLSelectElement;
    expect(Array.from(kind.options).map((o) => o.textContent)).toEqual([
      'None',
      'Dissolve',
      'Fade',
      'Slide from right',
      'Slide from left',
      'Flip',
      'Cube',
      'Gallery',
    ]);
    expect(kind.value).toBe('none');
    expect(document.querySelector('[data-control="motion.transition.duration"]')).toBeNull();
    expect(control('motion.transition.applyAll').textContent).toBe('Apply to all slides');
    expect(control('motion.play').textContent).toContain('Play');
    expect(document.querySelector('.ts-motion-empty')?.textContent).toBe(
      MOTION_PANEL_TEXT.noAnimations,
    );
    const words = forbiddenWordsIn(document.body.textContent ?? '');
    expect(words).toEqual([]);
  });

  it('writes motion.setTransition for the kind, the slider on release and Apply to all slides, with the revision', () => {
    const { dispatch } = mount({ slide: { transition: { kind: 'fade', durationMs: 700 } } });
    const kind = control('motion.transition.kind') as HTMLSelectElement;
    expect(kind.value).toBe('fade');
    fireEvent.change(kind, { target: { value: 'cube' } });
    expect(dispatch).toHaveBeenCalledWith('motion.setTransition', {
      slideId: 'content-rule',
      kind: 'cube',
      baseRevision: 7,
    });
    const slider = control('motion.transition.duration') as HTMLInputElement;
    expect(slider.min).toBe('100');
    expect(slider.max).toBe('5000');
    expect(control('motion.transition.duration.value').textContent).toBe('0.7 s');
    fireEvent.change(slider, { target: { value: '2000' } });
    expect(control('motion.transition.duration.value').textContent).toBe('2.0 s');
    // nothing left before the release
    expect(dispatch).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(slider);
    expect(dispatch).toHaveBeenCalledWith('motion.setTransition', {
      slideId: 'content-rule',
      durationMs: 2000,
      baseRevision: 7,
    });
    expect(document.body.textContent).toContain(MOTION_LABELS.speeds.slow);
    expect(document.body.textContent).toContain(MOTION_LABELS.speeds.fast);
    fireEvent.click(control('motion.transition.applyAll'));
    expect(dispatch).toHaveBeenCalledWith('motion.setTransition', {
      slideId: 'content-rule',
      applyToAll: true,
      baseRevision: 7,
    });
  });

  it('lists the animations in play order with the header label, expands the selected object’s rows and writes the row controls', () => {
    const { dispatch, document: doc } = mount({
      slide: { animations: ANIMATIONS },
      selection: ['h'],
    });
    expect(blockIdsOf(doc)).toContain('h');
    const rows = Array.from(document.querySelectorAll('.ts-motion-row'));
    expect(rows.map((row) => row.getAttribute('data-animation'))).toEqual(['a1', 'a2', 'a3']);
    expect(control('motion.row.a1.toggle').textContent).toContain('Fade in (On click)');
    expect(control('motion.row.a3.toggle').textContent).toContain(
      'Fly out to right (With previous)',
    );
    // the selected object's rows are open, the other closed
    expect(control('motion.row.a1.toggle').getAttribute('aria-expanded')).toBe('true');
    expect(control('motion.row.a2.toggle').getAttribute('aria-expanded')).toBe('false');
    const effect = control('motion.row.a1.effect') as HTMLSelectElement;
    expect(Array.from(effect.options).map((o) => o.textContent)).toEqual([
      ...ANIMATION_LABELS_IN_ORDER,
    ]);
    expect(effect.value).toBe('Fade in');
    fireEvent.change(effect, { target: { value: 'Fly in from top' } });
    expect(dispatch).toHaveBeenCalledWith('motion.update', {
      slideId: 'content-rule',
      animationId: 'a1',
      effect: 'flyIn',
      direction: 'top',
      baseRevision: 7,
    });
    fireEvent.change(control('motion.row.a1.trigger'), { target: { value: 'withPrevious' } });
    expect(dispatch).toHaveBeenCalledWith('motion.update', {
      slideId: 'content-rule',
      animationId: 'a1',
      trigger: 'withPrevious',
      baseRevision: 7,
    });
    // a heading has one paragraph: no By paragraph; the list has items: the checkbox shows once open
    expect(document.querySelector('[data-control="motion.row.a1.byParagraph"]')).toBeNull();
    fireEvent.click(control('motion.row.a2.toggle'));
    const byParagraph = control('motion.row.a2.byParagraph') as HTMLInputElement;
    expect(byParagraph.checked).toBe(true);
    fireEvent.click(byParagraph);
    expect(dispatch).toHaveBeenCalledWith('motion.update', {
      slideId: 'content-rule',
      animationId: 'a2',
      byParagraph: false,
      baseRevision: 7,
    });
    fireEvent.click(control('motion.row.a1.remove'));
    expect(dispatch).toHaveBeenCalledWith('motion.remove', {
      slideId: 'content-rule',
      animationId: 'a1',
      baseRevision: 7,
    });
    expect(document.querySelector('[data-control="motion.row.a1.handle"]')).not.toBeNull();
  });

  it('Alt+Down and Alt+Up on a row header write the whole order', () => {
    const { dispatch } = mount({ slide: { animations: ANIMATIONS } });
    fireEvent.keyDown(control('motion.row.a1.toggle'), { key: 'ArrowDown', altKey: true });
    expect(dispatch).toHaveBeenCalledWith('motion.reorder', {
      slideId: 'content-rule',
      order: ['a2', 'a1', 'a3'],
      baseRevision: 7,
    });
    fireEvent.keyDown(control('motion.row.a3.toggle'), { key: 'ArrowUp', altKey: true });
    expect(dispatch).toHaveBeenCalledWith('motion.reorder', {
      slideId: 'content-rule',
      order: ['a1', 'a3', 'a2'],
      baseRevision: 7,
    });
    // the first row cannot move up, and a plain arrow moves nothing
    dispatch.mockClear();
    fireEvent.keyDown(control('motion.row.a1.toggle'), { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(control('motion.row.a2.toggle'), { key: 'ArrowDown' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Add animation reads Select an object to animate without a selection and writes motion.add with the selected objects', () => {
    const { dispatch } = mount();
    const add = control('motion.add');
    expect(add.textContent).toBe(MOTION_PANEL_TEXT.selectToAnimate);
    expect(add.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(add);
    expect(dispatch).not.toHaveBeenCalled();
    cleanup();
    const selected = mount({ selection: ['h', 'list', 'not-on-the-slide'] });
    const button = control('motion.add');
    expect(button.textContent).toBe(MOTION_PANEL_TEXT.addAnimation);
    fireEvent.click(button);
    expect(selected.dispatch).toHaveBeenCalledWith('motion.add', {
      slideId: 'content-rule',
      blockIds: ['h', 'list'],
      baseRevision: 7,
    });
  });

  it('Play dispatches motion.play and reads Stop while the preview registry says the slide plays', () => {
    const { dispatch } = mount({ slide: { animations: ANIMATIONS } });
    fireEvent.click(control('motion.play'));
    expect(dispatch).toHaveBeenCalledWith('motion.play', { slideId: 'content-rule' });
    act(() =>
      setMotionPreview({
        slideId: 'content-rule',
        step: 0,
        steps: 2,
        running: true,
        waiting: false,
      }),
    );
    expect(control('motion.play').textContent).toContain(MOTION_PANEL_TEXT.stop);
    expect(control('motion.play').getAttribute('aria-pressed')).toBe('true');
    act(() =>
      setMotionPreview({ slideId: 'other', step: 0, steps: 2, running: true, waiting: false }),
    );
    expect(control('motion.play').textContent).toContain(MOTION_PANEL_TEXT.play);
  });

  it('a media block’s row reads Play with the title and offers the start dropdown alone', () => {
    const worked = workedDocument();
    const slide = worked.slides['content-rule']!;
    const withMedia: Partial<Slide> = {
      slots: {
        ...(slide.kind === 'content' ? slide.slots : {}),
        main: [
          ...(slide.kind === 'content' ? (slide.slots.main ?? []) : []),
          {
            id: 'clip',
            type: 'media',
            kind: 'video',
            source: { asset: 'bars' },
            playback: { start: 'auto' },
            alt: 'Colour bars',
          } as never,
        ],
      } as never,
      animations: [
        {
          id: 'a1',
          blockId: 'clip',
          effect: 'playMedia',
          trigger: 'withPrevious',
          durationMs: 500,
        },
      ],
    };
    mount({ slide: withMedia, selection: ['clip'] });
    expect(control('motion.row.a1.toggle').textContent).toContain(
      'Play Colour bars (With previous)',
    );
    expect(document.querySelector('[data-control="motion.row.a1.effect"]')).toBeNull();
    expect(document.querySelector('[data-control="motion.row.a1.trigger"]')).not.toBeNull();
    expect(document.querySelector('[data-control="motion.row.a1.duration"]')).toBeNull();
  });
});
