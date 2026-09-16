import { describe, expect, it } from 'vitest';

import type { MotionSchedule } from '@turboslide/schema/motion';
import { MOTION_ATTRS, MOTION_CLASSES } from '@turboslide/schema/motion';

import type { LayerElement, LayerTimers } from '../motionLayer';
import {
  attachMotionLayer,
  hiddenAfter,
  paragraphBlocks,
  playTransition,
  scheduledParagraphs,
  stepPlay,
  unitKey,
} from '../motionLayer';

// The present layer's state over a hand built schedule (gslides-parity SPEC-5 2.2, 0.10): the
// units hidden after each step, what a step plays, and the classes and attributes the layer
// writes on a fake element tree in Node (MILESTONES-5 B1 day 4).

type Fake = LayerElement & {
  attrs: Map<string, string>;
  classes: Set<string>;
  kids: Fake[];
  parent: Fake | null;
};

function el(tag: string, attrs: Record<string, string> = {}, kids: Fake[] = []): Fake {
  const node: Fake = {
    tagName: tag.toUpperCase(),
    attrs: new Map(Object.entries(attrs)),
    classes: new Set((attrs.class ?? '').split(/\s+/).filter(Boolean)),
    kids,
    parent: null,
    get children() {
      return this.kids;
    },
    classList: {
      add: (...names) => names.forEach((n) => node.classes.add(n)),
      remove: (...names) => names.forEach((n) => node.classes.delete(n)),
      contains: (n) => node.classes.has(n),
    },
    querySelector: (sel) => node.querySelectorAll(sel)[0] ?? null,
    querySelectorAll: (sel) => {
      const out: Fake[] = [];
      const attr = /^\[([a-z-]+)="([^"]*)"\]$/.exec(sel);
      const cls = /^\.([a-z-]+)$/.exec(sel);
      const walk = (n: Fake) => {
        for (const kid of n.kids) {
          if (attr && kid.attrs.get(attr[1]!) === attr[2]) out.push(kid);
          if (cls && kid.classes.has(cls[1]!)) out.push(kid);
          walk(kid);
        }
      };
      walk(node);
      return out;
    },
    setAttribute: (name, value) => {
      node.attrs.set(name, value);
    },
    removeAttribute: (name) => {
      node.attrs.delete(name);
    },
    getAttribute: (name) => node.attrs.get(name) ?? null,
  };
  for (const kid of kids) kid.parent = node;
  return node;
}

function fakeTimers(): LayerTimers & { fire(): void; pending: number } {
  const queue = new Map<number, () => void>();
  let next = 1;
  return {
    set(callback) {
      const id = next;
      next += 1;
      queue.set(id, callback);
      return id;
    },
    clear(id) {
      queue.delete(id);
    },
    fire() {
      const jobs = [...queue.values()];
      queue.clear();
      for (const job of jobs) job();
    },
    get pending() {
      return queue.size;
    },
  };
}

const anim = (
  id: string,
  blockId: string,
  effect: MotionSchedule['steps'][number]['effects'][number]['animation']['effect'],
  trigger: 'click' | 'afterPrevious' | 'withPrevious' = 'click',
) => ({ id, blockId, effect, trigger, durationMs: 500 });

/** A heading that flies in on entry, a three paragraph text By paragraph on clicks, then the text disappears, then a spin. */
const SCHEDULE: MotionSchedule = {
  slideId: 's',
  hiddenAtStart: ['h', 'para'],
  transition: { kind: 'fade', durationMs: 400 },
  skipped: [],
  steps: [
    {
      durationMs: 600,
      effects: [
        { animation: anim('a0', 'h', 'flyIn', 'withPrevious'), delayMs: 0, durationMs: 600 },
      ],
    },
    {
      durationMs: 500,
      effects: [
        { animation: anim('a1', 'para', 'fadeIn'), delayMs: 0, durationMs: 500, paragraph: 0 },
      ],
    },
    {
      durationMs: 500,
      effects: [
        { animation: anim('a1', 'para', 'fadeIn'), delayMs: 0, durationMs: 500, paragraph: 1 },
      ],
    },
    {
      durationMs: 500,
      effects: [
        { animation: anim('a1', 'para', 'fadeIn'), delayMs: 0, durationMs: 500, paragraph: 2 },
      ],
    },
    {
      durationMs: 1,
      effects: [
        { animation: anim('a2', 'para', 'disappear'), delayMs: 0, durationMs: 1 },
        {
          animation: anim('a3', 'clip', 'playMedia', 'withPrevious'),
          delayMs: 0,
          durationMs: 1000,
        },
      ],
    },
    {
      durationMs: 2000,
      effects: [{ animation: anim('a4', 'h', 'spin'), delayMs: 0, durationMs: 2000 }],
    },
  ],
};

