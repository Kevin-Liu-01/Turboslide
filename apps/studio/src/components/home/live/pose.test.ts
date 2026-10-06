import { describe, expect, it } from 'vitest';

import { HOME_DECK } from '../deck.generated';
import type { SheetBox } from '../deck.generated';
import { boxIn, sheetLayout, UNITS } from './paint';
import { baseState } from './state';
import type { HomeDeckState, ObjectKey } from './state';

/*
 * The box an object stands in, in units (docs/LANDING.md 2.5: the menus band's readout reads
 * "Title · x 789 · y 362 · 0°" for an object at rest). A layout slide holds no rest until its
 * first freeing, so the pose of an object at rest is the place the layout draws it in, never a
 * zero box (verify-landing.md finding 1: "Heading · x 0 · y 0" on every layout slide).
 */

type Rect = { left: number; top: number; width: number; height: number };
const rect = (r: Rect): DOMRectReadOnly => r as unknown as DOMRectReadOnly;

/** A sheet at `sheet` holding one object drawn at `drawn`, both in screen pixels. */
function fakeSheet(sheet: Rect, id: ObjectKey, drawn: Rect): HTMLElement {
  const el = {
    dataset: { object: id },
    style: { cssText: '' },
    closest: () => null,
    contains: () => false,
    getBoundingClientRect: () => rect(drawn),
  };
  return {
    querySelectorAll: () => [el],
    getBoundingClientRect: () => rect(sheet),
  } as unknown as HTMLElement;
}

const state = (): HomeDeckState => baseState(HOME_DECK);

describe('boxIn', () => {
  it('reads a drawn rectangle in units from its sheet', () => {
    // the menus band's stage: 832 px across for 1,600 units
    const k = 832 / UNITS;
    const box = boxIn(
      rect({ left: 200, top: 100, width: 832, height: 468 }),
      rect({ left: 200 + 789 * k, top: 100 + 362 * k, width: 480 * k, height: 64 * k }),
      k,
    );
    expect(box.x).toBeCloseTo(789, 6);
    expect(box.y).toBeCloseTo(362, 6);
    expect(box.w).toBeCloseTo(480, 6);
    expect(box.h).toBeCloseTo(64, 6);
    expect(box.rot).toBe(0);
  });
});

describe('sheetLayout pose', () => {
  it('reads an object at rest on a layout slide where the layout draws it', () => {
    const k = 832 / UNITS;
    const root = fakeSheet({ left: 40, top: 60, width: 832, height: 468 }, 'plan#h', {
      left: 40 + 137 * k,
      top: 60 + 150 * k,
      width: 1200 * k,
      height: 96 * k,
    });
    const layout = sheetLayout(root);
    const it = layout.item('plan#h');
    expect(it).toBeDefined();
    if (it === undefined) return;
    expect(layout.freed()).toBe(false);
    expect(it.rest).toBeNull();
    const p = layout.pose(it, state());
    expect(p.x).toBeCloseTo(137, 6);
    expect(p.y).toBeCloseTo(150, 6);
    expect(p.w).toBeCloseTo(1200, 6);
    expect(p.h).toBeCloseTo(96, 6);
    expect(p.rot).toBe(0);
    // reading the pose frees nothing
    expect(layout.freed()).toBe(false);
    expect(it.rest).toBeNull();
  });

  it('reads the store pose before the drawn place', () => {
    const root = fakeSheet({ left: 0, top: 0, width: 1600, height: 900 }, 'plan#h', {
      left: 137,
      top: 150,
      width: 1200,
      height: 96,
    });
    const layout = sheetLayout(root);
    const it = layout.item('plan#h');
    if (it === undefined) throw new Error('no item');
    const moved: SheetBox = { x: 329, y: 494, w: 1200, h: 96, rot: 15 };
    const s = state();
    expect(layout.pose(it, { ...s, poses: { ...s.poses, 'plan#h': moved } })).toEqual(moved);
  });

  it('reads a zero box only while the sheet is not laid out', () => {
    const root = fakeSheet({ left: 0, top: 0, width: 0, height: 0 }, 'plan#h', {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
    const layout = sheetLayout(root);
    const it = layout.item('plan#h');
    if (it === undefined) throw new Error('no item');
    expect(layout.pose(it, state())).toEqual({ x: 0, y: 0, w: 0, h: 0, rot: 0 });
  });
});
