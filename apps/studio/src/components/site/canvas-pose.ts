import {
  axisLock,
  boundingBox,
  boxSnapLines,
  normalizeRotation,
  positionBox,
  reorderZ,
  rotatePositions,
  rotationFromDrag,
  round64,
  scalePositions,
  sheetEdgeLines,
  sheetSnapLines,
  snapMove,
  snapResize,
  sortByZ,
  unionBox,
} from '@turboslide/schema/geometry';
import type { OrderMove, ResizeHandle, SnapLine } from '@turboslide/schema/geometry';

import { CANVAS_SCREEN } from './copy';

/**
 * The Canvas screen's slide as data and the editor's canvas arithmetic over it (CanvasScreen.tsx):
 * the lighthouse slide's blocks, what a move, a resize, a turn, a nudge, a duplicate, a delete and
 * an order write, the undo record, and the action call the editor sends for each, which the screen
 * prints under the slide.
 *
 * The arithmetic is the product's own, from @turboslide/schema/geometry: the sheet's snap lines,
 * `snapMove` with the equal spacing snap, `snapResize` over the schema's `resizeBox`,
 * `rotationFromDrag`, `boundingBox`, `unionBox`, `rotatePositions`, `scalePositions`, `sortByZ`
 * and `reorderZ`, the functions the editor's Gestures.tsx, snap.ts and rotate.ts and the schema's
 * freeform.ts read. That module imports no zod and no shape table, which graph.test.ts keeps off
 * /home. This module adds what the editor composes from them (viewer Gestures.tsx freeGesture,
 * Freeform.tsx freeNudgeMutations, scaleGroupMutations and zOrderMutations, Editor.tsx
 * freeContextFor) over the screen's own slide: canvas-pose.test.ts runs every gesture here and
 * through those functions on the same slide and asserts the two calls agree.
 */

/** A box in slide px: x, y, width, height. */
export type Box = readonly [number, number, number, number];
export type Point = { x: number; y: number };

/** An object's place on the 1600 by 900 slide as the document holds it (packages/schema position.ts). */
export type Pos = { x: number; y: number; w: number; h: number; z?: number; rotate?: number };

export type ObjectType = 'picture' | 'box' | 'heading' | 'paragraph' | 'credit';

/** One block of the slide: its id, its type, its place, and its other fields as the document holds them. */
export type SlideObject = {
  id: string;
  type: ObjectType;
  pos: Pos;
  fields: Readonly<Record<string, unknown>>;
};

/** The slide's blocks in document order (the freeform slot `main`). */
export type Scene = readonly SlideObject[];

export const SLIDE_ID = 'lighthouse';

const { slide } = CANVAS_SCREEN;

/**
 * The lighthouse slide (docs/SITE.md 9) as the Turboslide CLI converted it (2026.1008.3, built at
 * 417fd808, on a copy of `apps/studio/home-deck`): `slide to-canvas lighthouse` placed every block
 * at its measured box (home-deck/recorded/lighthouse-canvas.json), the heading was moved off the
 * plate and turned to 354 degrees, and the plate's group tag is removed as Arrange > Ungroup
 * writes it, so each object selects on its own. The picture covers the slide and is the slide's
 * ground here: it takes no selection, so a press on it clears the selection or starts a marquee.
 */
export const LIGHTHOUSE: Scene = [
  {
    id: 'picture',
    type: 'picture',
    pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
    fields: { asset: 'mood-lighthouse', side: 'lower-right' },
  },
  {
    id: 'plate',
    type: 'box',
    pos: { x: 903, y: 536.734375, w: 560, h: 234.265625, z: 1 },
    fields: {
      fill: 'paper',
      strokeWidth: 0,
      padding: { top: 22, right: 26, bottom: 20, left: 26 },
    },
  },
  {
    id: 'h',
    type: 'heading',
    pos: { x: 137, y: 129, w: 508, h: 48, z: 2, rotate: 354 },
    fields: { level: 'title', text: slide.heading, autofit: 'shrink' },
  },
  {
    id: 'p1',
    type: 'paragraph',
    pos: { x: 929, y: 618.25, w: 508, h: 99, z: 3 },
    fields: { text: slide.paragraph, marginTop: 12, autofit: 'shrink' },
  },
  {
    id: 'credit',
    type: 'credit',
    pos: { x: 929, y: 729.25, w: 508, h: 21.75, z: 4 },
    fields: { text: slide.credit },
  },
];

