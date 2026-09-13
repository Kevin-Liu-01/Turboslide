// Connector attachment (gslides-parity SPEC-2 2.4.7, 0.65, 0.103, 0.107): a connector's end
// snapped to a shape's connection site records `connect.start` or `connect.end` as the target's
// block id and the index of the site; a move, resize, rotate or flip of the target rewrites the
// attached ends in the same write through `followConnectors`, so a connector never detaches on a
// move and the CLI behaves as the editor. A target's sites are the preset's `cxnLst` (shapes.ts
// `sites`, rectangle stubs until the geometry interpreter lands) in unrotated coordinates, rotated
// about the target's centre and mirrored by its flip before an end is placed. Removing the target
// clears the attachment on its connectors; duplicating a target with its connectors renames the
// references; a connector alone drops them. Pure over the document; the editor's gesture end, the
// Size & rotation fields, block.align, block.distribute, block.rotate, block.flip and the store
// action handlers of block.set /pos call it.
import type { Block, ShapeBlock, ShapeOrientation } from './blocks.ts';
import type { Slide } from './deck.ts';
import { canvasObjects } from './deck.ts';
import type { BlockId } from './ids.ts';
import type { Mutation } from './mutations.ts';
import type { Position } from './position.ts';
import { normalizeRotation } from './position.ts';
import { isConnectorKind, isLineKind, rectSites, shapeAdjustDefaults, sites } from './shapes.ts';

export type Point = { x: number; y: number };

/** A connector: a shape block of a line kind whose ends may attach (SPEC-2 2.4.7). */
export function isConnector(block: Block): block is ShapeBlock {
  return block.type === 'shape' && isConnectorKind(block.shape);
}

/** True for a block a connector may attach to: positioned and not a line kind. */
export function canAttach(block: Block): boolean {
  if (block.pos === undefined) return false;
  if (block.type === 'shape') return !isLineKind(block.shape);
  return true;
}

/** The connection sites of a target in its own unrotated box: the preset's list, or the eight of a rectangle. */
function ownSites(block: Block, pos: Position): Point[] {
  if (block.type === 'shape')
    return sites(block.shape, pos.w, pos.h, block.adjust ?? shapeAdjustDefaults(block.shape)).map(
      ({ x, y }) => ({ x, y }),
    );
  return rectSites(pos.w, pos.h).map(({ x, y }) => ({ x, y }));
}

/** How many connection sites a target offers (what `connect.site` is checked against). */
export function siteCount(block: Block): number {
  if (block.pos === undefined) return 0;
  return ownSites(block, block.pos).length;
}

/** A point of a box rotated about the box centre and mirrored by its flip, in sheet pixels (0.107). */
function placeOnTarget(point: Point, pos: Position): Point {
  let x = point.x;
  let y = point.y;
  if (pos.flip === 'h' || pos.flip === 'hv') x = pos.w - x;
  if (pos.flip === 'v' || pos.flip === 'hv') y = pos.h - y;
  const angle = normalizeRotation(pos.rotate ?? 0);
  const cx = pos.w / 2;
  const cy = pos.h / 2;
  if (angle !== 0) {
    const rad = (angle * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }
  return { x: pos.x + x, y: pos.y + y };
}

/** The connection sites of a target in sheet pixels, rotated and mirrored as it is drawn (0.107). */
export function targetSites(block: Block): Point[] {
  if (block.pos === undefined) return [];
  const pos = block.pos;
  return ownSites(block, pos).map((point) => placeOnTarget(point, pos));
}

/** One site of a target in sheet pixels, or undefined when the index is out of range. */
export function siteAt(block: Block, site: number): Point | undefined {
  return targetSites(block)[site];
}

/** The site of a target nearest to a point, with its distance; undefined for a target with none. */
export function nearestSite(
  block: Block,
  point: Point,
): { site: number; point: Point; distance: number } | undefined {
  let best: { site: number; point: Point; distance: number } | undefined;
  targetSites(block).forEach((candidate, site) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (best === undefined || distance < best.distance) best = { site, point: candidate, distance };
  });
  return best;
}

