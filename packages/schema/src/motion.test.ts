// The slide clock's model (HTML-SLIDES-DESIGN 2.2, 2.8): scheduleOf as a table (click, with and
// after with delays, a transition before segment 0, a slide whose first effect waits for a click,
// explicit click times), stateAt per step, the caps and the CSS checks refused with a pointer,
// a dangling effect skipped, and the slide and deck fields read by validateSlide.
import { describe, expect, test } from 'vitest';

import type { Effect } from './motion.ts';
import {
  effectSchema,
  effectsSchema,
  effectsWithCopies,
  effectsWithoutBlocks,
  freeEffectId,
  keyframeValueProblem,
  moveEffect,
  pathCommandCount,
  scheduleOf,
  slideTransition,
  stateAt,
  transitionSchema,
} from './motion.ts';
import { validateSlide } from './validate.ts';

const fx = (
  id: string,
  block: string,
  start: Effect['start'],
  extra: Partial<Effect> = {},
): Effect => ({
  id,
  block,
  role: 'enter',
  motion: { preset: 'fade' },
  start,
  durationMs: 500,
  ...extra,
});

describe('scheduleOf', () => {
  test('click, with and after with delays lay out the rehearsal timeline', () => {
    const schedule = scheduleOf({
      effects: [
        fx('a', 'b1', 'after'),
        fx('b', 'b2', 'with', { delayMs: 100 }),
        fx('c', 'b3', 'click'),
        fx('d', 'b4', 'after', { delayMs: 200, durationMs: 300 }),
        fx('e', 'b5', 'click', { delayMs: 50 }),
      ],
    });
    expect(schedule.steps).toBe(2);
    expect(schedule.effects.map((row) => [row.id, row.step, row.startMs, row.endMs])).toEqual([
      ['a', 0, 0, 500],
      ['b', 0, 100, 600],
      ['c', 1, 600, 1100],
      ['d', 1, 1300, 1600],
      ['e', 2, 1650, 2150],
    ]);
    expect(schedule.segments).toEqual([
      { step: 0, startMs: 0, endMs: 600 },
      { step: 1, startMs: 600, endMs: 1600 },
      { step: 2, startMs: 1600, endMs: 2150 },
    ]);
    expect(schedule.lengthMs).toBe(2150);
  });

  test('a transition comes before segment 0', () => {
    const schedule = scheduleOf(
      { effects: [fx('a', 'b1', 'with')] },
      { transition: { name: 'crossfade', durationMs: 400 } },
    );
    expect(schedule.transitionMs).toBe(400);
    expect(schedule.effects[0]).toMatchObject({ step: 0, startMs: 400, endMs: 900 });
  });

  test('a slide whose first effect waits for a click has an empty segment 0', () => {
    const schedule = scheduleOf({ effects: [fx('a', 'b1', 'click')] });
    expect(schedule.steps).toBe(1);
    expect(schedule.segments[0]).toEqual({ step: 0, startMs: 0, endMs: 0 });
    expect(schedule.effects[0]).toMatchObject({ step: 1, startMs: 0, endMs: 500 });
  });

  test('explicit click times move the segments; an early click never starts before its segment', () => {
    const schedule = scheduleOf(
      { effects: [fx('a', 'b1', 'click'), fx('b', 'b2', 'click')] },
      { clicks: [2000, 2100] },
    );
    expect(schedule.effects.map((row) => row.startMs)).toEqual([2000, 2100]);
  });

  test('a repeated emphasis counts every run; a dangling effect is skipped', () => {
    const schedule = scheduleOf(
      {
        effects: [
          fx('a', 'gone', 'after'),
          fx('b', 'b1', 'after', { role: 'emphasis', motion: { preset: 'pulse' }, repeat: 3 }),
        ],
      },
      { blocks: new Set(['b1']) },
    );
    expect(schedule.effects.map((row) => row.id)).toEqual(['b']);
    expect(schedule.lengthMs).toBe(1500);
  });
});

describe('stateAt', () => {
  test('an enter hides its block until its step, an exit hides it after', () => {
    const schedule = scheduleOf({
      effects: [
        fx('a', 'b1', 'click'),
        fx('b', 'b2', 'click', { role: 'exit' }),
        fx('c', 'b3', 'after', { role: 'emphasis', motion: { preset: 'pulse' } }),
      ],
    });
    expect(stateAt(schedule, 0)).toEqual({ b1: false, b2: true });
    expect(stateAt(schedule, 1)).toEqual({ b1: true, b2: true });
    expect(stateAt(schedule, 2)).toEqual({ b1: true, b2: false });
  });
});

