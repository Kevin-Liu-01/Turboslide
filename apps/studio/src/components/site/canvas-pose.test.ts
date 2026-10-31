import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { boundingBoxOf, freeNudgeMutations, zOrderMutations } from '@turboslide/viewer/Freeform';
import { EMPTY_BOXES, actionForMutations, freeGesture } from '@turboslide/viewer/Gestures';
import type { GestureContext, Handle } from '@turboslide/viewer/Gestures';
import { marqueeHits as editorMarqueeHits } from '@turboslide/viewer/Marquee';
import { boxSnapLines, sheetEdgeLines, sheetSnapLines } from '@turboslide/viewer/snap';

import {
  DIRS,
  INITIAL,
  LIGHTHOUSE,
  SHEET_LINES,
  SLIDE_ID,
  applyMutations,
  blockJson,
  callFor,
  callInput,
  duplicate,
  frameOf,
  marqueeBox,
  marqueeHits,
  moveGesture,
  nudge,
  order,
  paintRanks,
  printCall,
  redo,
  removeAll,
  resizeGesture,
  ringOf,
  selectableIds,
  turnGesture,
  undo,
  write,
} from './canvas-pose';
import type { Dir, Gesture, Mods, OrderMove, Point, Scene } from './canvas-pose';

// The Canvas screen (CanvasScreen.tsx): every gesture on the lighthouse slide is run here and
// through the editor's own functions on the same slide (viewer Gestures.tsx freeGesture,
// Freeform.tsx freeNudgeMutations and zOrderMutations), and the call the screen prints must be
// the call the editor sends, guides included. The undo record writes each inverse forward.

/** The scene as the editor's freeform slide. */
function editorSlide(scene: Scene): Slide {
  return {
    schemaVersion: 1,
    id: SLIDE_ID,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: scene.map(blockJson) },
  } as unknown as Slide;
}

/** The snap context the editor builds for a gesture on `ids` (Editor.tsx freeContextFor). */
function editorContext(scene: Scene, ids: readonly string[]): GestureContext {
  const slide = editorSlide(scene);
  const lines = [...sheetEdgeLines(), ...sheetSnapLines()];
  const spacing: Array<[number, number, number, number]> = [];
  for (const object of scene) {
    if (ids.includes(object.id)) continue;
    const box = boundingBoxOf(object.pos);
    lines.push(...boxSnapLines(box));
    spacing.push(box);
  }
  return { slide, boxes: EMPTY_BOXES, free: { ids: [...ids], lines, grid: false, spacing } };
}

function handle(kind: Handle['kind'], blockId: string, dir?: Dir): Handle {
  return {
    id: `${kind}:${blockId}`,
    kind,
    box: [0, 0, 0, 0],
    blockId,
    cursor: 'move',
    label: kind,
    control: kind,
    shape: 'chip',
    axis: 'xy',
    sign: 1,
    ...(dir === undefined ? {} : { dir }),
  } as Handle;
}

function strip(call: { id: string; input: Record<string, unknown> }) {
  const { baseRevision: _revision, ...input } = call.input;
  return { id: call.id, input };
}

type Seen = { call: ReturnType<typeof strip>; guides: unknown[] } | null;

function editor(
  scene: Scene,
  ids: readonly string[],
  kind: Handle['kind'],
  start: Point,
  now: Point,
  mods: Mods,
  dir?: Dir,
): Seen {
  const anchor = ids[0] ?? '';
  const g = freeGesture(handle(kind, anchor, dir), editorContext(scene, ids), start, now, mods);
  if (g === null || g.mutations.length === 0) return null;
  return { call: strip(actionForMutations(g.mutations, 0)), guides: g.guides };
}

function page(g: Gesture | null): Seen {
  return g === null ? null : { call: callInput(callFor(g.mutations)), guides: g.guides };
}

const MODS: Mods[] = [
  { shift: false },
  { shift: true },
  { shift: false, meta: true },
  { shift: false, alt: true },
];
const SELECTIONS = [
  ['h'],
  ['plate'],
  ['p1'],
  ['credit'],
  ['h', 'plate'],
  ['plate', 'p1', 'credit'],
];
const DELTAS: Array<[number, number]> = [
  [40, 25],
  [-120, 300],
  [5, -3],
  [3, 0],
  [700, 400],
  [300.4, 10.6],
  [-766, -407.73],
  [0, 0],
];
const from: Point = { x: 400, y: 300 };