/** The orientation a line kind resolves to when none is written (primitives.ts `lineEnds`). */
export function resolvedOrientation(
  pos: Position,
  orientation: ShapeOrientation | undefined,
): ShapeOrientation {
  return orientation ?? (pos.w >= pos.h ? 'horizontal' : 'vertical');
}

/**
 * The two ends of a connector in sheet pixels, start then end, as the renderer draws them: a
 * horizontal line runs left to right along the box's middle, a vertical one top to bottom down
 * its centre, `diagonal-down` from the top left to the bottom right corner, `diagonal-up` from
 * the bottom left to the top right.
 */
export function connectorEnds(
  block: ShapeBlock,
  pos: Position = requirePos(block),
): { start: Point; end: Point } {
  switch (resolvedOrientation(pos, block.orientation)) {
    case 'horizontal':
      return {
        start: { x: pos.x, y: pos.y + pos.h / 2 },
        end: { x: pos.x + pos.w, y: pos.y + pos.h / 2 },
      };
    case 'vertical':
      return {
        start: { x: pos.x + pos.w / 2, y: pos.y },
        end: { x: pos.x + pos.w / 2, y: pos.y + pos.h },
      };
    case 'diagonal-down':
      return { start: { x: pos.x, y: pos.y }, end: { x: pos.x + pos.w, y: pos.y + pos.h } };
    case 'diagonal-up':
      return { start: { x: pos.x, y: pos.y + pos.h }, end: { x: pos.x + pos.w, y: pos.y } };
  }
}

function requirePos(block: Block): Position {
  if (block.pos === undefined) throw new RangeError(`Block "${block.id}" has no position box`);
  return block.pos;
}

/** The cross axis size an axis aligned line keeps (the head size of an arrow); 8 when the box has none. */
const MIN_THICKNESS = 8;

/**
 * The box and orientation of a connector between two points (SPEC-2 2.4.7): the line's box spans
 * the points; an axis aligned line keeps its current thickness centred on the line so its heads
 * keep their size. When the points run right to left (or bottom to top for a vertical line) the
 * orientation cannot express the direction, so `swapped` is true and the caller exchanges the
 * start and end fields (the attachments and the decorations), which draws the same picture.
 */