/** A text object's ring stands this far off its box (viewer text-ring.ts TEXT_RING_OUTSET). */
export const RING_OUTSET = 10;
/** A copy sits this far right and down of its original (store-actions.ts DUPLICATE_OFFSET_PX). */
export const DUPLICATE_OFFSET = 16;

const TEXT_TYPES: ReadonlySet<ObjectType> = new Set(['heading', 'paragraph', 'credit']);

/** The picture is the slide's ground on this screen: never selected, moved or hit by a marquee. */
export function isGround(object: SlideObject): boolean {
  return object.type === 'picture';
}

export function objectById(scene: Scene, id: string): SlideObject | undefined {
  return scene.find((object) => object.id === id);
}

/** The objects a selection can hold, in document order. */
export function selectableIds(scene: Scene): string[] {
  return scene.filter((object) => !isGround(object)).map((object) => object.id);
}

// ---------------------------------------------------------------------------------------------
// Boxes

/** The axis aligned box of a turned position, as a box (viewer Freeform.tsx boundingBoxOf). */
function boundsOf(pos: Pos): Box {
  return positionBox(boundingBox(pos));
}

/** A box and the turn it is drawn at, about its centre. */
export type Placed = { box: Box; rotate: number };

/** The selection ring of one object: its box, 10 px out for a text object, at its turn. */
export function ringOf(object: SlideObject): Placed {
  const { x, y, w, h } = object.pos;
  const d = TEXT_TYPES.has(object.type) ? RING_OUTSET : 0;
  return {
    box: [x - d, y - d, w + 2 * d, h + 2 * d],
    rotate: normalizeRotation(object.pos.rotate ?? 0),
  };
}

/** An object's own box at its turn. */
export function placeOf(object: SlideObject): Placed {
  const { x, y, w, h } = object.pos;
  return { box: [x, y, w, h], rotate: normalizeRotation(object.pos.rotate ?? 0) };
}

/**
 * The frame the handles sit on (viewer Gestures.tsx canvasHandles): one object's ring at its
 * turn, or the unturned union of several objects' bounding boxes.
 */
export function frameOf(scene: Scene, ids: readonly string[]): Placed | null {
  const objects = ids.flatMap((id) => objectById(scene, id) ?? []);
  const [only] = objects;
  if (only === undefined) return null;
  if (objects.length === 1) return ringOf(only);
  return { box: unionBox(objects.map((object) => object.pos)), rotate: 0 };
}

/** Each object's paint rank: z ascending, document order breaking ties (schema sortByZ). */
export function paintRanks(scene: Scene): Map<string, number> {
  return new Map(sortByZ(scene).map((object, rank) => [object.id, rank]));
}

// ---------------------------------------------------------------------------------------------
// Snap lines (Editor.tsx freeContextFor)

/** The slide's own snap lines in the editor's order: the sheet's edges and centre, its guides. */
export const SHEET_LINES: readonly SnapLine[] = [...sheetEdgeLines(), ...sheetSnapLines()];

/** What a gesture on `ids` snaps to: the sheet's lines and the other objects' lines and boxes. */
export type SnapContext = { lines: SnapLine[]; spacing: Box[] };

export function snapContext(scene: Scene, ids: readonly string[]): SnapContext {
  const lines = [...SHEET_LINES];
  const spacing: Box[] = [];
  for (const object of scene) {
    if (ids.includes(object.id)) continue;
    const box = boundsOf(object.pos);
    lines.push(...boxSnapLines(box));
    spacing.push(box);
  }
  return { lines, spacing };
}

