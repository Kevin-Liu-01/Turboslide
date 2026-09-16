// Position (Kevin, 2026-09-11: "be able to drag stuff around in each slide"): the box a block
// occupies on the sheet in sheet pixels (SPEC 2.1; the deck's page, 1600 by 900 by default,
// gslides-parity SPEC-5 6.1), with an optional z for the
// stacking order. The field is required on every top-level block of a freeform slide and on every
// block of a slide's objects layer (gslides-parity SPEC-2 section 1), and forbidden everywhere
// else (validate.ts), so the grammar layouts keep having no coordinates (SPEC 1, 4.3). The parity
// round two adds rotation, flip and the group tag (SPEC-2 2.1): `rotate` is degrees clockwise in
// [0, 360), `flip` mirrors the box after the rotation, `group` is the slug the members of one
// group share (SPEC 7.7's flat tag; block.group writes it on two or more blocks). Snapping and
// the guide lines live in freeform.ts; this module imports only zod, annotate and ids.
import { z } from 'zod';
import { annotate } from './annotate.ts';

export const FLIPS = ['h', 'v', 'hv'] as const;
export type Flip = (typeof FLIPS)[number];

export type Position = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order; higher draws later. Absent counts as 0 and document order breaks ties. */
  z?: number;
  /** Rotation in degrees clockwise about the box centre, 0 to 360 exclusive (SPEC-2 2.1.1). */
  rotate?: number;
  /** Mirror across the vertical axis (h), the horizontal axis (v) or both, after the rotation (SPEC-2 2.1.2). */
  flip?: Flip;
  /**
   * The group tag the block shares with the other members of one group (SPEC-2 2.1.3). Since
   * round five a path `slug(/slug)*` (gslides-parity SPEC-5 0.48): the outermost group first, one
   * segment per nesting level; a flat tag is a one segment path.
   */
  group?: string;
};

/** A group path: one slug per nesting level, the outermost first (SPEC-5 0.48). */
export const GROUP_PATH_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export const groupPathSchema = z
  .string()
  .regex(GROUP_PATH_PATTERN, 'a group path: slugs joined by single slashes, the outermost first');

