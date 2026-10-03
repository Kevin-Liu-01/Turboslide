import { describe, expect, it } from 'vitest';

import { HOME_DECK } from '../deck.generated';
import type { HomeObjectId, SheetBox } from '../deck.generated';
import { COALESCE_MS, createHomeStore, insertAfter, restState, sourceOf } from './state';
import type { Change, HomeDeckState, StoreEvent } from './state';

/* The store (docs/LANDING.md 2.0 "Undo", 2.9 "The scrubber", 6.3 "The store"). */

const TITLE: HomeObjectId = 'title#heading';
const BOX: SheetBox = { x: 137, y: 150, w: 1200, h: 441, rot: 0 };

const move = (to: SheetBox, at: number, coalesce?: string): Change => ({
  band: 'hero',
  author: 'you',
  words: 'Moved the title on slide 1',
  at,
  slide: 'title',
  ...(coalesce !== undefined ? { coalesce } : {}),
  next: (s) => ({ ...s, poses: { ...s.poses, [TITLE]: to } }),
  undo: (s) => s,
});

const rename = (to: string, at: number, band: Change['band'] = 'tailor'): Change => ({
  band,
  author: band === 'agents' ? 'agent' : 'you',
  words: `Tailored for ${to}`,
  at,
  next: (s) => ({ ...s, customer: to }),
  undo: band === 'agents' ? null : (s) => s,
});

const kit = (to: HomeDeckState['kit'], at: number): Change => ({
  band: 'kits',
  author: 'you',
  words: `Set the ${to} kit`,
  at,
  next: (s) => ({ ...s, kit: to }),
  undo: (s) => s,
});

const fresh = () => createHomeStore(restState(HOME_DECK, ['a', 'b', 'c']), () => 1_000);

describe('the home store', () => {
  it('starts at the run end with three recorded agent rows and four versions', () => {
    const store = fresh();
    const s = store.get();
    expect(s.order).toEqual(HOME_DECK.order);
    expect(s.agentStep).toBe(3);
    expect(s.history.map((r) => [r.words, r.author, r.run, r.recorded])).toEqual([
      ['a', 'agent', true, true],
      ['b', 'agent', true, true],
      ['c', 'agent', true, true],
    ]);
    const versions = store.versions();
    expect(versions.map((v) => [v.n, v.recorded, v.state.agentStep])).toEqual([
      [1, true, 0],
      [2, true, 1],
      [3, true, 2],
      [4, true, 3],
    ]);
    expect(versions[0]?.state.order).toEqual(HOME_DECK.startOrder);
    expect(versions[1]?.state.order).toEqual(HOME_DECK.order);
    expect(versions[1]?.slide).toBe('next-steps');
  });

  it('adds one row and one version per change and undoes the newest change of one band only', () => {
    const store = fresh();
    const events: StoreEvent['kind'][] = [];
    store.subscribe((_s: HomeDeckState, e: StoreEvent) => events.push(e.kind));
    store.commit(move({ ...BOX, x: 300 }, 10));
    store.commit(rename('Globex', 20));
    expect(store.get().history).toHaveLength(5);
    expect(store.versions()).toHaveLength(6);
    expect(store.undo('hero')).toBe(true);
    expect(store.get().poses[TITLE]).toBeUndefined();
    expect(store.get().customer).toBe('Globex');
    expect(store.get().history.map((r) => r.words)).toEqual(['a', 'b', 'c', 'Tailored for Globex']);
    expect(store.versions().map((v) => v.state.poses[TITLE])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(store.undo('hero')).toBe(false);
    expect(store.canUndo('tailor')).toBe(true);
    expect(store.canUndo('menus')).toBe(false);
    expect(events).toEqual(['commit', 'commit', 'undo']);
  });

  it('merges nudges within the window into one step, one row and one version', () => {
    const store = fresh();
    store.commit(move({ ...BOX, x: 138 }, 100, 'nudge'));
    store.commit(move({ ...BOX, x: 139 }, 100 + COALESCE_MS, 'nudge'));
    store.commit(move({ ...BOX, x: 140 }, 100 + 2 * COALESCE_MS, 'nudge'));
    expect(store.get().history).toHaveLength(4);
    expect(store.versions()).toHaveLength(5);
    expect(store.get().poses[TITLE]?.x).toBe(140);
    store.commit(move({ ...BOX, x: 150 }, 100 + 4 * COALESCE_MS, 'nudge'));
    expect(store.get().history).toHaveLength(5);
    store.undo('hero');
    expect(store.get().poses[TITLE]?.x).toBe(140);
    store.undo('hero');
    expect(store.get().poses[TITLE]).toBeUndefined();
    expect(store.get().history).toHaveLength(3);
  });

  it('never undoes an agent change or a recorded step', () => {
    const store = fresh();
    store.commit(rename('Initech', 10, 'agents'));
    expect(store.get().customer).toBe('Initech');
    expect(store.undo('tailor')).toBe(false);
    expect(store.get().history).toHaveLength(4);
  });

  it('replays later changes when an earlier one is undone, so no later version keeps it', () => {
    const store = fresh();
    store.commit(kit('kestrel', 10));
    store.commit(move({ ...BOX, x: 400 }, 20));
    store.undo('kits');
    const state = store.get();
    expect(state.kit).toBe('gt');
    expect(state.poses[TITLE]?.x).toBe(400);
    const last = store.versions().at(-1);
    expect(last?.state.kit).toBe('gt');
    expect(last?.words).toBe('Moved the title on slide 1');
  });

  it('restores a version as one change by its author, with a new newest version', () => {
    const store = fresh();
    store.commit(rename('Globex', 10));
    store.commit(kit('globex', 20));
    expect(store.version(5)?.customer).toBe('Globex');
    expect(store.restore(4, 'you', 'Restored version 4')).toBe(true);
    const s = store.get();
    expect(s.customer).toBe('Northwind');
    expect(s.kit).toBe('gt');
    expect(s.history.at(-1)).toMatchObject({ author: 'you', words: 'Restored version 4' });
    expect(store.versions()).toHaveLength(7);
    expect(store.canUndo('kits')).toBe(true);
    // the restore writes no undo step; the kit's Undo then replays the restore over the deck without the kit
    store.undo('kits');
    expect(store.get().kit).toBe('gt');
    expect(store.restore(1, 'agent', 'Restored version 1')).toBe(true);
    expect(store.get().order).toEqual(HOME_DECK.startOrder);
    expect(store.get().agentStep).toBe(0);
    expect(store.restore(99, 'you', 'x')).toBe(false);
  });

  it('places a slide after another and finds the source of an added slide', () => {
    expect(insertAfter(['title', 'plan', 'gets'], 'plan', 'ships')).toEqual([
      'title',
      'plan',
      'ships',
      'gets',
    ]);
    const added = [
      { id: 'added-1' as const, from: 'plan' as const },
      { id: 'added-2' as const, from: 'added-1' as const },
      { id: 'added-3' as const, from: 'blank' as const },
    ];
    expect(sourceOf({ added }, 'added-2')).toBe('plan');
    expect(sourceOf({ added }, 'added-3')).toBe('blank');
    expect(sourceOf({ added }, 'gets')).toBe('gets');
  });
});