// ---------------------------------------------------------------------------------------------
// Turn and scale (viewer rotate.ts rotateMutations, Freeform.tsx scaleGroupMutations)

function withRotate(pos: Pos, degrees: number): Pos {
  const rotate = normalizeRotation(degrees);
  const next: Pos = { ...pos };
  if (rotate === 0) delete next.rotate;
  else next.rotate = rotate;
  return next;
}

/** A scaled position on the half px grid, as the editor writes a group's resize. */
function halfPixels(pos: Pos): Pos {
  return {
    ...pos,
    x: Math.round(pos.x * 2) / 2,
    y: Math.round(pos.y * 2) / 2,
    w: Math.max(1, Math.round(pos.w * 2) / 2),
    h: Math.max(1, Math.round(pos.h * 2) / 2),
  };
}

// ---------------------------------------------------------------------------------------------
// Mutations, the action call and the undo record

/** The writes this screen makes, as packages/schema mutations.ts spells them (the slide id is SLIDE_ID). */
export type Mutation =
  | { op: 'block.set'; blockId: string; path: '/pos'; value: Pos }
  | { op: 'block.set'; blockId: string; path: '/pos/z'; value: number }
  | { op: 'block.remove'; blockId: string }
  | { op: 'block.insert'; after?: string; block: SlideObject };

/**
 * The action call the editor sends: one mutation is its own action and several travel as one
 * `slide.update` (viewer Gestures.tsx actionForMutations); Cmd D and the order keys send their
 * own actions (editor-shell.ts, Editor.tsx).
 */
export type Call =
  | { id: 'block.set' | 'block.remove' | 'block.insert'; mutation: Mutation }
  | { id: 'slide.update'; mutations: readonly Mutation[] }
  | { id: 'block.duplicate'; blockIds: readonly string[] }
  | { id: 'block.order'; blockId: string; move: OrderMove };

export function callFor(mutations: readonly Mutation[]): Call {
  const [first, ...rest] = mutations;
  if (first === undefined) throw new RangeError('callFor: no mutations');
  if (rest.length > 0) return { id: 'slide.update', mutations };
  return { id: first.op, mutation: first };
}

/** A position with its keys in the schema's order: x, y, w, h, z, rotate. */
function canonical(pos: Pos): Pos {
  return {
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    ...(pos.z === undefined ? {} : { z: pos.z }),
    ...(pos.rotate === undefined ? {} : { rotate: pos.rotate }),
  };
}

/** A block as the document holds it: its id, its pos, its type, its other fields. */
export function blockJson(object: SlideObject): Record<string, unknown> {
  return { id: object.id, pos: canonical(object.pos), type: object.type, ...object.fields };
}

function mutationInput(m: Mutation): Record<string, unknown> {
  switch (m.op) {
    case 'block.set':
      return {
        op: m.op,
        slideId: SLIDE_ID,
        blockId: m.blockId,
        path: m.path,
        value: m.path === '/pos' ? canonical(m.value) : m.value,
      };
    case 'block.remove':
      return { op: m.op, slideId: SLIDE_ID, blockId: m.blockId };
    case 'block.insert':
      return {
        op: m.op,
        slideId: SLIDE_ID,
        slot: 'main',
        ...(m.after === undefined ? {} : { after: m.after }),
        block: blockJson(m.block),
      };
  }
}

/** The call's action id and input as the editor sends them, without the base revision. */
export function callInput(call: Call): { id: string; input: Record<string, unknown> } {
  switch (call.id) {
    case 'slide.update':
      return {
        id: call.id,
        input: { slideId: SLIDE_ID, mutations: call.mutations.map(mutationInput) },
      };
    case 'block.duplicate':
      return { id: call.id, input: { slideId: SLIDE_ID, blockIds: [...call.blockIds] } };
    case 'block.order':
      return { id: call.id, input: { slideId: SLIDE_ID, blockId: call.blockId, move: call.move } };
    default: {
      const { op: _op, ...input } = mutationInput(call.mutation);
      return { id: call.id, input };
    }
  }
}

