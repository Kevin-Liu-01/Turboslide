import { describe, expect, test } from 'vitest';

import { PICTURES_IN_FLIGHT, pictureGate } from '../dialogs/picture-gate';

// The Import slides dialog's bound on tile pictures (round1/build/ha.md "Round 1 fix round"
// request 1): six turns at once, the waiting tiles in the order they asked, a cancel for a tile
// that leaves before its turn, and the next tile started when a picture is done.

describe('the picture gate', () => {
  test('starts six at once and the rest in order as each is done', () => {
    const gate = pictureGate();
    const started: number[] = [];
    for (let n = 0; n < 10; n += 1) gate.ask(() => started.push(n));
    expect(PICTURES_IN_FLIGHT).toBe(6);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(gate.counts()).toEqual({ active: 6, waiting: 4 });
    gate.done();
    gate.done();
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(gate.counts()).toEqual({ active: 6, waiting: 2 });
  });

  test('a cancelled tile never starts, and a cancel after the start changes nothing', () => {
    const gate = pictureGate(1);
    const started: string[] = [];
    const cancelA = gate.ask(() => started.push('a'));
    const cancelB = gate.ask(() => started.push('b'));
    gate.ask(() => started.push('c'));
    cancelB();
    cancelA();
    expect(gate.counts()).toEqual({ active: 1, waiting: 1 });
    gate.done();
    expect(started).toEqual(['a', 'c']);
    gate.done();
    gate.done();
    expect(gate.counts()).toEqual({ active: 0, waiting: 0 });
  });
});
