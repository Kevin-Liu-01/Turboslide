// Typography (Kevin, 2026-09-11: "font and typography controls"): the optional overrides a
// heading, a paragraph, a text block or a box carries over the grammar's defaults. Every value is
// a step of the sheet's own scales (head:57-68, 96-172): the type ladder for size, weights 300 to
// 700 with the 500 cap enforced by the type/weight-cap lint rather than the schema, three
// alignments, the tracking steps the deck uses in em, and the line heights the ladder sets. A
// field that is absent leaves the grammar's default in place, so a deck written before this
// round renders unchanged. Imports only zod and annotate (blocks.ts imports this).
import { z } from 'zod';
import { annotate } from './annotate.ts';

/** The sheet's type ladder in px (head:59-65 and the block rules; 15 is the floor). */
export const TYPE_LADDER = [88, 72, 58, 44, 34, 26, 24, 22, 20, 18, 17, 16, 15] as const;

/**
 * Weights the inspector offers; display weight above 500 is a lint, not a schema error. The PPTX
 * export set holds the 400 and 500 cuts only (export/pptx/fonts-map.ts EXPORT_WEIGHTS): 600 and
 * 700 travel as Medium plus the bold flag, 300 as Regular, and the export report names it.
 */
export const TYPE_WEIGHTS = [300, 400, 500, 600, 700] as const;
export type TypeWeight = (typeof TYPE_WEIGHTS)[number];

/** Display weight is capped at 500 (DECK-GRAMMAR.md:20). */
export const WEIGHT_CAP = 500;

export const TYPE_ALIGNS = ['left', 'center', 'right'] as const;
export type TypeAlign = (typeof TYPE_ALIGNS)[number];

/** Letter spacing steps in em: the display faces at -0.025, rows at -0.01, the credit at 0.01. */
export const TYPE_TRACKING = [-0.025, -0.02, -0.015, -0.01, 0, 0.01, 0.02] as const;

/** Line height steps: h1 1.02, big 1.06, title 1.08, h2 1.1, say 1.2, plain 1.4, lead 1.45, p 1.5, panel 1.7. */
export const TYPE_LEADING = [1.02, 1.06, 1.08, 1.1, 1.2, 1.25, 1.3, 1.4, 1.45, 1.5, 1.7] as const;

export type Typography = {
  /** Font size in px; a value off the ladder is a type/ladder finding. */
  size?: number;
  weight?: TypeWeight;
  align?: TypeAlign;
  /** Letter spacing in em. */
  tracking?: number;
  /** Line height as a factor. */
  leading?: number;
};

export const typographyObjectSchema = z.strictObject({
  size: annotate(z.number().positive().optional(), {
    label: 'Size',
    control: 'select',
    snap: TYPE_LADDER,
    group: 'Text',
    help: 'Font size in px from the type ladder (head:59-65); another value is a type/ladder finding.',
  }),
  weight: annotate(z.literal(TYPE_WEIGHTS).optional(), {
    label: 'Weight',
    control: 'select',
    snap: TYPE_WEIGHTS,
    group: 'Text',
    help: 'Inter weight; display weight above 500 is a type/weight-cap finding (DECK-GRAMMAR.md:20). The PPTX export carries Regular and Medium cuts: 600 and 700 travel as Medium plus bold, 300 as Regular, and the report says so (docs/pptx.md).',
  }),
  align: annotate(z.enum(TYPE_ALIGNS).optional(), {
    label: 'Align',
    control: 'select',
    snap: TYPE_ALIGNS,
    group: 'Text',
  }),
  tracking: annotate(z.number().optional(), {
    label: 'Tracking (em)',
    control: 'number',
    snap: TYPE_TRACKING,
    group: 'Text',
    help: 'Letter spacing in em; the display faces sit at -0.025 (head:58).',
  }),
  leading: annotate(z.number().positive().optional(), {
    label: 'Leading',
    control: 'number',
    snap: TYPE_LEADING,
    group: 'Text',
    help: 'Line height as a factor; body copy runs 1.5, headings 1.02 to 1.1 (head:59-65).',
  }),
}) satisfies z.ZodType<Typography>;

/** The typography group as one inspector control (control `typography`, SPEC 6.5). */
export const typographySchema = annotate(typographyObjectSchema.optional(), {
  label: 'Typography',
  control: 'typography',
  group: 'Text',
  help: 'Size from the ladder, weight, alignment, tracking and leading; an absent field keeps the grammar default.',
});

export function isLadderSize(size: number): boolean {
  return (TYPE_LADDER as ReadonlyArray<number>).includes(size);
}

/** The ladder size nearest a value; ties go to the larger size. */
export function nearestLadderSize(size: number): number {
  let best: number = TYPE_LADDER[0];
  for (const step of TYPE_LADDER) if (Math.abs(step - size) < Math.abs(best - size)) best = step;
  return best;
}

/** The inline CSS declarations of a typography record, in a stable order; empty when nothing is set. */
export function typographyDeclarations(typography: Typography | undefined): string[] {
  if (typography === undefined) return [];
  const out: string[] = [];
  if (typography.size !== undefined) out.push(`font-size:${typography.size}px`);
  if (typography.weight !== undefined) out.push(`font-weight:${typography.weight}`);
  if (typography.align !== undefined) out.push(`text-align:${typography.align}`);
  if (typography.tracking !== undefined) out.push(`letter-spacing:${typography.tracking}em`);
  if (typography.leading !== undefined) out.push(`line-height:${typography.leading}`);
  return out;
}
