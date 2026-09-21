// Where a table or a chart the chrome inserts lands (docs/PRODUCT.md section 2 rank 1; audit-seller
// 1; the product round, build/b3.md). Insert > Table, the table grid and Insert > Chart arrive at
// the controller with the centred default box of editor-shell.ts `insertBlockPlan` (a 960 by 320
// table, a 960 by 540 chart at the sheet centre), which put a chart over the table a seller had
// just typed. The rule here: the new object lands in the largest free rectangle of the body slot,
// the content box under the head band, kept 40 sheet px from what is there; a chart that shares
// the slot with content wants 640 by 360; the object shrinks to the rectangle when the rectangle is
// smaller, down to a minimum per kind; when no rectangle holds the minimum the slot is taken and
// the object cascades 40 by 40 from the last object, as Google's paste does, clamped inside the
// sheet. The object sits at the top of its rectangle, centred across it, so a second insert has
// the room under the first (a table centred in the body leaves two strips too thin for anything).
// Pure: the controller measures the conversion and commits; nothing here reads the DOM.
import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { canvasObjects } from '@turboslide/schema/deck';
import type { Position } from '@turboslide/schema/position';
import { CONTENT_BOX, SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import { plainText } from '@turboslide/schema/text';

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = readonly [number, number];
/** The block kinds the chrome's menus insert through `block.insert` with a default box. */
export type PlacedKind = 'table' | 'chart';

/** The room kept between a placed object, its neighbours and the head band, in sheet px. */
export const INSERT_GAP = 40;
/** The step of the cascade when the body slot is taken (Google's paste offset). */
export const CASCADE_STEP = 40;
/** The box a chart wants when it shares the body slot with content (rank 1). */
export const CHART_SHARED_SIZE: Size = [640, 360];
/**
 * The smallest box an insert takes from a free rectangle before the slot counts as taken: a
 * chart under 320 by 160 has no room for its labels and legend, a table under 480 by 120 none
 * for three rows.
 */
export const INSERT_MIN_SIZE: Readonly<Record<PlacedKind, Size>> = {
  table: [480, 120],
  chart: [320, 160],
};
/** Headings whose top sits above this line make the head band (the top third of the sheet). */
export const HEAD_BAND_LIMIT = SHEET_HEIGHT / 3;

export type Placement = {
  pos: Position;
  /** free: a free rectangle held the object; cascade: the slot was taken; centred: an empty slide with no room at all */
  how: 'free' | 'cascade' | 'centred';
  /** true when the object is smaller than it wanted to be */
  shrunk: boolean;
  /** the body slot the placement read */
  body: Rect;
};

/** The content box of the sheet (grammar.md "The sheet": 1326 by 642 at 137, 129) as a rectangle. */
export function contentRect(): Rect {
  const [x, y, w, h] = CONTENT_BOX;
  return { x, y, w, h };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function rectOf(pos: Position): Rect {
  return { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
}

/**
 * True for an object that takes room on the slide: anything but an empty text like block (a
 * placeholder's prompt is furniture, SPEC 5.4) and the background picture (a `picture` object
 * covers the sheet under everything).
 */
export function isContentObject(block: Block): boolean {
  if (block.pos === undefined) return false;
  if (block.type === 'picture') return false;
  if (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'text' ||
    block.type === 'credit'
  )
    return plainText(block.text).trim() !== '';
  return true;
}

/**
 * The body slot of a canvas slide: the content box under the head band, which is the bottom of
 * the lowest heading whose top sits in the top third of the sheet plus the gap, typed or not (an
 * empty title prompt reserves the title's place). A slide with no heading there (Blank, a
 * heading dragged down) has the whole content box as its body.
 */
export function bodyRect(slide: Slide): Rect {
  const content = contentRect();
  let bottom = content.y;
  for (const block of canvasObjects(slide)) {
    if (block.type !== 'heading' || block.pos === undefined) continue;
    if (block.pos.y >= HEAD_BAND_LIMIT) continue;
    bottom = Math.max(bottom, block.pos.y + block.pos.h);
  }
  const top = bottom === content.y ? content.y : bottom + INSERT_GAP;
  const height = content.y + content.h - top;
  if (height < INSERT_MIN_SIZE.chart[1]) return content;
  return { x: content.x, y: top, w: content.w, h: height };
}

/**
 * The rectangles the content objects take inside the body, each grown by the gap on every side
 * and clipped to the body; an object outside the body takes nothing from it.
 */
export function occupiedRects(slide: Slide, body: Rect): Rect[] {
  const out: Rect[] = [];
  for (const block of canvasObjects(slide)) {
    if (!isContentObject(block) || block.pos === undefined) continue;
    const own = rectOf(block.pos);
    if (!intersects(own, body)) continue;
    const grown: Rect = {
      x: own.x - INSERT_GAP,
      y: own.y - INSERT_GAP,
      w: own.w + 2 * INSERT_GAP,
      h: own.h + 2 * INSERT_GAP,
    };
    const x = Math.max(body.x, grown.x);
    const y = Math.max(body.y, grown.y);
    const right = Math.min(body.x + body.w, grown.x + grown.w);
    const bottom = Math.min(body.y + body.h, grown.y + grown.h);
    if (right > x && bottom > y) out.push({ x, y, w: right - x, h: bottom - y });
  }
  return out;
}

/**
 * The maximal empty rectangles of a body given the rectangles taken in it: every rectangle on
 * the grid of the taken edges that meets none of them and lies in no larger empty one. The body
 * alone when nothing is taken.
 */
export function freeRectangles(body: Rect, occupied: ReadonlyArray<Rect>): Rect[] {
  if (occupied.length === 0) return [{ ...body }];
  const xs = new Set<number>([body.x, body.x + body.w]);
  const ys = new Set<number>([body.y, body.y + body.h]);
  for (const rect of occupied) {
    for (const x of [rect.x, rect.x + rect.w]) if (x > body.x && x < body.x + body.w) xs.add(x);
    for (const y of [rect.y, rect.y + rect.h]) if (y > body.y && y < body.y + body.h) ys.add(y);
  }
  const xList = [...xs].sort((a, b) => a - b);
  const yList = [...ys].sort((a, b) => a - b);
  const empty: Rect[] = [];
  for (let i = 0; i < xList.length - 1; i += 1) {
    for (let j = i + 1; j < xList.length; j += 1) {
      const x = xList[i] as number;
      const w = (xList[j] as number) - x;
      for (let k = 0; k < yList.length - 1; k += 1) {
        for (let l = k + 1; l < yList.length; l += 1) {
          const y = yList[k] as number;
          const h = (yList[l] as number) - y;
          const candidate = { x, y, w, h };
          if (occupied.some((rect) => intersects(rect, candidate))) continue;
          empty.push(candidate);
        }
      }
    }
  }
  const contains = (outer: Rect, inner: Rect): boolean =>
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.w >= inner.x + inner.w &&
    outer.y + outer.h >= inner.y + inner.h;
  return empty.filter(
    (rect) =>
      !empty.some((other) => other !== rect && contains(other, rect) && !contains(rect, other)),
  );
}

/** The last content object of the stack, the one a cascade steps from. */
function lastContentObject(slide: Slide): Block | undefined {
  const objects = canvasObjects(slide).filter(isContentObject);
  return objects[objects.length - 1];
}

const round = (value: number): number => Math.round(value);

/**
 * The box an inserted table or chart takes on a canvas slide. `wanted` is the default box the
 * menu plan carried (its width and height); a chart that shares the slot with content wants
 * 640 by 360 at most. The object takes the free rectangle that gives it the most area, shrunk
 * to the rectangle on each axis when the rectangle is smaller, never below the kind's minimum;
 * it sits at the top of the rectangle, centred across it. When no rectangle holds the minimum
 * the slot is taken and the object cascades from the last object; an empty slide too small for
 * the minimum (never, on the 1600 by 900 sheet) centres it. `z` is left to the store action,
 * which puts the object on top of the stack.
 */
export function placeInsert(slide: Slide, kind: PlacedKind, wanted: Size): Placement {
  const body = bodyRect(slide);
  const occupied = occupiedRects(slide, body);
  const shares = occupied.length > 0;
  const [wantW, wantH] =
    shares && kind === 'chart'
      ? [Math.min(wanted[0], CHART_SHARED_SIZE[0]), Math.min(wanted[1], CHART_SHARED_SIZE[1])]
      : wanted;
  const [minW, minH] = INSERT_MIN_SIZE[kind];
  let best: { rect: Rect; w: number; h: number; score: number } | null = null;
  for (const rect of freeRectangles(body, occupied)) {
    const w = Math.min(wantW, rect.w);
    const h = Math.min(wantH, rect.h);
    if (w < minW || h < minH) continue;
    const score = w * h;
    if (
      best === null ||
      score > best.score ||
      (score === best.score &&
        (rect.y < best.rect.y || (rect.y === best.rect.y && rect.x < best.rect.x)))
    )
      best = { rect, w, h, score };
  }
  if (best !== null) {
    const { rect, w, h } = best;
    return {
      pos: { x: round(rect.x + (rect.w - w) / 2), y: round(rect.y), w: round(w), h: round(h) },
      how: 'free',
      shrunk: w < wantW || h < wantH,
      body,
    };
  }
  const last = lastContentObject(slide);
  if (last?.pos !== undefined) {
    const x = Math.max(0, Math.min(last.pos.x + CASCADE_STEP, SHEET_WIDTH - wantW));
    const y = Math.max(0, Math.min(last.pos.y + CASCADE_STEP, SHEET_HEIGHT - wantH));
    return {
      pos: { x: round(x), y: round(y), w: round(wantW), h: round(wantH) },
      how: 'cascade',
      shrunk: false,
      body,
    };
  }
  return {
    pos: {
      x: round((SHEET_WIDTH - wantW) / 2),
      y: round((SHEET_HEIGHT - wantH) / 2),
      w: round(wantW),
      h: round(wantH),
    },
    how: 'centred',
    shrunk: false,
    body,
  };
}

/** The shape of a `block.insert` input this module reads; the action's own type carries more. */
export type InsertLike = {
  slot: string;
  after?: string | undefined;
  block: { type: string; pos?: Position | undefined };
};

/**
 * True for the insert the chrome's menus make and this module places: a table or a chart with a
 * box, on top of the stack (no `after`, no `z`). An agent's insert names its own box and keeps
 * it; the controller reads the dispatch's origin before it asks.
 */
export function wantsPlacement(input: InsertLike): input is InsertLike & {
  block: { type: PlacedKind; pos: Position };
} {
  const { block } = input;
  if (block.pos === undefined || block.pos.z !== undefined) return false;
  if (input.after !== undefined) return false;
  return block.type === 'table' || block.type === 'chart';
}
