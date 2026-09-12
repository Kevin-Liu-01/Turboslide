// The verification budgets (SPEC 8.5 step 3; MILESTONES M2 acceptance): flatten passes under 0.1
// percent mismatched pixels per slide; native passes per block, text ink boxes within 3 px
// horizontally and 1 px vertically (the QuickLook measurement, pptx report section 4.3), hairlines
// within 1 px, rasters within 1 px. pixelmatch runs at threshold 0.1 in every mode. A block's ink
// is what lies past INK_CUT of the way from the region background to the block's ink color
// (diff.ts), and a color closer to the background than MIN_INK_CONTRAST cannot be that ink end.

export type BlockKind = 'text' | 'line' | 'raster';

/** Allowed absolute deltas in sheet pixels between the reference and the rendered export. */
export type Budget = { dx: number; dy: number; dw: number };

export type Budgets = {
  /** pixelmatch color threshold. */
  threshold: number;
  /** The per-slide mismatched fraction a flatten export must stay under. */
  flattenFraction: number;
  text: Budget;
  line: Budget;
  raster: Budget;
};

export const DEFAULT_BUDGETS: Budgets = {
  threshold: 0.1,
  flattenFraction: 0.001,
  text: { dx: 3, dy: 1, dw: 3 },
  line: { dx: 1, dy: 1, dw: 1 },
  raster: { dx: 1, dy: 1, dw: 1 },
};

/**
 * Where the ink cut sits on the line from the background to the block's ink color. Measured on
 * the deck's native export against LibreOffice's pages (M2 review, docs/M2-STATUS.md), as a share
 * of the paper-to-ink range: the --hair token at 18 percent alpha paints at 18 percent and at
 * about 9 after LibreOffice resamples the 2x raster onto two rows; a diagram's medium strokes at
 * about 30 (15 resampled); the muted text color at 46; the value color of ruled rows at 77. A cut
 * at one third leaves hairlines and medium strokes out of both images and keeps muted text in;
 * the midpoint cut through muted text (surfaces#rows measured dw -6 at 40 percent and -42 at 50),
 * and the earlier fixed tolerance of 40 units (16 percent) counted the hairlines.
 */
export const INK_CUT = 1 / 3;

/**
 * The smallest channel difference between the background and a color for that color to serve as
 * the ink end of the cut. The deck's lightest hairline sits about 45 units from the paper; a
 * recorded or estimated color under this contrast is a plate fill or a blank region, not ink, and
 * the block falls back to EDGE_TOLERANCE.
 */
export const MIN_INK_CONTRAST = 48;

/**
 * The fixed tolerance of the pptx report's ink box (section 4.3): any channel more than this far
 * from the background. Kept for opaque pictures (shot and html rasters, `alpha` false in the
 * record), whose content is continuous tone and whose stable feature is the picture's edge
 * against the paper; measured on the deck, the cut moved line-law#fig by 26 px and
 * details-two#fig2 by 40 where the edge stays within 1 px.
 */
export const EDGE_TOLERANCE = 40;

/**
 * The edge tolerance of a diagram raster (M5): its hairlines are its structure, and the deck's
 * palette leaves a gap between hair-soft (22 units from the paper) and hair (45), so a cut at 30
 * keeps a hairline in both images when LibreOffice's 1/100 mm placement blurs a 1:1 image by a few
 * units (measured in round five at the default 40: positioning#dia1 dy +32, docs-for-agents#dia1
 * dw -32, agent-api#dia1 dw -38, the reference's hairlines at 45 and the page's at about 41).
 */
export const DIA_EDGE_TOLERANCE = 30;

/** Block types whose ink is glyphs, measured with the text budget (SPEC 4.2 blocks). */
export const TEXT_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'credit',
  'rows',
  'row',
  'plain',
  'refs',
  'say',
  'spec',
  'lang',
  'ladder',
  'swatches',
  'board',
  'panel',
  'composite',
  'counter',
  // the freeform round's text carriers (docs/freeform.md)
  'text',
  'box',
]);

/** Blocks that are mostly hairlines: declared diagrams, scales, and the rule and shape primitives. */
export const LINE_BLOCK_TYPES: ReadonlySet<string> = new Set(['dia', 'scales', 'rule', 'shape']);

export function blockKind(type: string): BlockKind {
  if (TEXT_BLOCK_TYPES.has(type)) return 'text';
  if (LINE_BLOCK_TYPES.has(type)) return 'line';
  return 'raster';
}

export function budgetFor(kind: BlockKind, budgets: Budgets = DEFAULT_BUDGETS): Budget {
  return budgets[kind];
}

export function withinBudget(
  delta: { dx: number; dy: number; dw: number },
  budget: Budget,
): boolean {
  return (
    Math.abs(delta.dx) <= budget.dx &&
    Math.abs(delta.dy) <= budget.dy &&
    Math.abs(delta.dw) <= budget.dw
  );
}

export function mergeBudgets(overrides?: Partial<Budgets>): Budgets {
  if (!overrides) return DEFAULT_BUDGETS;
  return {
    threshold: overrides.threshold ?? DEFAULT_BUDGETS.threshold,
    flattenFraction: overrides.flattenFraction ?? DEFAULT_BUDGETS.flattenFraction,
    text: { ...DEFAULT_BUDGETS.text, ...overrides.text },
    line: { ...DEFAULT_BUDGETS.line, ...overrides.line },
    raster: { ...DEFAULT_BUDGETS.raster, ...overrides.raster },
  };
}