/** One printed line: the action and its target, then the value it writes. */
export type PrintLine = { op: string; value?: string; inner?: boolean };

function mutationLine(m: Mutation, target: string): PrintLine {
  switch (m.op) {
    case 'block.set':
      return {
        op: `block.set ${target}${m.blockId} ${m.path}`,
        value: JSON.stringify(m.path === '/pos' ? canonical(m.value) : m.value),
      };
    case 'block.remove':
      return { op: `block.remove ${target}${m.blockId}` };
    case 'block.insert':
      return {
        op: `block.insert ${target === '' ? '' : `${SLIDE_ID} `}--slot main${m.after === undefined ? '' : ` --after ${m.after}`}`,
        value: JSON.stringify(blockJson(m.block)),
      };
  }
}

/**
 * The call as the screen prints it, in the CLI's spelling with the action id for the command
 * (`turboslide block set <slideId>#<blockId> <path> <value>` prints as `block.set lighthouse#h
 * /pos {...}`); a `slide.update` prints its mutations one per line under it.
 */
export function printCall(call: Call): PrintLine[] {
  switch (call.id) {
    case 'slide.update':
      return [
        { op: `slide.update ${SLIDE_ID}` },
        ...call.mutations.map((m) => ({ ...mutationLine(m, ''), inner: true })),
      ];
    case 'block.duplicate':
      return [{ op: `block.duplicate ${SLIDE_ID} --blocks ${call.blockIds.join(',')}` }];
    case 'block.order':
      return [{ op: `block.order ${SLIDE_ID}#${call.blockId} --move ${call.move}` }];
    default:
      return [mutationLine(call.mutation, `${SLIDE_ID}#`)];
  }
}

/** The scene after the mutations, and the mutations that put it back, in the order they run. */
export function applyMutations(
  scene: Scene,
  mutations: readonly Mutation[],
): { scene: Scene; inverse: Mutation[] } {
  let next = [...scene];
  const inverse: Mutation[] = [];
  for (const m of mutations) {
    const index = next.findIndex(
      (object) => object.id === ('blockId' in m ? m.blockId : m.block.id),
    );
    const current = next[index];
    if (m.op === 'block.insert') {
      if (current !== undefined) continue;
      const at = m.after === undefined ? 0 : next.findIndex((object) => object.id === m.after) + 1;
      next.splice(at, 0, m.block);
      inverse.unshift({ op: 'block.remove', blockId: m.block.id });
      continue;
    }
    if (current === undefined) continue;
    if (m.op === 'block.remove') {
      const after = next[index - 1]?.id;
      next = next.filter((object) => object.id !== m.blockId);
      inverse.unshift({
        op: 'block.insert',
        ...(after === undefined ? {} : { after }),
        block: current,
      });
    } else if (m.path === '/pos') {
      next[index] = { ...current, pos: m.value };
      inverse.unshift({ op: 'block.set', blockId: m.blockId, path: '/pos', value: current.pos });
    } else {
      next[index] = { ...current, pos: { ...current.pos, z: m.value } };
      inverse.unshift(
        current.pos.z === undefined
          ? { op: 'block.set', blockId: m.blockId, path: '/pos', value: current.pos }
          : { op: 'block.set', blockId: m.blockId, path: '/pos/z', value: current.pos.z },
      );
    }
  }
  return { scene: next, inverse };
}

/** One step of the undo record: the write and its inverse. */
export type Entry = { mutations: readonly Mutation[]; inverse: readonly Mutation[] };
/** The undo record keeps this many steps. */
export const HISTORY_DEPTH = 100;

