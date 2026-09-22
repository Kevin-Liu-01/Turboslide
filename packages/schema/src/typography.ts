// Typography (Kevin, 2026-09-11: "font and typography controls"): the optional overrides a
// heading, a paragraph, a text block, a box or a shape carries over the grammar's defaults. Every
// value is a step of the sheet's own scales (head:57-68, 96-172): the type ladder for size, weights
// 300 to 700 with the 500 cap enforced by the type/weight-cap lint rather than the schema, the
// four alignments, the tracking steps the deck uses in em, and the line heights the ladder sets
// plus Google's four spacing values. The parity round two (gslides-parity SPEC-2 2.2) adds the
// paragraph spacing in px, the column count and the left indent. A field that is absent leaves the
// grammar's default in place, so a deck written before this round renders unchanged. Imports only
// zod and annotate (blocks.ts imports this).
import { z } from 'zod';
import { annotate } from './annotate.ts';
import type { FontId } from './fonts.ts';
import { FONT_IDS } from './fonts.ts';

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

/** Google's four alignments; justify is SPEC-2 2.2.7. */
export const TYPE_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TypeAlign = (typeof TYPE_ALIGNS)[number];

/** Letter spacing steps in em: the display faces at -0.025, rows at -0.01, the credit at 0.01. */
export const TYPE_TRACKING = [-0.025, -0.02, -0.015, -0.01, 0, 0.01, 0.02] as const;

/**
 * Line height steps: h1 1.02, big 1.06, title 1.08, h2 1.1, say 1.2, plain 1.4, lead 1.45, p 1.5,
 * panel 1.7, plus Google's Single, 1.15, 1.5 and Double (SPEC-2 2.2.8). type/ladder is a size
 * rule, so a value off this list is not a finding.
 */
export const TYPE_LEADING = [
  1, 1.02, 1.06, 1.08, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.45, 1.5, 1.7, 2,
] as const;

/** Google's line spacing menu (SPEC-2 0.20): Single, 1.15, 1.5, Double. */
export const LINE_SPACING_PRESETS = [1, 1.15, 1.5, 2] as const;

/**
 * The numeral spacing a block may ask for (docs/FEATURES.md 3.1 item 4; audit-fonts 2): `tabular`
 * gives every digit the same width so numbers line up in a column; absent keeps the face's
 * proportional digits. One value today; the type is a union so `oldstyle` can join later.
 */
export const TYPE_NUMERALS = ['tabular'] as const;
export type TypeNumerals = (typeof TYPE_NUMERALS)[number];

/** The column counts a text container takes (SPEC-2 2.2.10). */
export const TYPE_COLUMNS = [1, 2, 3] as const;
export type TypeColumns = (typeof TYPE_COLUMNS)[number];

/** The gap between text columns in px (SPEC-2 2.2.10). */
export const COLUMN_GAP_PX = 40;

/** One Increase indent step in px: Google's half inch on this sheet, on the 8 px grid (SPEC-2 0.22). */
export const INDENT_STEP_PX = 64;

/** The Add space before or after paragraph step in px (SPEC-2 4.1 format.spacing.addBefore). */
export const PARAGRAPH_SPACE_STEP_PX = 8;

