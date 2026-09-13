// Position (Kevin, 2026-09-11: "be able to drag stuff around in each slide"): the box a block
// occupies on the 1600 by 900 sheet in sheet pixels (SPEC 2.1), with an optional z for the
// stacking order. The field is required on every top-level block of a freeform slide and on every
// block of a slide's objects layer (gslides-parity SPEC-2 section 1), and forbidden everywhere
// else (validate.ts), so the grammar layouts keep having no coordinates (SPEC 1, 4.3). The parity
// round two adds rotation, flip and the group tag (SPEC-2 2.1): `rotate` is degrees clockwise in
// [0, 360), `flip` mirrors the box after the rotation, `group` is the slug the members of one
// group share (SPEC 7.7's flat tag; block.group writes it on two or more blocks). Snapping and
// the guide lines live in freeform.ts; this module imports only zod, annotate and ids.
import { z } from 'zod';
import { annotate } from './annotate.ts';
import { slugSchema } from './ids.ts';

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
  /** The group tag the block shares with the other members of one group (SPEC-2 2.1.3). */
  group?: string;
};

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
  group: annotate(slugSchema.optional(), {
    label: 'Group',
    control: 'readonly',
    group: 'Layout',
    help: 'The tag the members of one group share; Group and Ungroup write it (gslides-parity SPEC-2 2.1.3).',
  }),
}) satisfies z.ZodType<Position>;

/** The position group as one inspector control (control `position`, SPEC 6.5). */
export const positionSchema = annotate(positionObjectSchema.optional(), {
  label: 'Position',
  control: 'position',
  group: 'Layout',
  help: 'The box on the 1600 by 900 sheet in px; required under the freeform layout and in the objects layer, forbidden elsewhere (docs/freeform.md; gslides-parity SPEC-2 section 1).',
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