function tree(): { root: Fake; h: Fake; para: Fake; p: Fake[] } {
  const p = [
    el('span', { class: 'para' }),
    el('span', { class: 'para' }),
    el('span', { class: 'para' }),
  ];
  const h = el('h2', { 'data-block': 'h' });
  const para = el('p', { 'data-block': 'para' }, p);
  const clip = el('div', { 'data-block': 'clip' });
  const root = el('section', { 'data-slide': 's', class: 'slide' }, [h, para, clip]);
  return { root, h, para, p };
}

describe('hiddenAfter', () => {
  it('hides the entrance blocks at the mount, paragraph by paragraph for a By paragraph block', () => {
    expect([...hiddenAfter(SCHEDULE, -1)].sort()).toEqual(['h', 'para/0', 'para/1', 'para/2']);
    expect(paragraphBlocks(SCHEDULE)).toEqual(new Set(['para']));
    expect(scheduledParagraphs(SCHEDULE, 'para')).toBe(3);
    expect(scheduledParagraphs(SCHEDULE, 'h')).toBe(0);
  });

  it('takes the rendered paragraph count when it is larger than the scheduled one', () => {
    expect([...hiddenAfter(SCHEDULE, -1, () => 4)].sort()).toEqual([
      'h',
      'para/0',
      'para/1',
      'para/2',
      'para/3',
    ]);
  });

  it('shows the units their entrance step played and hides the exits after theirs', () => {
    expect([...hiddenAfter(SCHEDULE, 0)].sort()).toEqual(['para/0', 'para/1', 'para/2']);
    expect([...hiddenAfter(SCHEDULE, 1)].sort()).toEqual(['para/1', 'para/2']);
    expect([...hiddenAfter(SCHEDULE, 3)]).toEqual([]);
    // the whole block Disappear hides the root; the paragraphs stay shown under it
    expect([...hiddenAfter(SCHEDULE, 4)]).toEqual(['para']);
    // Spin changes nothing; a step past the end reads as the last
    expect([...hiddenAfter(SCHEDULE, 5)]).toEqual(['para']);
    expect([...hiddenAfter(SCHEDULE, 99)]).toEqual(['para']);
  });

  it('a whole block entrance shows every paragraph of a block that plays By paragraph', () => {
    const schedule: MotionSchedule = {
      ...SCHEDULE,
      steps: [
        { durationMs: 0, effects: [] },
        {
          durationMs: 1,
          effects: [{ animation: anim('b', 'para', 'appear'), delayMs: 0, durationMs: 1 }],
        },
      ],
    };
    // hiddenAtStart spreads over the paragraphs the other steps addressed; none here, so the block
    expect([...hiddenAfter(schedule, -1)].sort()).toEqual(['h', 'para']);
    expect([...hiddenAfter(schedule, 1)]).toEqual(['h']);
  });
});

describe('stepPlay', () => {
  it('groups a step by class and lists its media calls', () => {
    expect(stepPlay(SCHEDULE, 0)).toEqual({
      entering: ['h'],
      leaving: [],
      emphasis: [],
      media: [],
      durationMs: 600,
    });
    expect(stepPlay(SCHEDULE, 4)).toEqual({
      entering: [],
      leaving: ['para'],
      emphasis: [],
      media: [{ blockId: 'clip', delayMs: 0, durationMs: 1000 }],
      durationMs: 1,
    });
    expect(stepPlay(SCHEDULE, 5).emphasis).toEqual(['h']);
    expect(stepPlay(SCHEDULE, 9)).toEqual({
      entering: [],
      leaving: [],
      emphasis: [],
      media: [],
      durationMs: 0,
    });
    expect(unitKey('para', 2)).toBe('para/2');
    expect(unitKey('para')).toBe('para');
  });
});

