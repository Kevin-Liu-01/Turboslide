import { describe, expect, test } from 'vitest';

import { PICTURES_IN_FLIGHT, pictureGate } from '../dialogs/picture-gate';
import type { PictureTurn } from '../dialogs/picture-gate';

// The Import slides dialog's bound on tile pictures (round1/build/ha.md "Round 1 fix round"
// request 1): six turns at once, the next tile started when a picture is done. The Round 1
// follow-up, lane A item 2 (VERIFICATION.md "Round 1, pass 2" P2-1): a tile that leaves gives its
// place back, waiting or started, and the tiles in view go before the tiles only near the view.

describe('the picture gate', () => {
  test('starts six at once and the rest in the order they asked as each is done', () => {
    const gate = pictureGate();
    const started: number[] = [];
    const turns = Array.from({ length: 10 }, (_, n) => gate.ask(() => started.push(n), false));
    expect(PICTURES_IN_FLIGHT).toBe(6);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(gate.counts()).toEqual({ active: 6, waiting: 4 });
    turns[0]!.release();
    turns[1]!.release();
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(gate.counts()).toEqual({ active: 6, waiting: 2 });
  });

  test('a tile that leaves while it waits never starts; one that leaves after its start frees its turn', () => {
    const gate = pictureGate(1);
    const started: string[] = [];
    const a = gate.ask(() => started.push('a'), true);
    const b = gate.ask(() => started.push('b'), true);
    gate.ask(() => started.push('c'), true);
    b.release();
    expect(gate.counts()).toEqual({ active: 1, waiting: 1 });
    a.release();
    expect(started).toEqual(['a', 'c']);
    expect(gate.counts()).toEqual({ active: 1, waiting: 0 });
  });

  test('a second release changes nothing', () => {
    const gate = pictureGate(1);
    const started: string[] = [];
    const a = gate.ask(() => started.push('a'), true);
    gate.ask(() => started.push('b'), true);
    gate.ask(() => started.push('c'), true);
    a.release();
    a.release();
    expect(started).toEqual(['a', 'b']);
    expect(gate.counts()).toEqual({ active: 1, waiting: 1 });
  });

  test('a waiting tile in view goes before the tiles only near the view, which keep their order', () => {
    const gate = pictureGate(1);
    const started: string[] = [];
    const first = gate.ask(() => started.push('first'), true);
    gate.ask(() => started.push('near-1'), false);
    const later = gate.ask(() => started.push('scrolled-into-view'), false);
    gate.ask(() => started.push('near-2'), false);
    later.see(true);
    first.release();
    expect(started).toEqual(['first', 'scrolled-into-view']);
    later.release();
    expect(started).toEqual(['first', 'scrolled-into-view', 'near-1']);
  });

  test('a waiting tile that leaves the view goes back to the near rank in its asking order', () => {
    const gate = pictureGate(1);
    const started: string[] = [];
    const a = gate.ask(() => started.push('a'), true);
    const b = gate.ask(() => started.push('b'), true);
    gate.ask(() => started.push('c'), false);
    const d = gate.ask(() => started.push('d'), true);
    b.see(false);
    a.release();
    expect(started).toEqual(['a', 'd']);
    d.release();
    expect(started).toEqual(['a', 'd', 'b']);
  });

  test('a tile in view takes the turn of the last tile only near the view to start, which waits again in its order', () => {
    const gate = pictureGate(2);
    const log: string[] = [];
    const ask = (name: string, inView: boolean) =>
      gate.ask(
        () => log.push(`start ${name}`),
        inView,
        () => log.push(`stop ${name}`),
      );
    ask('a', false);
    const b = ask('b', false);
    ask('later-near', false);
    const c = ask('c', true);
    expect(log).toEqual(['start a', 'start b', 'stop b', 'start c']);
    expect(gate.counts()).toEqual({ active: 2, waiting: 2 });
    /* b asked before later-near, so it starts first when c's turn comes back */
    c.release();
    expect(log.at(-1)).toBe('start b');
    /* a started tile in view is never stopped */
    b.see(true);
    ask('d', true);
    expect(log.filter((line) => line.startsWith('stop'))).toEqual(['stop b', 'stop a']);
    expect(log.at(-1)).toBe('start d');
  });

  test('a started tile without a stop keeps its turn', () => {
    const gate = pictureGate(1);
    const started: string[] = [];
    gate.ask(() => started.push('near'), false);
    gate.ask(() => started.push('seen'), true);
    expect(started).toEqual(['near']);
    expect(gate.counts()).toEqual({ active: 1, waiting: 1 });
  });

  test('P2-1: the tiles in view at the end of a long list start at once after a scroll past 87 tiles', () => {
    // a person opens a 95 tile list (the first 12 are near), scrolls it to its end over 8 s and
    // the 8 tiles in view at the end ask; every tile the scroll passed asked on the way and left
    const gate = pictureGate();
    const started: number[] = [];
    const turns = new Map<number, PictureTurn>();
    const ask = (n: number, inView: boolean) =>
      turns.set(
        n,
        gate.ask(() => started.push(n), inView),
      );
    for (let n = 0; n < 12; n += 1) ask(n, n < 6);
    for (let n = 12; n < 87; n += 3) {
      for (let m = n; m < n + 3; m += 1) ask(m, true);
      /* the row three rows back leaves the near area */
      for (let m = n - 12; m < n - 9; m += 1) turns.get(m)?.release();
    }
    for (let m = 75; m < 87; m += 1) turns.get(m)?.release();
    const before = started.length;
    for (let n = 87; n < 95; n += 1) ask(n, true);
    /* the first six of the eight in view started at their ask, the other two when a turn frees */
    expect(started.slice(before)).toEqual([87, 88, 89, 90, 91, 92]);
    expect(gate.counts()).toEqual({ active: 6, waiting: 2 });
    turns.get(87)!.release();
    turns.get(88)!.release();
    expect(started.slice(before)).toEqual([87, 88, 89, 90, 91, 92, 93, 94]);
  });
});