/** Everything the screen draws: the slide, the selection, the last call and the undo record. */
export type CanvasState = {
  scene: Scene;
  selected: readonly string[];
  call: Call;
  past: readonly Entry[];
  future: readonly Entry[];
  /** counts the writes, undos and redos, so the printed call is drawn afresh after each */
  seq: number;
};

function posSet(blockId: string, value: Pos): Mutation {
  return { op: 'block.set', blockId, path: '/pos', value };
}

/** The screen at load: the heading selected and the line under the slide its `/pos`. */
export const INITIAL: CanvasState = {
  scene: LIGHTHOUSE,
  selected: ['h'],
  call: callFor([posSet('h', (objectById(LIGHTHOUSE, 'h') as SlideObject).pos)]),
  past: [],
  future: [],
  seq: 0,
};

function existing(scene: Scene, ids: readonly string[]): string[] {
  return ids.filter((id) => objectById(scene, id) !== undefined);
}

/** A write: the mutations applied, recorded for Undo, and the call printed. */
export function write(
  state: CanvasState,
  mutations: readonly Mutation[],
  call?: Call,
  selected: readonly string[] = state.selected,
): CanvasState {
  if (mutations.length === 0) return state;
  const { scene, inverse } = applyMutations(state.scene, mutations);
  return {
    scene,
    selected: existing(scene, selected),
    call: call ?? callFor(mutations),
    past: [...state.past, { mutations, inverse }].slice(-HISTORY_DEPTH),
    future: [],
    seq: state.seq + 1,
  };
}

/** Undo writes the inverse forward, as the editor does, and prints that write. */
export function undo(state: CanvasState): CanvasState {
  const entry = state.past[state.past.length - 1];
  if (entry === undefined) return state;
  const { scene } = applyMutations(state.scene, entry.inverse);
  return {
    scene,
    selected: existing(scene, state.selected),
    call: callFor(entry.inverse),
    past: state.past.slice(0, -1),
    future: [...state.future, entry],
    seq: state.seq + 1,
  };
}

/** Redo writes the mutations again and prints them. */
export function redo(state: CanvasState): CanvasState {
  const entry = state.future[state.future.length - 1];
  if (entry === undefined) return state;
  const { scene } = applyMutations(state.scene, entry.mutations);
  return {
    scene,
    selected: existing(scene, state.selected),
    call: callFor(entry.mutations),
    past: [...state.past, entry],
    future: state.future.slice(0, -1),
    seq: state.seq + 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Gestures (viewer Gestures.tsx freeGesture) and keys

export type Mods = { shift: boolean; alt?: boolean; meta?: boolean };
export type Gesture = { mutations: Mutation[]; guides: SnapLine[] };

type Row = { id: string; type: ObjectType; pos: Pos };

function rowsOf(scene: Scene, ids: readonly string[]): Row[] {
  return ids.flatMap((id) => {
    const object = objectById(scene, id);
    return object === undefined || isGround(object)
      ? []
      : [{ id, type: object.type, pos: object.pos }];
  });
}

function samePos(a: Pos, b: Pos): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    (a.z ?? 0) === (b.z ?? 0) &&
    (a.rotate ?? 0) === (b.rotate ?? 0)
  );
}

function changed(rows: readonly Row[], next: readonly Pos[]): Mutation[] {
  return rows.flatMap((row, index) => {
    const pos = next[index];
    return pos === undefined || samePos(pos, row.pos) ? [] : [posSet(row.id, pos)];
  });
}

/**
 * A drag of the selection by (dx, dy) slide px: the union of its bounding boxes snaps and every
 * object moves by the same offset; Shift keeps one axis, Cmd skips the snaps. Null when nothing
 * moves. The grid is off, as the editor's is unless Snap to > Grid is on.
 */