describe('attachMotionLayer', () => {
  it('stamps the paragraphs, hides the start set and sets data-step 0 at the mount', () => {
    const { root, h, para, p } = tree();
    const layer = attachMotionLayer(root, SCHEDULE, { reduced: false, timers: fakeTimers() });
    layer.mount();
    expect(root.getAttribute(MOTION_ATTRS.step)).toBe('0');
    expect(layer.step).toBe(-1);
    expect(p.map((node) => node.getAttribute(MOTION_ATTRS.paragraph))).toEqual(['0', '1', '2']);
    expect(h.classes.has(MOTION_CLASSES.hidden)).toBe(true);
    expect(para.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    expect(p.every((node) => node.classes.has(MOTION_CLASSES.hidden))).toBe(true);
  });

  it('plays a step with its classes and settles after the duration', () => {
    const { root, h, p } = tree();
    const timers = fakeTimers();
    const played: string[] = [];
    const settled: number[] = [];
    const layer = attachMotionLayer(root, SCHEDULE, {
      reduced: false,
      timers,
      onSettled: (step) => settled.push(step),
      media: {
        mount: () => undefined,
        unmount: () => undefined,
        play: (id) => {
          played.push(id);
        },
        pause: () => undefined,
        restart: () => undefined,
        onState: () => () => undefined,
      },
    });
    layer.mount();
    expect(layer.play(0)).toBe(600);
    expect(root.getAttribute(MOTION_ATTRS.step)).toBe('0');
    expect(h.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    expect(h.classes.has(MOTION_CLASSES.entering)).toBe(true);
    expect(layer.playing).toBe(true);
    timers.fire();
    expect(h.classes.has(MOTION_CLASSES.entering)).toBe(false);
    expect(layer.playing).toBe(false);
    expect(settled).toEqual([0]);

    expect(layer.play(1)).toBe(500);
    expect(root.getAttribute(MOTION_ATTRS.step)).toBe('1');
    expect(p[0]!.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    expect(p[0]!.classes.has(MOTION_CLASSES.entering)).toBe(true);
    expect(p[1]!.classes.has(MOTION_CLASSES.hidden)).toBe(true);
    timers.fire();
    // a second play before the first settled settles it first
    layer.play(2);
    expect(p[1]!.classes.has(MOTION_CLASSES.entering)).toBe(true);
    layer.play(3);
    expect(p[1]!.classes.has(MOTION_CLASSES.entering)).toBe(false);
    expect(p[1]!.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    timers.fire();

    // the exit step: is-leaving during, is-hidden after; the Play effect reaches the controller
    layer.play(4);
    const para = root.querySelector('[data-block="para"]') as Fake;
    expect(para.classes.has(MOTION_CLASSES.leaving)).toBe(true);
    expect(played).toEqual(['clip']);
    timers.fire();
    expect(para.classes.has(MOTION_CLASSES.leaving)).toBe(false);
    expect(para.classes.has(MOTION_CLASSES.hidden)).toBe(true);

    layer.play(5);
    expect(h.classes.has(MOTION_CLASSES.emphasis)).toBe(true);
    layer.settle();
    expect(h.classes.has(MOTION_CLASSES.emphasis)).toBe(false);
    expect(timers.pending).toBe(0);
  });

  it('seeks to a state without animation and rewinds by seeking back', () => {
    const { root, h, para, p } = tree();
    const timers = fakeTimers();
    const layer = attachMotionLayer(root, SCHEDULE, { reduced: false, timers });
    layer.mount();
    layer.seek(4);
    expect(root.getAttribute(MOTION_ATTRS.step)).toBe('4');
    expect(h.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    expect(h.classes.has(MOTION_CLASSES.entering)).toBe(false);
    expect(para.classes.has(MOTION_CLASSES.hidden)).toBe(true);
    expect(timers.pending).toBe(0);
    // back one step: the text is shown again, its third paragraph included
    layer.seek(3);
    expect(para.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    expect(p.every((node) => !node.classes.has(MOTION_CLASSES.hidden))).toBe(true);
    // back to the mount state
    layer.seek(-1);
    expect(root.getAttribute(MOTION_ATTRS.step)).toBe('0');
    expect(h.classes.has(MOTION_CLASSES.hidden)).toBe(true);
    expect(p.every((node) => node.classes.has(MOTION_CLASSES.hidden))).toBe(true);
  });

  it('under reduced motion a step settles at once with no transient class', () => {
    const { root, h } = tree();
    const timers = fakeTimers();
    const layer = attachMotionLayer(root, SCHEDULE, { reduced: true, timers });
    layer.mount();
    expect(layer.play(0)).toBe(0);
    expect(h.classes.has(MOTION_CLASSES.hidden)).toBe(false);
    expect(h.classes.has(MOTION_CLASSES.entering)).toBe(false);
    expect(timers.pending).toBe(0);
  });

  it('unmount removes every class and attribute it wrote', () => {
    const { root, h, p } = tree();
    const timers = fakeTimers();
    const layer = attachMotionLayer(root, SCHEDULE, { reduced: false, timers });
    layer.mount();
    layer.play(1);
    layer.unmount();
    expect(root.getAttribute(MOTION_ATTRS.step)).toBeNull();
    expect(h.classes.size).toBe(0);
    expect(p.every((node) => node.classes.size === 1 && node.classes.has('para'))).toBe(true);
    expect(p.every((node) => node.getAttribute(MOTION_ATTRS.paragraph) === null)).toBe(true);
    expect(timers.pending).toBe(0);
  });
});

describe('playTransition', () => {
  it('marks the container and the two roots for the duration, reversed when going back', () => {
    const timers = fakeTimers();
    const incoming = el('section', { 'data-slide': 'b' });
    const outgoing = el('section', { 'data-slide': 'a' });
    const container = el('div', {}, [outgoing, incoming]);
    let done = 0;
    const run = playTransition(
      container,
      incoming,
      outgoing,
      { kind: 'cube', durationMs: 700 },
      {
        scopeSlideId: 'b',
        timers,
        reduced: false,
        onDone: () => {
          done += 1;
        },
      },
    );
    expect(run.durationMs).toBe(700);
    expect(container.getAttribute(MOTION_ATTRS.transition)).toBe('b');
    expect(container.getAttribute(MOTION_ATTRS.reverse)).toBeNull();
    expect(incoming.classes.has(MOTION_CLASSES.entering)).toBe(true);
    expect(outgoing.classes.has(MOTION_CLASSES.leaving)).toBe(true);
    timers.fire();
    expect(done).toBe(1);
    expect(container.getAttribute(MOTION_ATTRS.transition)).toBeNull();
    expect(incoming.classes.size).toBe(0);
    expect(outgoing.classes.size).toBe(0);

    const back = playTransition(
      container,
      outgoing,
      incoming,
      { kind: 'fade', durationMs: 300 },
      {
        scopeSlideId: 'b',
        reverse: true,
        timers,
        reduced: false,
      },
    );
    expect(container.getAttribute(MOTION_ATTRS.reverse)).toBe('');
    back.cancel();
    expect(container.getAttribute(MOTION_ATTRS.reverse)).toBeNull();
    expect(timers.pending).toBe(0);
  });

  it('a None transition or reduced motion finishes at once', () => {
    const timers = fakeTimers();
    const incoming = el('section', { 'data-slide': 'b' });
    const container = el('div', {}, [incoming]);
    let done = 0;
    const none = playTransition(container, incoming, null, null, {
      scopeSlideId: 'b',
      timers,
      onDone: () => {
        done += 1;
      },
    });
    expect(none.durationMs).toBe(0);
    expect(done).toBe(1);
    const reduced = playTransition(
      container,
      incoming,
      null,
      { kind: 'flip', durationMs: 500 },
      {
        scopeSlideId: 'b',
        timers,
        reduced: true,
        onDone: () => {
          done += 1;
        },
      },
    );
    expect(reduced.durationMs).toBe(0);
    expect(done).toBe(2);
    expect(container.getAttribute(MOTION_ATTRS.transition)).toBeNull();
    expect(timers.pending).toBe(0);
  });
});
