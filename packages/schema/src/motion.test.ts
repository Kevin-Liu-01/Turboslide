// The motion record (gslides-parity SPEC-5 1.3, 0.8, 0.11): the constants and Google's labels in
// Google's order, the schemas' bounds, the schedule schema, the paragraph carriers and their
// counts, the next free id, and `normalizeMotion` dropping the rows whose block is gone and
// nothing else (MILESTONES-5 B1 day 1).
import { describe, expect, it } from 'vitest';

import type { Block } from './blocks.ts';
import type { ContentSlide, Slide } from './deck.ts';
import { FREEFORM_SLIDE, OPENER_BRAND, THESIS } from './fixtures.ts';
import {
  ANIMATIONS_MAX,
  ANIMATION_CHOICES_IN_ORDER,
  ANIMATION_EFFECTS,
  ANIMATION_LABELS_IN_ORDER,
  ANIMATION_TRIGGERS,
  DURATION_MS,
  ENTRANCE_EFFECTS,
  EXIT_EFFECTS,
  FLY_DIRECTIONS,
  MOTION_ATTRS,
  MOTION_CLASSES,
  MOTION_LABELS,
  PARAGRAPH_CARRIER_TYPES,
  SWITCH_MS,
  TRANSITION_KINDS,
  animationLabel,
  animationSchema,
  animationsSchema,
  blockParagraphCount,
  effectClass,
  effectiveTransition,
  emptySchedule,
  motionScheduleSchema,
  motionTargets,
  nextAnimationId,
  normalizeMotion,
  slideHasMotion,
  transitionSchema,
} from './motion.ts';
import type { Animation } from './motion.ts';

const row = (extra: Partial<Animation> = {}): Animation => ({
  id: 'a1',
  blockId: 'p1',
  effect: 'appear',
  trigger: 'click',
  durationMs: 500,
  ...extra,
});

describe('the constants and labels (SPEC-5 1.3)', () => {
  it('names the eight transitions, the ten effects, the three triggers and the four directions', () => {
    expect(TRANSITION_KINDS).toHaveLength(8);
    expect(ANIMATION_EFFECTS).toHaveLength(10);
    expect(ANIMATION_TRIGGERS).toEqual(['click', 'afterPrevious', 'withPrevious']);
    expect(FLY_DIRECTIONS).toEqual(['left', 'right', 'top', 'bottom']);
  });

  it('prints the fifteen panel labels in Google’s order', () => {
    expect(ANIMATION_LABELS_IN_ORDER).toEqual([
      'Appear',
      'Disappear',
      'Fade in',
      'Fade out',
      'Fly in from left',
      'Fly in from right',
      'Fly in from bottom',
      'Fly in from top',
      'Fly out to left',
      'Fly out to right',
      'Fly out to bottom',
      'Fly out to top',
      'Zoom in',
      'Zoom out',
      'Spin',
    ]);
    expect(ANIMATION_CHOICES_IN_ORDER.map((choice) => animationLabel(choice))).toEqual(
      ANIMATION_LABELS_IN_ORDER,
    );
    expect(MOTION_LABELS.transitions).toEqual({
      none: 'None',
      dissolve: 'Dissolve',
      fade: 'Fade',
      slideRight: 'Slide from right',
      slideLeft: 'Slide from left',
      flip: 'Flip',
      cube: 'Cube',
      gallery: 'Gallery',
    });
    expect(MOTION_LABELS.triggers).toEqual({
      click: 'On click',
      afterPrevious: 'After previous',
      withPrevious: 'With previous',
    });
    expect(animationLabel({ effect: 'playMedia' })).toBe('Play');
    expect(animationLabel({ effect: 'flyIn' })).toBe('Fly in');
  });

  it('classes every effect as an entrance, an exit, an emphasis or a media effect (SPEC-5 0.10)', () => {
    expect([...ENTRANCE_EFFECTS]).toEqual(['appear', 'fadeIn', 'flyIn', 'zoomIn']);
    expect([...EXIT_EFFECTS]).toEqual(['disappear', 'fadeOut', 'flyOut', 'zoomOut']);
    expect(effectClass('spin')).toBe('emphasis');
    expect(effectClass('playMedia')).toBe('media');
    for (const effect of ANIMATION_EFFECTS) expect(effectClass(effect)).toBeTruthy();
  });

  it('keeps the duration stops and the defaults of SPEC-5 0.11', () => {
    expect(DURATION_MS).toEqual({
      min: 100,
      max: 5000,
      slow: 2000,
      medium: 1000,
      fast: 500,
      defaultAnimation: 500,
      defaultTransition: 500,
    });
    expect(SWITCH_MS).toBe(1);
    expect(ANIMATIONS_MAX).toBe(200);
  });

  it('names the show’s attributes and classes (SPEC-5 1.5, 2.2)', () => {
    expect(MOTION_ATTRS.block).toBe('data-block');
    expect(MOTION_ATTRS.step).toBe('data-step');
    expect(MOTION_ATTRS.motion).toBe('data-motion');
    expect(MOTION_CLASSES).toEqual({
      hidden: 'is-hidden',
      entering: 'is-entering',
      leaving: 'is-leaving',
      emphasis: 'is-emph',
    });
  });
});