export function connectorBetween(
  current: ShapeBlock,
  start: Point,
  end: Point,
): { pos: Position; orientation: ShapeOrientation; swapped: boolean } {
  const pos = requirePos(current);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const from = { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
  const keep = (key: 'z' | 'group' | 'rotate' | 'flip'): Partial<Position> =>
    pos[key] !== undefined ? { [key]: pos[key] } : {};
  const extras: Partial<Position> = { ...keep('z'), ...keep('group') };
  const orientation = resolvedOrientation(pos, current.orientation);
  const wasHorizontal = orientation === 'horizontal';
  const wasVertical = orientation === 'vertical';
  if (Math.abs(dy) < 1) {
    const thickness = wasHorizontal ? Math.max(1, from.h) : MIN_THICKNESS;
    const left = Math.min(start.x, end.x);
    return {
      pos: {
        x: left,
        y: start.y - thickness / 2,
        w: Math.max(1, Math.abs(dx)),
        h: thickness,
        ...extras,
      },
      orientation: 'horizontal',
      swapped: dx < 0,
    };
  }
  if (Math.abs(dx) < 1) {
    const thickness = wasVertical ? Math.max(1, from.w) : MIN_THICKNESS;
    const top = Math.min(start.y, end.y);
    return {
      pos: {
        x: start.x - thickness / 2,
        y: top,
        w: thickness,
        h: Math.max(1, Math.abs(dy)),
        ...extras,
      },
      orientation: 'vertical',
      swapped: dy < 0,
    };
  }
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const down = dx * dy > 0;
  return {
    pos: { x, y, w: Math.abs(dx), h: Math.abs(dy), ...extras },
    orientation: down ? 'diagonal-down' : 'diagonal-up',
    swapped: dx < 0,
  };
}

/** The connector's fields after its ends land on two points: `pos`, `orientation`, and the start and end fields exchanged when the direction reversed. */
export function connectorFieldsBetween(
  current: ShapeBlock,
  start: Point,
  end: Point,
  connect: ShapeBlock['connect'],
): Partial<ShapeBlock> & { pos: Position } {
  const placed = connectorBetween(current, start, end);
  const out: Partial<ShapeBlock> & { pos: Position } = {
    pos: roundPos(placed.pos),
    orientation: placed.orientation,
  };
  let nextConnect = connect;
  if (placed.swapped) {
    nextConnect = swapEnds(connect);
    if (current.lineStart !== undefined || current.lineEnd !== undefined) {
      out.lineStart = current.lineEnd;
      out.lineEnd = current.lineStart;
    }
    if (current.arrowheads !== undefined) {
      out.arrowheads =
        current.arrowheads === 'start'
          ? 'end'
          : current.arrowheads === 'end'
            ? 'start'
            : current.arrowheads;
    }
  }
  out.connect = nextConnect;
  return out;
}

function swapEnds(connect: ShapeBlock['connect']): ShapeBlock['connect'] {
  if (connect === undefined) return undefined;
  const out: NonNullable<ShapeBlock['connect']> = {};
  if (connect.end !== undefined) out.start = connect.end;
  if (connect.start !== undefined) out.end = connect.start;
  return out;
}

function roundPos(pos: Position): Position {
  return {
    ...pos,
    x: Math.round(pos.x * 2) / 2,
    y: Math.round(pos.y * 2) / 2,
    w: Math.round(pos.w * 2) / 2,
    h: Math.round(pos.h * 2) / 2,
  };
}

/** True when the connector's attached ends lie on their sites within the tolerance (the validator's check). */
export function attachedEndsOnSites(
  connector: ShapeBlock,
  byId: ReadonlyMap<string, Block>,
  tolerance = 1,
): { end: 'start' | 'end'; distance: number }[] {
  const out: { end: 'start' | 'end'; distance: number }[] = [];
  if (connector.connect === undefined || connector.pos === undefined) return out;
  const ends = connectorEnds(connector);
  for (const which of ['start', 'end'] as const) {
    const attachment = connector.connect[which];
    if (attachment === undefined) continue;
    const target = byId.get(attachment.block);
    if (target === undefined) continue;
    const site = siteAt(target, attachment.site);
    if (site === undefined) continue;
    const point = ends[which];
    const distance = Math.hypot(point.x - site.x, point.y - site.y);
    if (distance > tolerance) out.push({ end: which, distance });
  }
  return out;
}

/**
 * The `block.set` mutations that put each attached end of every connector attached to one of
 * `movedIds` back on its target's site (SPEC-2 2.4.7), reading the slide as it is after the move.
 * A connector both of whose ends move keeps its shape; one end moving rewrites `pos` and
 * `orientation` in one `block.set` each, so the follow travels in the gesture's write.
 */
export function followConnectors(slide: Slide, movedIds: ReadonlyArray<BlockId>): Mutation[] {
  const objects = canvasObjects(slide);
  const byId = new Map(objects.map((block) => [block.id, block]));
  const moved = new Set(movedIds);
  const out: Mutation[] = [];
  for (const block of objects) {
    if (!isConnector(block) || block.connect === undefined || block.pos === undefined) continue;
    if (moved.has(block.id)) continue;
    const start = block.connect.start;
    const end = block.connect.end;
    const startMoved = start !== undefined && moved.has(start.block);
    const endMoved = end !== undefined && moved.has(end.block);
    if (!startMoved && !endMoved) continue;
    const ends = connectorEnds(block);
    const startPoint =
      start !== undefined ? siteAt(byId.get(start.block) ?? block, start.site) : undefined;
    const endPoint = end !== undefined ? siteAt(byId.get(end.block) ?? block, end.site) : undefined;
    const fields = connectorFieldsBetween(
      block,
      startPoint ?? ends.start,
      endPoint ?? ends.end,
      block.connect,
    );
    for (const [path, value] of Object.entries(fields)) {
      const current = (block as unknown as Record<string, unknown>)[path];
      if (JSON.stringify(current) === JSON.stringify(value)) continue;
      out.push({
        op: 'block.set',
        slideId: slide.id,
        blockId: block.id,
        path: `/${path}`,
        ...(value !== undefined ? { value } : {}),
      });
    }
  }
  return out;
}

/** The `connect` a connector keeps after a target left the slide (block.remove clears the attachment). */
export function detachFrom(
  connect: ShapeBlock['connect'],
  removedIds: ReadonlyArray<BlockId>,
): ShapeBlock['connect'] {
  if (connect === undefined) return undefined;
  const gone = new Set(removedIds);
  const out: NonNullable<ShapeBlock['connect']> = {};
  if (connect.start !== undefined && !gone.has(connect.start.block)) out.start = connect.start;
  if (connect.end !== undefined && !gone.has(connect.end.block)) out.end = connect.end;
  return Object.keys(out).length === 0 ? undefined : out;
}

/** The mutations that clear every attachment to the removed blocks on the slide's connectors. */
export function detachConnectors(slide: Slide, removedIds: ReadonlyArray<BlockId>): Mutation[] {
  const out: Mutation[] = [];
  const gone = new Set(removedIds);
  for (const block of canvasObjects(slide)) {
    if (gone.has(block.id) || !isConnector(block) || block.connect === undefined) continue;
    const next = detachFrom(block.connect, removedIds);
    if (JSON.stringify(next) === JSON.stringify(block.connect)) continue;
    out.push({
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: '/connect',
      ...(next !== undefined ? { value: next } : {}),
    });
  }
  return out;
}

/**
 * A duplicated connector's attachments renamed to the copies of its targets (block.duplicate of a
 * target together with its connectors), and dropped where the target was not copied.
 */
export function renameConnectorRefs(
  connect: ShapeBlock['connect'],
  mapping: ReadonlyMap<BlockId, BlockId>,
): ShapeBlock['connect'] {
  if (connect === undefined) return undefined;
  const out: NonNullable<ShapeBlock['connect']> = {};
  for (const which of ['start', 'end'] as const) {
    const end = connect[which];
    if (end === undefined) continue;
    const renamed = mapping.get(end.block);
    if (renamed !== undefined) out[which] = { block: renamed, site: end.site };
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * The connector's fields after one end is attached to a site (line.set with `connect`, the
 * editor's reroute): the end moves onto the site, the other end stays, and `connect` records the
 * attachment; `null` for a site detaches the end where it is.
 */
export function attachConnector(
  connector: ShapeBlock,
  byId: ReadonlyMap<string, Block>,
  edits: {
    start?: { block: BlockId; site: number } | null;
    end?: { block: BlockId; site: number } | null;
  },
): Partial<ShapeBlock> & { pos: Position } {
  const ends = connectorEnds(connector);
  const connect: NonNullable<ShapeBlock['connect']> = { ...(connector.connect ?? {}) };
  const points = { start: ends.start, end: ends.end };
  for (const which of ['start', 'end'] as const) {
    const edit = edits[which];
    if (edit === undefined) continue;
    if (edit === null) {
      delete connect[which];
      continue;
    }
    const target = byId.get(edit.block);
    if (target === undefined)
      throw new RangeError(`No block "${edit.block}" on the slide to attach to`);
    if (!canAttach(target))
      throw new TypeError(
        `Block "${edit.block}" takes no connector: it is a line or has no position box`,
      );
    const point = siteAt(target, edit.site);
    if (point === undefined)
      throw new RangeError(
        `Block "${edit.block}" has ${siteCount(target)} connection site(s); site ${edit.site} is out of range`,
      );
    connect[which] = { block: edit.block, site: edit.site };
    points[which] = point;
  }
  const next = Object.keys(connect).length === 0 ? undefined : connect;
  return connectorFieldsBetween(connector, points.start, points.end, next);
}