/** The segments of a group path, the outermost first; a flat tag is one segment. */
export function groupSegments(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/** The outermost group of a path (the segment `block.group` on a selection that holds a group writes; SPEC-5 0.48). */
export function outerGroup(path: string): string {
  return groupSegments(path)[0] ?? path;
}

/** The path one level in (what Ungroup leaves on the members), or undefined for a flat tag. */
export function innerGroupPath(path: string): string | undefined {
  const segments = groupSegments(path);
  return segments.length > 1 ? segments.slice(1).join('/') : undefined;
}

/**
 * The path a member takes when a selection that already holds a group is grouped again (SPEC-5
 * 0.48; MILESTONES-5 B3 day 6): the new tag becomes the outermost segment and the member's own
 * path follows it, so `groupPathOnGroup('row/cell', 'card')` is `card/row/cell`. A member with no
 * group takes the tag alone.
 */
export function groupPathOnGroup(existing: string | undefined, tag: string): string {
  return existing === undefined || existing === '' ? tag : `${tag}/${existing}`;
}

/** How many groups a path nests: 1 for a flat tag, 2 for `outer/inner`. */
export function groupDepth(path: string): number {
  return groupSegments(path).length;
}

/**
 * The group at one nesting level of a path, the outermost first: `groupPrefix('a/b/c', 1)` is `a`,
 * `groupPrefix('a/b/c', 2)` is `a/b`; a depth past the path answers the whole path.
 */
export function groupPrefix(path: string, depth: number): string {
  const segments = groupSegments(path);
  return segments.slice(0, Math.max(1, Math.min(depth, segments.length))).join('/');
}

/**
 * True when two members sit in the same group at a level: both paths reach that depth and agree on
 * every segment up to it. Two flat tags share level 1 when they are equal.
 */
export function sharesGroupLevel(
  a: string | undefined,
  b: string | undefined,
  depth: number,
): boolean {
  if (a === undefined || b === undefined) return false;
  const as = groupSegments(a);
  const bs = groupSegments(b);
  if (as.length < depth || bs.length < depth) return false;
  for (let i = 0; i < depth; i += 1) if (as[i] !== bs[i]) return false;
  return true;
}

/**
 * The members of the group a path names at a level (the selection the first click makes at level
 * 1, the second click at level 2; SPEC-5 0.48): every block whose group prefix at that depth
 * equals the path's own.
 */
export function membersAtLevel<T extends { pos?: { group?: string } | undefined }>(
  blocks: ReadonlyArray<T>,
  path: string,
  depth: number,
): T[] {
  const wanted = groupPrefix(path, depth);
  return blocks.filter((block) => {
    const group = block.pos?.group;
    return (
      group !== undefined && groupDepth(group) >= depth && groupPrefix(group, depth) === wanted
    );
  });
}

/** The tags a set of members carries at one level, the outermost first, without repeats. */
export function groupsAtLevel(groups: ReadonlyArray<string | undefined>, depth: number): string[] {
  const out: string[] = [];
  for (const group of groups) {
    if (group === undefined || groupDepth(group) < depth) continue;
    const prefix = groupPrefix(group, depth);
    if (!out.includes(prefix)) out.push(prefix);
  }
  return out;
}

export const positionObjectSchema = z.strictObject({
  x: annotate(z.number(), { label: 'X', control: 'number', group: 'Layout' }),
  y: annotate(z.number(), { label: 'Y', control: 'number', group: 'Layout' }),
  w: annotate(z.number().positive(), { label: 'Width', control: 'number', group: 'Layout' }),
  h: annotate(z.number().positive(), { label: 'Height', control: 'number', group: 'Layout' }),
  z: annotate(z.number().int().optional(), {
    label: 'Z order',
    control: 'number',
    group: 'Layout',
    help: 'Higher draws over lower; block.order moves a block through the stack.',
  }),
  rotate: annotate(z.number().min(0).lt(360).optional(), {
    label: 'Rotate',
    control: 'number',
    snap: [0, 15, 30, 45, 90, 180, 270],
    group: 'Layout',
    help: 'Degrees clockwise about the centre of the box, 0 up to 360 (gslides-parity SPEC-2 2.1.1).',
  }),
  flip: annotate(z.enum(FLIPS).optional(), {
    label: 'Flip',
    control: 'select',
    snap: FLIPS,
    group: 'Layout',
    help: 'h mirrors left to right, v top to bottom, hv both (gslides-parity SPEC-2 2.1.2).',
  }),
  group: annotate(groupPathSchema.optional(), {
    label: 'Group',
    control: 'readonly',
    group: 'Layout',
    help: 'The tag the members of one group share, a path of slugs for nested groups with the outermost first; Group and Ungroup write it (gslides-parity SPEC-2 2.1.3, SPEC-5 0.48).',
  }),
}) satisfies z.ZodType<Position>;

/** The position group as one inspector control (control `position`, SPEC 6.5). */
export const positionSchema = annotate(positionObjectSchema.optional(), {
  label: 'Position',
  control: 'position',
  group: 'Layout',
  help: 'The box on the sheet in px (the deck’s page, 1600 by 900 by default); required under the freeform layout and in the objects layer, forbidden elsewhere (docs/freeform.md; gslides-parity SPEC-2 section 1).',
});

/** The z a block sorts by: its recorded z, or 0. */
export function zOf(position: Position | undefined): number {
  return position?.z ?? 0;
}

/** A rotation brought into [0, 360): 370 is 10, -90 is 270 (SPEC-2 2.1.1). */
export function normalizeRotation(degrees: number): number {
  const wrapped = degrees % 360;
  const positive = wrapped < 0 ? wrapped + 360 : wrapped;
  // -0 and 360 both read as 0
  return positive === 360 || Object.is(positive, -0) ? 0 : positive;
}

/** The flip after toggling one axis: h on nothing is h, h on h is nothing, v on h is hv (block.flip). */
export function toggleFlip(current: Flip | undefined, axis: 'h' | 'v'): Flip | undefined {
  const h = (current === 'h' || current === 'hv') !== (axis === 'h');
  const v = (current === 'v' || current === 'hv') !== (axis === 'v');
  if (h && v) return 'hv';
  if (h) return 'h';
  if (v) return 'v';
  return undefined;
}

/** The centre of a position box. */
export function positionCenter(pos: Position): { x: number; y: number } {
  return { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 };
}
