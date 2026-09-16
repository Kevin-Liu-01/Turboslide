import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import type { Animation, MotionSchedule } from '@turboslide/schema/motion';
import { openFileStore } from '@turboslide/store/file-store';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { LaneDeps } from './deps.ts';
import { registerMotionActions, settleAnimation } from './motion.ts';

// The six motion actions through the dispatcher over a scratch copy of decks/fixture/motion
// (gslides-parity SPEC-5 2.5, 13; MILESTONES-5 B1 day 3): every input validated by the action's
// schema and every output by its output schema, one commit per action, the reducer's
// normalisation on the list, the refusals with their sentences, and motion.compile agreeing with
// the render package's schedule for the fixture.

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE = join(REPO, 'decks/fixture/motion');
const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

let dir: string;
let deps: LaneDeps;

function dispatcherWith(lane: LaneDeps) {
  const dispatcher = createDispatcher();
  registerMotionActions(dispatcher, lane);
  return dispatcher;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-motion-actions-'));
  cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
  cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
  deps = { store: openFileStore({ dir }) } as unknown as LaneDeps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function revision(): Promise<number> {
  return deps.store.revision();
}

describe('motion.setTransition', () => {
  test('writes the kind and the duration as one slide.set, keeps what is absent, None reads null', async () => {
    const dispatcher = dispatcherWith(deps);
    const first = (await dispatcher.dispatch(
      'motion.setTransition',
      { slideId: 't-none', kind: 'fade', baseRevision: await revision() },
      context,
    )) as { slideIds: string[]; transition: unknown; revision: number };
    expect(first.slideIds).toEqual(['t-none']);
    expect(first.transition).toEqual({ kind: 'fade', durationMs: 500 });
    const second = (await dispatcher.dispatch(
      'motion.setTransition',
      { slideId: 't-none', durationMs: 1200, baseRevision: first.revision },
      context,
    )) as { transition: unknown; revision: number };
    expect(second.transition).toEqual({ kind: 'fade', durationMs: 1200 });
    const none = (await dispatcher.dispatch(
      'motion.setTransition',
      { slideId: 't-none', kind: 'none', baseRevision: second.revision },
      context,
    )) as { transition: unknown; revision: number };
    expect(none.transition).toBeNull();
    const { document } = await deps.store.read();
    expect(document.slides['t-none']?.transition).toEqual({ kind: 'none', durationMs: 1200 });
    expect(none.revision).toBe(first.revision + 2);
  });

  test('applyToAll writes every slide in one commit', async () => {
    const dispatcher = dispatcherWith(deps);
    const before = await revision();
    const out = (await dispatcher.dispatch(
      'motion.setTransition',
      {
        slideId: 't-cube',
        kind: 'dissolve',
        durationMs: 700,
        applyToAll: true,
        baseRevision: before,
      },
      context,
    )) as { slideIds: string[]; revision: number };
    expect(out.slideIds).toHaveLength(11);
    expect(out.revision).toBe(before + 1);
    const { document } = await deps.store.read();
    for (const slide of Object.values(document.slides))
      expect(slide.transition).toEqual({ kind: 'dissolve', durationMs: 700 });
    const versions = await deps.store.listVersions();
    expect(versions.length).toBe(1);
  });

  test('refuses an unknown slide, an unknown kind and a stale base', async () => {
    const dispatcher = dispatcherWith(deps);
    const base = await revision();
    await expect(
      dispatcher.dispatch(
        'motion.setTransition',
        { slideId: 'nope', kind: 'fade', baseRevision: base },
        context,
      ),
    ).rejects.toThrow(RangeError);
    await expect(
      dispatcher.dispatch(
        'motion.setTransition',
        { slideId: 't-none', kind: 'wipe', baseRevision: base },
        context,
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      dispatcher.dispatch(
        'motion.setTransition',
        { slideId: 't-none', kind: 'fade', baseRevision: base + 9 },
        context,
      ),
    ).rejects.toThrow(/revision/);
  });
});

describe('motion.add, motion.update, motion.remove, motion.reorder', () => {
  test('adds Appear on click at 500 ms per block with the next free ids, at the end or at an index', async () => {
    const dispatcher = dispatcherWith(deps);
    const out = (await dispatcher.dispatch(
      'motion.add',
      { slideId: 't-none', blockIds: ['h', 'obj'], baseRevision: await revision() },
      context,
    )) as { ids: string[]; animations: Animation[]; revision: number };
    // the fixture slide holds a1 on obj already, so the new rows take a2 and a3
    expect(out.ids).toEqual(['a2', 'a3']);
    expect(out.animations.map((row) => row.id)).toEqual(['a1', 'a2', 'a3']);
    expect(out.animations[1]).toEqual({
      id: 'a2',
      blockId: 'h',
      effect: 'appear',
      trigger: 'click',
      durationMs: 500,
    });
    const flown = (await dispatcher.dispatch(
      'motion.add',
      {
        slideId: 't-none',
        blockIds: ['obj'],
        effect: 'flyIn',
        trigger: 'afterPrevious',
        durationMs: 800,
        at: 0,
        baseRevision: out.revision,
      },
      context,
    )) as { ids: string[]; animations: Animation[] };
    expect(flown.ids).toEqual(['a4']);
    expect(flown.animations[0]).toEqual({
      id: 'a4',
      blockId: 'obj',
      effect: 'flyIn',
      direction: 'left',
      trigger: 'afterPrevious',
      durationMs: 800,
    });
  });

  test('refuses By paragraph on a block without paragraphs, Play on a non media block and an unknown block', async () => {
    const dispatcher = dispatcherWith(deps);
    const base = await revision();
    await expect(
      dispatcher.dispatch(
        'motion.add',
        { slideId: 'effects', blockIds: ['b1'], byParagraph: true, baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/By paragraph/);
    await expect(
      dispatcher.dispatch(
        'motion.add',
        { slideId: 'effects', blockIds: ['b1'], effect: 'playMedia', baseRevision: base },
        context,
      ),
    ).rejects.toThrow(/media block/);
    await expect(
      dispatcher.dispatch(
        'motion.add',
        { slideId: 'effects', blockIds: ['zz'], baseRevision: base },
        context,
      ),
    ).rejects.toThrow(RangeError);
    expect(await revision()).toBe(base);
  });

  test('update rewrites the fields, drops a direction off a non fly effect, clears with null', async () => {
    const dispatcher = dispatcherWith(deps);
    const updated = (await dispatcher.dispatch(
      'motion.update',
      {
        slideId: 't-fade',
        animationId: 'a1',
        trigger: 'withPrevious',
        durationMs: 300,
        baseRevision: await revision(),
      },
      context,
    )) as { animation: Animation; revision: number };
    expect(updated.animation).toEqual({
      id: 'a1',
      blockId: 'obj',
      effect: 'flyIn',
      direction: 'left',
      trigger: 'withPrevious',
      durationMs: 300,
    });
    const faded = (await dispatcher.dispatch(
      'motion.update',
      { slideId: 't-fade', animationId: 'a1', effect: 'fadeIn', baseRevision: updated.revision },
      context,
    )) as { animation: Animation; revision: number };
    expect(faded.animation.direction).toBeUndefined();
    const paragraphs = (await dispatcher.dispatch(
      'motion.update',
      {
        slideId: 'paragraphs',
        animationId: 'a1',
        byParagraph: false,
        baseRevision: faded.revision,
      },
      context,
    )) as { animation: Animation; revision: number };
    expect(paragraphs.animation.byParagraph).toBeUndefined();
    await expect(
      dispatcher.dispatch(
        'motion.update',
        {
          slideId: 'paragraphs',
          animationId: 'a9',
          trigger: 'click',
          baseRevision: paragraphs.revision,
        },
        context,
      ),
    ).rejects.toThrow(RangeError);
  });

  test('remove by id or by block, and an empty list leaves the slide without the field', async () => {
    const dispatcher = dispatcherWith(deps);
    const byId = (await dispatcher.dispatch(
      'motion.remove',
      { slideId: 'paragraphs', animationId: 'a0', baseRevision: await revision() },
      context,
    )) as { removed: string[]; animations: Animation[]; revision: number };
    expect(byId.removed).toEqual(['a0']);
    expect(byId.animations.map((row) => row.id)).toEqual(['a1', 'a2', 'a3']);
    const byBlock = (await dispatcher.dispatch(
      'motion.remove',
      { slideId: 'paragraphs', blockId: 'list', baseRevision: byId.revision },
      context,
    )) as { removed: string[]; animations: Animation[]; revision: number };
    expect(byBlock.removed).toEqual(['a2', 'a3']);
    expect(byBlock.animations.map((row) => row.id)).toEqual(['a1']);
    const last = (await dispatcher.dispatch(
      'motion.remove',
      { slideId: 'paragraphs', animationId: 'a1', baseRevision: byBlock.revision },
      context,
    )) as { animations: Animation[]; revision: number };
    expect(last.animations).toEqual([]);
    const { document } = await deps.store.read();
    expect('animations' in (document.slides.paragraphs ?? {})).toBe(false);
    await expect(
      dispatcher.dispatch(
        'motion.remove',
        { slideId: 'paragraphs', animationId: 'a1', blockId: 'h', baseRevision: last.revision },
        context,
      ),
    ).rejects.toThrow(/not both/);
    await expect(
      dispatcher.dispatch(
        'motion.remove',
        { slideId: 'paragraphs', blockId: 'h', baseRevision: last.revision },
        context,
      ),
    ).rejects.toThrow(RangeError);
  });

  test('reorder writes the whole order and refuses a partial or repeated one', async () => {
    const dispatcher = dispatcherWith(deps);
    const base = await revision();
    const out = (await dispatcher.dispatch(
      'motion.reorder',
      { slideId: 'paragraphs', order: ['a3', 'a1', 'a0', 'a2'], baseRevision: base },
      context,
    )) as { animations: Animation[]; revision: number };
    expect(out.animations.map((row) => row.id)).toEqual(['a3', 'a1', 'a0', 'a2']);
    await expect(
      dispatcher.dispatch(
        'motion.reorder',
        { slideId: 'paragraphs', order: ['a3', 'a1'], baseRevision: out.revision },
        context,
      ),
    ).rejects.toThrow(/every id appears once/);
    await expect(
      dispatcher.dispatch(
        'motion.reorder',
        { slideId: 'paragraphs', order: ['a3', 'a3', 'a1', 'a0'], baseRevision: out.revision },
        context,
      ),
    ).rejects.toThrow(/twice/);
    await expect(
      dispatcher.dispatch(
        'motion.reorder',
        { slideId: 'paragraphs', order: ['a3', 'a1', 'a0', 'zz'], baseRevision: out.revision },
        context,
      ),
    ).rejects.toThrow(RangeError);
  });
});

describe('motion.compile', () => {
  test('answers the schedule the render package pins for the fixture, with the media length from deck.media', async () => {
    const dispatcher = dispatcherWith(deps);
    const effects = (await dispatcher.dispatch(
      'motion.compile',
      { slideId: 'effects' },
      context,
    )) as MotionSchedule;
    expect(effects.slideId).toBe('effects');
    expect(effects.steps.length).toBe(7);
    expect(effects.hiddenAtStart).toEqual(['b1', 'b3', 'b5', 'b6', 'b7', 'b8', 'b13']);
    const paragraphs = (await dispatcher.dispatch(
      'motion.compile',
      { slideId: 'paragraphs' },
      context,
    )) as MotionSchedule;
    // the three paragraph text plays one paragraph per click, the four item list chains behind the third
    expect(paragraphs.steps.length).toBe(5);
    expect(paragraphs.steps[3]?.effects.map((e) => e.paragraph)).toEqual([2, 0, 1, 2, 3]);
    const media = (await dispatcher.dispatch(
      'motion.compile',
      { slideId: 'media' },
      context,
    )) as MotionSchedule;
    expect(media.steps[0]?.effects[0]?.durationMs).toBe(1000);
    const still = (await dispatcher.dispatch(
      'motion.compile',
      { slideId: 't-none' },
      context,
    )) as MotionSchedule;
    expect(still.transition).toBeNull();
    await expect(
      dispatcher.dispatch('motion.compile', { slideId: 'nope' }, context),
    ).rejects.toThrow(RangeError);
  });
});

describe('settleAnimation', () => {
  test('a fly without a direction flies from the left; a non fly drops its direction', () => {
    const shape = { id: 's', type: 'shape', shape: 'rect' } as unknown as Parameters<
      typeof settleAnimation
    >[1];
    const row: Animation = {
      id: 'a1',
      blockId: 's',
      effect: 'flyOut',
      trigger: 'click',
      durationMs: 500,
    };
    expect(settleAnimation(row, shape).direction).toBe('left');
    expect(
      settleAnimation({ ...row, effect: 'spin', direction: 'top' }, shape).direction,
    ).toBeUndefined();
  });
});