describe('the schemas', () => {
  it('bounds a duration to 100 to 5000 whole milliseconds', () => {
    expect(transitionSchema.safeParse({ kind: 'fade', durationMs: 100 }).success).toBe(true);
    expect(transitionSchema.safeParse({ kind: 'fade', durationMs: 5000 }).success).toBe(true);
    expect(transitionSchema.safeParse({ kind: 'fade', durationMs: 99 }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'fade', durationMs: 5001 }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'fade', durationMs: 500.5 }).success).toBe(false);
    expect(transitionSchema.safeParse({ kind: 'wipe', durationMs: 500 }).success).toBe(false);
  });

  it('parses a row and refuses an unknown field, a bad id or a false byParagraph', () => {
    expect(animationSchema.safeParse(row()).success).toBe(true);
    expect(
      animationSchema.safeParse(row({ effect: 'flyIn', direction: 'left', byParagraph: true }))
        .success,
    ).toBe(true);
    expect(animationSchema.safeParse({ ...row(), extra: 1 }).success).toBe(false);
    expect(animationSchema.safeParse(row({ id: 'A1' })).success).toBe(false);
    expect(animationSchema.safeParse(row({ id: '1a' })).success).toBe(false);
    expect(
      animationSchema.safeParse({ ...row(), byParagraph: false } as unknown as Animation).success,
    ).toBe(false);
  });

  it('caps a slide’s list at 200 rows', () => {
    const rows = Array.from({ length: ANIMATIONS_MAX }, (_row, i) => row({ id: `a${i + 1}` }));
    expect(animationsSchema.safeParse(rows).success).toBe(true);
    expect(animationsSchema.safeParse([...rows, row({ id: 'more' })]).success).toBe(false);
  });

  it('parses the empty schedule and a schedule with an effect', () => {
    const empty = emptySchedule('s1', undefined);
    expect(empty).toEqual({
      slideId: 's1',
      steps: [],
      hiddenAtStart: [],
      transition: null,
      skipped: [],
    });
    expect(motionScheduleSchema.safeParse(empty).success).toBe(true);
    const filled = {
      ...emptySchedule('s1', { kind: 'fade', durationMs: 500 }),
      steps: [
        { effects: [], durationMs: 0 },
        {
          effects: [
            {
              animation: row(),
              delayMs: 0,
              durationMs: 1,
              paragraph: 0,
              box: [137, 129, 400, 200],
            },
          ],
          durationMs: 1,
        },
      ],
      hiddenAtStart: ['p1'],
    };
    expect(motionScheduleSchema.safeParse(filled).success).toBe(true);
    expect(filled.transition).toEqual({ kind: 'fade', durationMs: 500 });
  });

  it('treats a None transition as absent (SPEC-5 2.1)', () => {
    expect(effectiveTransition({ kind: 'none', durationMs: 500 })).toBeNull();
    expect(effectiveTransition(undefined)).toBeNull();
    expect(effectiveTransition({ kind: 'cube', durationMs: 999 })).toEqual({
      kind: 'cube',
      durationMs: 999,
    });
    expect(emptySchedule('s1', { kind: 'none', durationMs: 500 }).transition).toBeNull();
  });

  it('tells a slide with motion from one without (SPEC-5 0.3)', () => {
    expect(slideHasMotion({})).toBe(false);
    expect(slideHasMotion({ transition: { kind: 'none', durationMs: 500 } })).toBe(false);
    expect(slideHasMotion({ animations: [] })).toBe(false);
    expect(slideHasMotion({ transition: { kind: 'fade', durationMs: 500 } })).toBe(true);
    expect(slideHasMotion({ animations: [row()] })).toBe(true);
  });
});