export type Typography = {
  /** Font size in px; a value off the ladder is a type/ladder finding. */
  size?: number;
  weight?: TypeWeight;
  align?: TypeAlign;
  /** Letter spacing in em. */
  tracking?: number;
  /** Line height as a factor. */
  leading?: number;
  /** Space before every paragraph but the first, in px (SPEC-2 2.2.9). */
  spaceBefore?: number;
  /** Space after every paragraph but the last, in px (SPEC-2 2.2.9). */
  spaceAfter?: number;
  /** Text columns inside the block (SPEC-2 2.2.10). */
  columns?: TypeColumns;
  /** The paragraphs' left indent in px (SPEC-2 2.2.11). */
  indent?: number;
  /** The face by catalog id (gslides-parity SPEC-5-amendments A5; docs/PRODUCT.md 4.2); the theme's face when absent. */
  family?: FontId;
  /** Tabular figures (docs/FEATURES.md 3.1 item 4): every digit the same width; proportional when absent. */
  numerals?: TypeNumerals;
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
    label: 'Line spacing',
    control: 'number',
    snap: TYPE_LEADING,
    group: 'Text',
    help: 'Line height as a factor; body copy runs 1.5, headings 1.02 to 1.1 (head:59-65); Single, 1.15, 1.5 and Double are Google’s values (gslides-parity SPEC-2 2.2.8).',
  }),
  spaceBefore: annotate(z.number().nonnegative().optional(), {
    label: 'Space before',
    control: 'number',
    snap: [0, 8, 16, 24],
    group: 'Text',
    help: 'Space above every paragraph but the first, in px (gslides-parity SPEC-2 2.2.9).',
  }),
  spaceAfter: annotate(z.number().nonnegative().optional(), {
    label: 'Space after',
    control: 'number',
    snap: [0, 8, 16, 24],
    group: 'Text',
    help: 'Space below every paragraph but the last, in px (gslides-parity SPEC-2 2.2.9).',
  }),
  columns: annotate(z.literal(TYPE_COLUMNS).optional(), {
    label: 'Columns',
    control: 'select',
    snap: TYPE_COLUMNS,
    group: 'Text',
    help: 'Text columns inside the block with a 40 px gap; one when absent (gslides-parity SPEC-2 2.2.10).',
  }),
  indent: annotate(z.number().nonnegative().optional(), {
    label: 'Indent',
    control: 'number',
    snap: [0, 64, 128, 192],
    group: 'Text',
    help: 'The paragraphs’ left indent in px; Increase indent steps it by 64 (gslides-parity SPEC-2 2.2.11).',
  }),
  family: annotate(z.enum(FONT_IDS).optional(), {
    label: 'Font',
    control: 'select',
    snap: FONT_IDS,
    group: 'Text',
    help: 'A face from the font catalog by id (gslides-parity SPEC-5-amendments A5; docs/PRODUCT.md 4.2); the theme’s face when absent.',
  }),
  numerals: annotate(z.enum(TYPE_NUMERALS).optional(), {
    label: 'Tabular figures',
    control: 'toggle',
    snap: TYPE_NUMERALS,
    group: 'Text',
    help: 'Every digit takes the same width, so numbers line up in a column',
  }),
}) satisfies z.ZodType<Typography>;

/** The sentence under the Tabular figures row and in its tooltip (docs/FEATURES.md 3.1 item 4; judge-seller addition 10). */
export const NUMERALS_SENTENCE = 'Every digit takes the same width, so numbers line up in a column';

/** The reason the Tabular figures row is disabled on a face without `tnum` (docs/FEATURES.md 3.1 item 4). */
export const NUMERALS_UNAVAILABLE = 'This face has no tabular figures';

/** The typography group as one inspector control (control `typography`, SPEC 6.5). */
export const typographySchema = annotate(typographyObjectSchema.optional(), {
  label: 'Typography',
  control: 'typography',
  group: 'Text',
  help: 'Size from the ladder, weight, alignment, tracking, line and paragraph spacing, columns and indent; an absent field keeps the grammar default.',
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

/**
 * The next ladder step below a size, or undefined at the floor: what Shrink text on overflow
 * writes on each pass (gslides-parity SPEC-2 0.23). A size off the ladder steps to the first step
 * under it.
 */
export function ladderStepDown(size: number): number | undefined {
  for (const step of TYPE_LADDER) if (step < size) return step;
  return undefined;
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
  if (typography.columns !== undefined && typography.columns > 1)
    out.push(`column-count:${typography.columns}`, `column-gap:${COLUMN_GAP_PX}px`);
  if (typography.indent !== undefined && typography.indent > 0)
    out.push(`padding-left:${typography.indent}px`);
  // the catalog face by id (gslides-parity SPEC-5-amendments A5; docs/PRODUCT.md 4.2): the block
  // reads the custom property @turboslide/fonts/catalog fontFamilyVariable names, which
  // @turboslide/render/fonts defines on the sheet root beside the family's @font-face rules; a
  // family whose faces are not loaded inherits the sheet's face
  if (typography.family !== undefined)
    out.push(`font-family:var(--ts-font-${typography.family}, inherit)`);
  // the display features are Inter's (docs/FEATURES.md 3.1 item 5; audit-fonts 7): a block in
  // another family drops the sheet's cv11 and ss01, whose ss01 would mean something else in 17 of
  // the catalog's families; Inter itself keeps the sheet's rule (the heading rules read
  // --display-features, which the kit sets)
  if (typography.family !== undefined && typography.family !== 'inter')
    out.push('font-feature-settings:normal');
  // tabular figures (3.1 item 4): every digit the same width, so a column of numbers aligns
  if (typography.numerals === 'tabular') out.push('font-variant-numeric:tabular-nums');
  return out;
}