export function moveGesture(
  scene: Scene,
  ids: readonly string[],
  dx: number,
  dy: number,
  mods: Mods,
): Gesture | null {
  if (dx === 0 && dy === 0) return null;
  const rows = rowsOf(scene, ids);
  if (rows.length === 0) return null;
  const delta = mods.shift ? axisLock(dx, dy) : { dx, dy };
  const context = mods.meta === true ? null : snapContext(scene, ids);
  const union = unionBox(rows.map((row) => row.pos));
  const snapped = snapMove(union, delta.dx, delta.dy, context?.lines ?? [], {
    grid: false,
    ...(context === null ? {} : { spacing: context.spacing }),
  });
  const sdx = round64(snapped.box[0] - union[0]);
  const sdy = round64(snapped.box[1] - union[1]);
  if (sdx === 0 && sdy === 0) return null;
  return {
    mutations: rows.map(({ id, pos }) => posSet(id, { ...pos, x: pos.x + sdx, y: pos.y + sdy })),
    guides: snapped.guides,
  };
}

/**
 * A drag of one of the eight handles: one object resizes along its own axes, several scale with
 * their union; Shift keeps the ratio, Alt resizes about the centre, Cmd skips the snaps.
 */
export function resizeGesture(
  scene: Scene,
  ids: readonly string[],
  dir: ResizeHandle,
  dx: number,
  dy: number,
  mods: Mods,
): Gesture | null {
  if (dx === 0 && dy === 0) return null;
  const rows = rowsOf(scene, ids);
  const [anchor] = rows;
  if (anchor === undefined) return null;
  const lines = mods.meta === true ? [] : snapContext(scene, ids).lines;
  const options = { aspect: mods.shift, alt: mods.alt === true, grid: false };
  if (rows.length > 1) {
    const union = unionBox(rows.map((row) => row.pos));
    const snapped = snapResize(union, dir, dx, dy, lines, { ...options, kind: 'group' });
    const mutations = changed(
      rows,
      scalePositions(
        rows.map((row) => row.pos),
        snapped.box,
      ).map(halfPixels),
    );
    return mutations.length === 0 ? null : { mutations, guides: snapped.guides };
  }
  const { x: ax, y: ay, w: aw, h: ah } = anchor.pos;
  const snapped = snapResize([ax, ay, aw, ah], dir, dx, dy, lines, {
    ...options,
    rotation: normalizeRotation(anchor.pos.rotate ?? 0),
    kind: anchor.type,
  });
  const [x, y, w, h] = snapped.box;
  if (x === ax && y === ay && w === aw && h === ah) return null;
  return { mutations: [posSet(anchor.id, { ...anchor.pos, x, y, w, h })], guides: snapped.guides };
}

/**
 * A drag of the turn handle from `from` to `to` (slide px): one object turns about its centre to
 * whole degrees, several turn about their union's centre; Shift steps 15 degrees.
 */
export function turnGesture(
  scene: Scene,
  ids: readonly string[],
  from: Point,
  to: Point,
  mods: Mods,
): Gesture | null {
  if (from.x === to.x && from.y === to.y) return null;
  const rows = rowsOf(scene, ids);
  const [anchor] = rows;
  if (anchor === undefined) return null;
  const positions = rows.map((row) => row.pos);
  const [ux, uy, uw, uh] = unionBox(positions);
  const centre = { x: ux + uw / 2, y: uy + uh / 2 };
  const start = rows.length === 1 ? normalizeRotation(anchor.pos.rotate ?? 0) : 0;
  const angle = rotationFromDrag(start, centre, from, to, { shift: mods.shift });
  const next =
    rows.length === 1
      ? [withRotate(anchor.pos, angle)]
      : rotatePositions(positions, angle, 'selection');
  const mutations = changed(rows, next);
  return mutations.length === 0 ? null : { mutations, guides: [] };
}

/** The arrows: the selection moves 1 px, 10 px with Shift, without a snap. */
export function nudge(scene: Scene, ids: readonly string[], dx: number, dy: number): Mutation[] {
  if (dx === 0 && dy === 0) return [];
  return rowsOf(scene, ids).map(({ id, pos }) =>
    posSet(id, { ...pos, x: pos.x + dx, y: pos.y + dy }),
  );
}

