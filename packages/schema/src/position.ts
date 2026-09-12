// Position (Kevin, 2026-09-11: "be able to drag stuff around in each slide"): the box a block
// occupies on a freeform slide, in sheet pixels on the 1600 by 900 sheet (SPEC 2.1), with an
// optional z for the stacking order. The field is required on every top-level block of a
// freeform slide and forbidden everywhere else (validate.ts), so the grammar layouts keep having
// no coordinates (SPEC 1, 4.3) and a freeform slide is the one place a box lives. Snapping and
// the guide lines live in freeform.ts; this module imports only zod and annotate.
import { z } from 'zod';
import { annotate } from './annotate.ts';

export type Position = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order; higher draws later. Absent counts as 0 and document order breaks ties. */
  z?: number;
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
}) satisfies z.ZodType<Position>;

/** The position group as one inspector control (control `position`, SPEC 6.5). */
export const positionSchema = annotate(positionObjectSchema.optional(), {
  label: 'Position',
  control: 'position',
  group: 'Layout',
  help: 'The box on the 1600 by 900 sheet in px; required under the freeform layout and forbidden elsewhere (docs/freeform.md).',
});

/** The z a block sorts by: its recorded z, or 0. */
export function zOf(position: Position | undefined): number {
  return position?.z ?? 0;
}