describe('the slide', () => {
  it('starts with the heading selected and its /pos under the slide', () => {
    expect(INITIAL.selected).toEqual(['h']);
    expect(printCall(INITIAL.call)).toEqual([
      {
        op: 'block.set lighthouse#h /pos',
        value: '{"x":137,"y":129,"w":508,"h":48,"z":2,"rotate":354}',
      },
    ]);
  });

  it('keeps the picture as the ground: never selected, never hit', () => {
    expect(selectableIds(LIGHTHOUSE)).toEqual(['plate', 'h', 'p1', 'credit']);
    expect(marqueeHits(LIGHTHOUSE, [0, 0, 1600, 900])).toEqual(['plate', 'h', 'p1', 'credit']);
    expect(moveGesture(LIGHTHOUSE, ['picture'], 40, 40, { shift: false })).toBeNull();
  });

  it('paints by z, document order breaking ties', () => {
    expect([...paintRanks(LIGHTHOUSE)]).toEqual([
      ['picture', 0],
      ['plate', 1],
      ['h', 2],
      ['p1', 3],
      ['credit', 4],
    ]);
  });

  it('rings a text object 10 px out and frames several by their union', () => {
    const h = LIGHTHOUSE[2];
    expect(h && ringOf(h)).toEqual({ box: [127, 119, 528, 68], rotate: 354 });
    expect(frameOf(LIGHTHOUSE, ['plate'])).toEqual({
      box: [903, 536.734375, 560, 234.265625],
      rotate: 0,
    });
    expect(frameOf(LIGHTHOUSE, ['p1', 'credit'])).toEqual({
      box: [929, 618.25, 508, 132.75],
      rotate: 0,
    });
    expect(frameOf(LIGHTHOUSE, [])).toBeNull();
  });
});

