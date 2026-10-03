import { describe, expect, it } from 'vitest';

import { HOME_DECK } from '../deck.generated';
import type { HomeObjectId, SheetBox } from '../deck.generated';
import { COALESCE_MS, createHomeStore, restState } from './state';
import type { Change, HomeDeckState, StoreEvent } from './state';

/* The store's day 0 contract (docs/LANDING.md 2.0 "Undo", 6.3; integrator.md section 4.4). */

const TITLE: HomeObjectId = 'title#heading';
const BOX: SheetBox = { x: 137, y: 150, w: 1200, h: 441, rot: 0 };

const move = (to: SheetBox, at: number, coalesce?: string): Change => {
  let before: SheetBox | undefined;
  return {
    band: 'hero',
    author: 'you',
    words: 'Moved the title on slide 1',
    at,
    ...(coalesce !== undefined ? { coalesce } : {}),
    next: (s) => {
      before = s.poses[TITLE];
      return { ...s, poses: { ...s.poses, [TITLE]: to } };
    },
    undo: (s) => {
      const poses = { ...s.poses };
      if (before === undefined) delete poses[TITLE];
      else poses[TITLE] = before;
      return { ...s, poses };
    },
  };
};

const rename = (to: string, at: number): Change => {
  let before = '';
  return {
    band: 'tailor',
    author: 'you',
    words: `Tailored for ${to}`,
    at,
    next: (s) => {
      before = s.customer;
      return { ...s, customer: to };
    },
    undo: (s) => ({ ...s, customer: before }),
  };
};

const fresh = () => createHomeStore(restState(HOME_DECK, ['a', 'b', 'c']), () => 1_000);

describe('the home store', () => {
  it('starts at the run end with three recorded agent rows', () => {
    const s = fresh().get();
    expect(s.order).toHaveLength(8);
    expect(s.agentStep).toBe(3);
    expect(s.history.map((r) => [r.author, r.run, r.recorded])).toEqual([
      ['agent', true, true],
      ['agent', true, true],
      ['agent', true, true],
    ]);
  });

  it('adds one row per change and undoes the newest change of one band only', () => {
    const store = fresh();
    const events: StoreEvent['kind'][] = [];
    store.subscribe((_s: HomeDeckState, e: StoreEvent) => events.push(e.kind));
    store.commit(move({ ...BOX, x: 300 }, 10));
    store.commit(rename('Globex', 20));
    expect(store.get().history).toHaveLength(5);
    expect(store.undo('hero')).toBe(true);
    expect(store.get().poses[TITLE]).toBeUndefined();
    expect(store.get().customer).toBe('Globex');
    expect(store.get().history.map((r) => r.words)).toEqual(['a', 'b', 'c', 'Tailored for Globex']);
    expect(store.undo('hero')).toBe(false);
    expect(store.canUndo('tailor')).toBe(true);
    expect(events).toEqual(['commit', 'commit', 'undo']);
  });

  it('merges nudges within the window into one step and one row', () => {
    const store = fresh();
    store.commit(move({ ...BOX, x: 138 }, 100, 'nudge'));
    store.commit(move({ ...BOX, x: 139 }, 100 + COALESCE_MS, 'nudge'));
    store.commit(move({ ...BOX, x: 140 }, 100 + 2 * COALESCE_MS, 'nudge'));
    expect(store.get().history).toHaveLength(4);
    expect(store.get().poses[TITLE]?.x).toBe(140);
    store.commit(move({ ...BOX, x: 150 }, 100 + 4 * COALESCE_MS, 'nudge'));
    expect(store.get().history).toHaveLength(5);
    store.undo('hero');
    expect(store.get().poses[TITLE]?.x).toBe(140);
    store.undo('hero');
    expect(store.get().poses[TITLE]).toBeUndefined();
    expect(store.get().history).toHaveLength(3);
  });

  it('keeps a change with no words out of history and out of Undo', () => {
    const store = fresh();
    store.commit({
      band: 'agents',
      author: 'agent',
      words: null,
      next: (s) => ({ ...s, agentStep: 0, history: s.history.filter((r) => !r.run) }),
      undo: null,
    });
    expect(store.get().agentStep).toBe(0);
    expect(store.get().history).toHaveLength(0);
  });
});