describe('the paragraph carriers (SPEC-5 2.1)', () => {
  it('lists the seven carrier types', () => {
    expect([...PARAGRAPH_CARRIER_TYPES].sort()).toEqual(
      ['box', 'paragraph', 'plain', 'refs', 'rows', 'shape', 'text'].sort(),
    );
  });

  it('counts the paragraphs of a Text and the items of a list, 0 elsewhere', () => {
    const cases: [Block, number][] = [
      [{ id: 'p', type: 'paragraph', text: 'One.\nTwo.\nThree.' }, 3],
      [{ id: 'p', type: 'paragraph', text: 'One.' }, 1],
      [{ id: 'p', type: 'paragraph', text: '' }, 0],
      [{ id: 't', type: 'text', text: 'A\nB' }, 2],
      [{ id: 'b', type: 'box', text: 'A\nB\nC\nD' }, 4],
      [{ id: 'b', type: 'box' }, 0],
      [{ id: 's', type: 'shape', shape: 'rect', text: 'A' }, 1],
      [{ id: 's', type: 'shape', shape: 'rect' }, 0],
      [{ id: 'l', type: 'plain', items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }, 3],
      [{ id: 'r', type: 'refs', items: ['a', 'b'] }, 2],
      [{ id: 'k', type: 'rows', key: 240, items: [{ key: 'k', value: 'v' }] }, 1],
      [{ id: 'h', type: 'heading', level: 'h2', text: 'A\nB' }, 0],
      [{ id: 'i', type: 'icon', name: 'sparkles' }, 0],
    ];
    for (const [block, count] of cases) expect(blockParagraphCount(block)).toBe(count);
  });
});

describe('nextAnimationId', () => {
  it('answers a1 on an empty list and the first gap otherwise', () => {
    expect(nextAnimationId([])).toBe('a1');
    expect(nextAnimationId([{ id: 'a1' }, { id: 'a2' }])).toBe('a3');
    expect(nextAnimationId([{ id: 'a1' }, { id: 'a3' }])).toBe('a2');
    expect(nextAnimationId([{ id: 'intro' }])).toBe('a1');
  });
});

describe('normalizeMotion (SPEC-5 0.8)', () => {
  const free = (): ContentSlide => JSON.parse(JSON.stringify(FREEFORM_SLIDE)) as ContentSlide;

  it('lists the top level blocks of every slide kind as the targets', () => {
    expect(motionTargets(FREEFORM_SLIDE).map((block) => block.id)).toEqual([
      'h',
      'p1',
      'box',
      'arrow',
      'rule',
      'ic',
    ]);
    expect(motionTargets(OPENER_BRAND).length).toBeGreaterThan(0);
    expect(motionTargets(THESIS)).toEqual([]);
  });

  it('returns the same slide when every row names a block that exists', () => {
    const slide: Slide = { ...free(), animations: [row(), row({ id: 'a2', blockId: 'box' })] };
    expect(normalizeMotion(slide)).toBe(slide);
    const plain = free();
    expect(normalizeMotion(plain)).toBe(plain);
  });

  it('drops the rows whose block is gone and keeps the order of the rest', () => {
    const slide: Slide = {
      ...free(),
      animations: [
        row({ id: 'a1', blockId: 'p1' }),
        row({ id: 'a2', blockId: 'gone' }),
        row({ id: 'a3', blockId: 'box' }),
      ],
    };
    const next = normalizeMotion(slide);
    expect(next).not.toBe(slide);
    expect(next.animations?.map((animation) => animation.id)).toEqual(['a1', 'a3']);
    expect(slide.animations).toHaveLength(3);
  });

  it('removes an emptied list rather than leaving []', () => {
    const slide: Slide = { ...free(), animations: [row({ blockId: 'gone' })] };
    const next = normalizeMotion(slide);
    expect('animations' in next).toBe(false);
    expect(next.transition).toBeUndefined();
  });

  it('drops every row on a statement slide, whose big text is a slide field and not a block', () => {
    const slide: Slide = { ...THESIS, animations: [row({ blockId: 'big' })] };
    expect('animations' in normalizeMotion(slide)).toBe(false);
  });
});