/** The turn handle's arrows: the selection turns by `by` degrees, several about their union. */
export function turnBy(scene: Scene, ids: readonly string[], by: number): Mutation[] {
  const rows = rowsOf(scene, ids);
  return changed(
    rows,
    rotatePositions(
      rows.map((row) => row.pos),
      by,
      'selection',
    ),
  );
}

/** Home on the turn handle: every selected object back to no turn. */
export function turnHome(scene: Scene, ids: readonly string[]): Mutation[] {
  const rows = rowsOf(scene, ids);
  return changed(
    rows,
    rows.map((row) => withRotate(row.pos, 0)),
  );
}

/** Delete: one `block.remove` per selected object. */
export function removeAll(scene: Scene, ids: readonly string[]): Mutation[] {
  return rowsOf(scene, ids).map(({ id }): Mutation => ({ op: 'block.remove', blockId: id }));
}

/** The first free id from `base`: `h-2`, then `h-2-2` (viewer clipboard.ts freeId). */
function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Cmd D (store-actions.ts blockDuplicate): each copy takes `<id>-2`, sits 16 px right and down on
 * top of the stack, right after its original. The call is `block.duplicate`; the write is the
 * inserts, and Undo removes the copies.
 */
export function duplicate(
  scene: Scene,
  ids: readonly string[],
): { call: Call; mutations: Mutation[]; copies: string[] } {
  const rows = rowsOf(scene, ids);
  const taken = new Set(scene.map((object) => object.id));
  let z = Math.max(0, ...scene.map((object) => object.pos.z ?? 0));
  const mutations: Mutation[] = [];
  const copies: string[] = [];
  for (const { id } of rows) {
    const source = objectById(scene, id) as SlideObject;
    const copyId = freeId(`${id}-2`, taken);
    taken.add(copyId);
    z += 1;
    const pos = {
      ...source.pos,
      x: source.pos.x + DUPLICATE_OFFSET,
      y: source.pos.y + DUPLICATE_OFFSET,
      z,
    };
    mutations.push({ op: 'block.insert', after: id, block: { ...source, id: copyId, pos } });
    copies.push(copyId);
  }
  return {
    call: { id: 'block.duplicate', blockIds: rows.map((row) => row.id) },
    mutations,
    copies,
  };
}

/**
 * One move through the stack (schema reorderZ, viewer Freeform.tsx zOrderMutations): the stack is
 * renumbered 0 up in paint order and every object whose z changes gets one `block.set /pos/z`.
 */
export function order(scene: Scene, id: string, move: OrderMove): Mutation[] {
  if (objectById(scene, id) === undefined) return [];
  const stack = reorderZ(scene, id, move);
  return scene.flatMap((object): Mutation[] => {
    const z = stack[object.id];
    return z === undefined || z === object.pos.z
      ? []
      : [{ op: 'block.set', blockId: object.id, path: '/pos/z', value: z }];
  });
}

/** The rectangle between the press and the pointer. */
export function marqueeBox(start: Point, now: Point): Box {
  return [
    Math.min(start.x, now.x),
    Math.min(start.y, now.y),
    Math.abs(now.x - start.x),
    Math.abs(now.y - start.y),
  ];
}

/** The objects whose bounding boxes a marquee crosses, in document order. */
export function marqueeHits(scene: Scene, box: Box): string[] {
  if (box[2] <= 0 && box[3] <= 0) return [];
  return scene
    .filter((object) => {
      if (isGround(object)) return false;
      const b = boundsOf(object.pos);
      return (
        box[0] < b[0] + b[2] &&
        box[0] + box[2] > b[0] &&
        box[1] < b[1] + b[3] &&
        box[1] + box[3] > b[1]
      );
    })
    .map((object) => object.id);
}