describe('the gestures, against the editor', () => {
  it('snaps to the lines the editor snaps to', () => {
    expect(SHEET_LINES).toEqual([...sheetEdgeLines(), ...sheetSnapLines()]);
  });

  it('moves as freeGesture moves', () => {
    for (const ids of SELECTIONS)
      for (const [dx, dy] of DELTAS)
        for (const mods of MODS) {
          const now = { x: from.x + dx, y: from.y + dy };
          expect(page(moveGesture(LIGHTHOUSE, ids, dx, dy, mods)), `${ids} ${dx},${dy}`).toEqual(
            editor(LIGHTHOUSE, ids, 'free-move', from, now, mods),
          );
        }
  });

  it('resizes as freeGesture resizes, from all eight handles', () => {
    for (const ids of SELECTIONS)
      for (const dir of DIRS)
        for (const [dx, dy] of DELTAS)
          for (const mods of MODS) {
            const now = { x: from.x + dx, y: from.y + dy };
            expect(
              page(resizeGesture(LIGHTHOUSE, ids, dir, dx, dy, mods)),
              `${ids} ${dir} ${dx},${dy} ${JSON.stringify(mods)}`,
            ).toEqual(editor(LIGHTHOUSE, ids, 'free-resize', from, now, mods, dir));
          }
  });

  it('turns as freeGesture turns', () => {
    const ends: Point[] = [
      { x: 900, y: 100 },
      { x: 120, y: 820 },
      { x: 1500, y: 450 },
      { x: 401, y: 301 },
    ];
    for (const ids of SELECTIONS)
      for (const now of ends)
        for (const mods of MODS)
          expect(page(turnGesture(LIGHTHOUSE, ids, from, now, mods)), `${ids} ${now.x}`).toEqual(
            editor(LIGHTHOUSE, ids, 'free-rotate', from, now, mods),
          );
  });

  it('nudges as freeNudgeMutations nudges', () => {
    const slide = editorSlide(LIGHTHOUSE);
    for (const ids of SELECTIONS)
      for (const [dx, dy] of [
        [1, 0],
        [0, -10],
        [-1, 0],
      ] as const) {
        const mine = nudge(LIGHTHOUSE, ids, dx, dy);
        const theirs = freeNudgeMutations(slide, ids, EMPTY_BOXES, dx, dy);
        expect(callInput(callFor(mine))).toEqual(strip(actionForMutations(theirs, 0)));
      }
  });

  it('orders as zOrderMutations orders', () => {
    const slide = editorSlide(LIGHTHOUSE);
    const moves: OrderMove[] = ['front', 'back', 'forward', 'backward'];
    for (const id of selectableIds(LIGHTHOUSE))
      for (const move of moves) {
        const mine = order(LIGHTHOUSE, id, move);
        const theirs = zOrderMutations(slide, id, move);
        expect(mine.length, `${id} ${move}`).toBe(theirs.length);
        if (mine.length > 0)
          expect(callInput(callFor(mine))).toEqual(strip(actionForMutations(theirs, 0)));
      }
  });

  it('takes the objects a marquee crosses, as the editor’s marquee does', () => {
    const boxes = Object.fromEntries(
      LIGHTHOUSE.filter((o) => o.type !== 'picture').map((o) => [o.id, boundingBoxOf(o.pos)]),
    );
    const order = selectableIds(LIGHTHOUSE);
    for (const [a, b] of [
      [
        { x: 100, y: 100 },
        { x: 300, y: 160 },
      ],
      [
        { x: 1500, y: 800 },
        { x: 1000, y: 700 },
      ],
      [
        { x: 940, y: 640 },
        { x: 941, y: 760 },
      ],
      [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    ] as const) {
      const box = marqueeBox(a, b);
      expect(marqueeHits(LIGHTHOUSE, box)).toEqual(editorMarqueeHits([...box], boxes, order));
    }
  });
});

describe('the printed call', () => {
  it('prints one write as its own action and several as one slide.update', () => {
    const one = moveGesture(LIGHTHOUSE, ['plate'], 100, 0, { shift: false, meta: true });
    expect(one && printCall(callFor(one.mutations))).toEqual([
      {
        op: 'block.set lighthouse#plate /pos',
        value: '{"x":1003,"y":537,"w":560,"h":234.265625,"z":1}',
      },
    ]);
    const two = moveGesture(LIGHTHOUSE, ['p1', 'credit'], 0, -100, { shift: false, meta: true });
    expect(two && printCall(callFor(two.mutations))).toEqual([
      { op: 'slide.update lighthouse' },
      { op: 'block.set p1 /pos', value: '{"x":929,"y":518,"w":508,"h":99,"z":3}', inner: true },
      {
        op: 'block.set credit /pos',
        value: '{"x":929,"y":629,"w":508,"h":21.75,"z":4}',
        inner: true,
      },
    ]);
  });

  it('prints a duplicate and an order as their own actions', () => {
    expect(printCall(duplicate(LIGHTHOUSE, ['h', 'p1']).call)).toEqual([
      { op: 'block.duplicate lighthouse --blocks h,p1' },
    ]);
    expect(printCall({ id: 'block.order', blockId: 'plate', move: 'front' })).toEqual([
      { op: 'block.order lighthouse#plate --move front' },
    ]);
  });
});

describe('the undo record', () => {
  it('undoes a move by writing the old /pos forward, and redoes it', () => {
    const moved = moveGesture(LIGHTHOUSE, ['p1'], 100, 0, { shift: false, meta: true });
    const once = write(INITIAL, moved?.mutations ?? []);
    expect(once.scene[3]?.pos.x).toBe(1029);
    const back = undo(once);
    expect(back.scene).toEqual(LIGHTHOUSE);
    expect(printCall(back.call)).toEqual([
      { op: 'block.set lighthouse#p1 /pos', value: '{"x":929,"y":618.25,"w":508,"h":99,"z":3}' },
    ]);
    const again = redo(back);
    expect(again.scene).toEqual(once.scene);
    expect(again.past).toHaveLength(1);
    expect(again.future).toHaveLength(0);
  });

  it('duplicates 16 px down and right on top of the stack, and Undo removes the copies', () => {
    const { mutations, copies } = duplicate(LIGHTHOUSE, ['h', 'p1']);
    expect(copies).toEqual(['h-2', 'p1-2']);
    const state = write(INITIAL, mutations, undefined, copies);
    expect(state.scene.map((o) => o.id)).toEqual([
      'picture',
      'plate',
      'h',
      'h-2',
      'p1',
      'p1-2',
      'credit',
    ]);
    expect(state.scene[3]?.pos).toEqual({ x: 153, y: 145, w: 508, h: 48, z: 5, rotate: 354 });
    expect(state.scene[5]?.pos.z).toBe(6);
    expect(duplicate(state.scene, ['h']).copies).toEqual(['h-2-2']);
    const back = undo(state);
    expect(back.scene).toEqual(LIGHTHOUSE);
    expect(printCall(back.call)).toEqual([
      { op: 'slide.update lighthouse' },
      { op: 'block.remove p1-2', inner: true },
      { op: 'block.remove h-2', inner: true },
    ]);
  });

  it('puts removed objects back where they were', () => {
    const state = write(INITIAL, removeAll(LIGHTHOUSE, ['h', 'p1']), undefined, []);
    expect(state.scene.map((o) => o.id)).toEqual(['picture', 'plate', 'credit']);
    const back = undo(state);
    expect(back.scene).toEqual(LIGHTHOUSE);
    expect(callInput(back.call).id).toBe('slide.update');
    const { inverse } = applyMutations(LIGHTHOUSE, removeAll(LIGHTHOUSE, ['credit']));
    expect(printCall(callFor(inverse))[0]?.op).toBe(
      'block.insert lighthouse --slot main --after p1',
    );
  });

  it('writes nothing for an empty change', () => {
    expect(write(INITIAL, [])).toBe(INITIAL);
    expect(undo(INITIAL)).toBe(INITIAL);
    expect(redo(INITIAL)).toBe(INITIAL);
  });
});