describe('the effect schema', () => {
  test('a valid preset, keyframes and path effect parse', () => {
    for (const motion of [
      { preset: 'rise-in' },
      {
        keyframes: [
          { at: 0, style: { opacity: '0' } },
          { at: 1, style: { opacity: '1' } },
        ],
      },
      { path: 'M 0 0 L 100 0 Q 150 50 200 0', rotate: true },
    ])
      expect(effectSchema.safeParse({ ...fx('a', 'b1', 'click'), motion }).success).toBe(true);
  });

  test('the caps and the CSS checks are refused with a pointer', () => {
    const pointers = (value: unknown): string[] => {
      const parsed = effectsSchema.safeParse(value);
      expect(parsed.success).toBe(false);
      return parsed.error?.issues.map((row) => row.path.join('/')) ?? [];
    };
    expect(pointers([fx('a', 'b1', 'click', { durationMs: 0 })])).toContain('0/durationMs');
    expect(pointers([fx('a', 'b1', 'click'), fx('a', 'b2', 'click')])).toContain('1/id');
    expect(
      pointers([
        {
          ...fx('c', 'b1', 'click'),
          motion: {
            keyframes: [
              { at: 0.5, style: { opacity: '0' } },
              { at: 0.2, style: { opacity: '1' } },
            ],
          },
        },
      ]),
    ).toContain('0/motion/keyframes/1/at');
    expect(
      pointers([
        {
          ...fx('c', 'b1', 'click'),
          motion: {
            keyframes: [
              { at: 0, style: { position: 'fixed' } },
              { at: 1, style: { background: 'url(https://evil.example/x.png)' } },
            ],
          },
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        '0/motion/keyframes/0/style/position',
        '0/motion/keyframes/1/style/background',
      ]),
    );
    expect(
      pointers([{ ...fx('d', 'b1', 'click'), motion: { path: 'M 0 0 A 10 10 0 0 1 20 20' } }]),
    ).toContain('0/motion/path');
    expect(pointers([{ ...fx('e', 'b1', 'click'), motion: { preset: 'pulse' } }])).toContain('0');
    expect(
      pointers(Array.from({ length: 201 }, (_, n) => fx(`fx-${n + 1}`, 'b1', 'after'))),
    ).toContain('');
  });

  test('keyframe values stay inside the block', () => {
    expect(keyframeValueProblem('opacity', '0.5')).toBeNull();
    expect(keyframeValueProblem('background', 'url(assets/a.png)')).toBeNull();
    expect(keyframeValueProblem('color', 'red; position: fixed')).not.toBeNull();
    expect(keyframeValueProblem('width', 'expression(alert(1))')).not.toBeNull();
    expect(keyframeValueProblem('content', '"</style><script>"')).not.toBeNull();
    expect(keyframeValueProblem('background', "url('//evil.example')")).not.toBeNull();
  });

  test('a path counts its commands and refuses arcs', () => {
    expect(pathCommandCount('M0 0 L10 10 C 1 2 3 4 5 6 Z')).toBe(4);
    expect(pathCommandCount('M0 0 A 1 1 0 0 1 2 2')).toBeNull();
    expect(pathCommandCount('L0 0')).toBeNull();
  });

  test('a transition is 0 to 3000 ms', () => {
    expect(transitionSchema.safeParse({ name: 'crossfade', durationMs: 400 }).success).toBe(true);
    expect(transitionSchema.safeParse({ name: 'crossfade', durationMs: 4000 }).success).toBe(false);
    expect(transitionSchema.safeParse({ name: 'morph-fade', durationMs: 400 }).success).toBe(false);
  });
});

describe('the edits the actions make', () => {
  test('ids, moves, removals and copies', () => {
    const effects = [fx('fx-1', 'b1', 'click'), fx('fx-2', 'b2', 'after')];
    expect(freeEffectId(effects)).toBe('fx-3');
    expect(moveEffect(effects, 'fx-2', 0).map((row) => row.id)).toEqual(['fx-2', 'fx-1']);
    expect(effectsWithoutBlocks(effects, new Set(['b1'])).map((row) => row.id)).toEqual(['fx-2']);
    const copied = effectsWithCopies(effects, new Map([['b1', 'b1-2']]));
    expect(copied.map((row) => [row.id, row.block])).toEqual([
      ['fx-1', 'b1'],
      ['fx-2', 'b2'],
      ['fx-3', 'b1-2'],
    ]);
  });

  test('a slide transition falls back to the deck', () => {
    const deck = { transition: { name: 'crossfade' as const, durationMs: 300 } };
    expect(slideTransition(deck, {})).toEqual(deck.transition);
    expect(slideTransition(deck, { transition: { name: 'none', durationMs: 0 } })).toEqual({
      name: 'none',
      durationMs: 0,
    });
  });
});

describe('validateSlide reads the slide clock fields', () => {
  const slide = {
    schemaVersion: 1,
    id: 'motion',
    kind: 'content',
    layout: { type: 'cols', ratio: '1/1' },
    slots: {
      main: [
        { id: 'h', type: 'heading', level: 'h2', text: 'Three points' },
        { id: 'rule', type: 'rule', orientation: 'horizontal' },
      ],
    },
  };

  test('a slide without motion validates unchanged', () => {
    const result = validateSlide(slide);
    expect(result.ok).toBe(true);
    expect(result.slide).not.toHaveProperty('effects');
  });

  test('effects, a transition and an advance validate; a dangling effect is no issue', () => {
    const result = validateSlide({
      ...slide,
      effects: [fx('fx-1', 'h', 'click'), fx('fx-2', 'gone', 'after')],
      transition: { name: 'slide-fade', durationMs: 400, from: 'right' },
      advance: { afterMs: 3000 },
    });
    expect(result.ok).toBe(true);
    expect(result.issues.filter((row) => row.code === 'motion')).toEqual([]);
  });

  test('a split on a block without text is refused', () => {
    const result = validateSlide({
      ...slide,
      effects: [{ ...fx('fx-1', 'rule', 'click'), motion: { preset: 'word-rise' } }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'motion', pointer: '/effects/0' });
  });
});
