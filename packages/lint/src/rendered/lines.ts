// lines/law inside the sheet (SPEC 7.7, 2.2 "The line law"; lint-lines.mjs:1-28): every rule the
// sheet's CSS draws is 1 px in one of the line roles, and no seam is drawn twice. The auditor for
// the chrome reads computed styles in a browser (chrome.ts); a record has only pixels, so this
// rule reconstructs the lines from the screenshot: a run of at least 48 uniform non-paper pixels
// one pixel thick is a drawn line. It reports two parallel hairlines 1 to 4 px apart that overlap
// (a seam doubled), a line in the color of hair over hair (a seam drawn twice), and a line in a
// color outside the roles (a residual border color). Rasters (images, icons, marks, diagrams,
// canvases, escapes) and the blocks with fixed plates of their own (swatches, logo plates) are
// masked out: their lines are content, not chrome.
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Box, Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { Bitmap } from './bitmap.ts';
import type { LineColor, Rgb } from './palette.ts';
import { PAPER, channelDistance, formatRgb, lineColors, onPaper } from './palette.ts';
import type { BlockIndex } from './shared.ts';
import { ownerAt, unionBox } from './shared.ts';

export type DrawnLine = {
  axis: 'h' | 'v';
  /** The line's box: [x, y, length, 1] for a horizontal line, [x, y, 1, length] for a vertical one. */
  box: Box;
  rgb: Rgb;
};

/** Block types whose interiors carry lines of their own by design. */
const MASKED_TYPES = new Set(['swatches', 'logoPlates', 'html', 'dither', 'dia']);

/** How many findings one record reports before the rest are counted in `more`. */
export const MAX_LINE_FINDINGS = 8;

/** Two pixels are the same run when every channel is within this. */
const RUN_TOLERANCE = 2;

/**
 * A neighbor counts as ground when it is within this of paper, the plate ground or, in the dark
 * theme, the code panel. Under the dark theme's 12 unit spacing of paper (7), plate (19) and
 * hair-soft (31), so a hair-soft rule is never read as ground.
 */
const GROUND_TOLERANCE = 8;

function buildMask(record: RenderRecord, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const paint = (box: Box, inflate: number): void => {
    const x0 = Math.max(0, Math.floor(box[0] - inflate));
    const y0 = Math.max(0, Math.floor(box[1] - inflate));
    const x1 = Math.min(width, Math.ceil(box[0] + box[2] + inflate));
    const y1 = Math.min(height, Math.ceil(box[1] + box[3] + inflate));
    for (let y = y0; y < y1; y += 1) mask.fill(1, y * width + x0, y * width + x1);
  };
  for (const raster of record.rasters) paint(raster.box, 2);
  for (const block of Object.values(record.blocks))
    if (MASKED_TYPES.has(block.type)) paint(block.box, 1);
  return mask;
}

/**
 * The grounds a drawn line sits on: paper, the plate composite and, in the dark theme, the code
 * panel, which is the one theme where the panel draws a border (sheet.css .panel). In the light
 * theme the panel's #101010 is 9 units from ink and would let a glyph edge pass as a line.
 */
function grounds(paper: Rgb, theme: 'light' | 'dark'): Rgb[] {
  return theme === 'dark'
    ? [paper, onPaper(theme, 'plate'), [16, 16, 16]]
    : [paper, onPaper(theme, 'plate')];
}

/**
 * Every 1 px line of at least `minRun` uniform non-paper pixels outside the mask, with ground on
 * both sides along its length. The two-sided test is what separates a drawn rule from the
 * antialiased edge of a glyph or a filled shape: a border has ground on both sides, an edge has
 * the ink core on one.
 */
export function findLines(
  bitmap: Bitmap,
  mask: Uint8Array,
  paper: Rgb,
  theme: 'light' | 'dark' = 'light',
  minRun = RENDERED_LIMITS.lineMinRunPx,
): DrawnLine[] {
  const out: DrawnLine[] = [];
  const { width, height, data } = bitmap;
  const groundSet = grounds(paper, theme);
  // one pass classifies every pixel: 1 masked, 2 ground, 0 a candidate; the scans then read bytes
  const cls = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < cls.length; p += 1, i += 4) {
    if (mask[p]) {
      cls[p] = 1;
      continue;
    }
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    for (const ground of groundSet) {
      if (
        Math.abs(r - ground[0]) <= GROUND_TOLERANCE &&
        Math.abs(g - ground[1]) <= GROUND_TOLERANCE &&
        Math.abs(b - ground[2]) <= GROUND_TOLERANCE
      ) {
        cls[p] = 2;
        break;
      }
    }
  }
  const scan = (axis: 'h' | 'v'): void => {
    const outer = axis === 'h' ? height : width;
    const inner = axis === 'h' ? width : height;
    const pixel = (o: number, i: number): number => (axis === 'h' ? o * width + i : i * width + o);
    for (let o = 1; o < outer - 1; o += 1) {
      let i = 0;
      while (i < inner) {
        const p = pixel(o, i);
        if (cls[p] !== 0) {
          i += 1;
          continue;
        }
        const at = p * 4;
        const r = data[at] ?? 0;
        const g = data[at + 1] ?? 0;
        const b = data[at + 2] ?? 0;
        let j = i + 1;
        while (j < inner) {
          const q = pixel(o, j);
          if (cls[q] !== 0) break;
          const n = q * 4;
          if (
            Math.abs((data[n] ?? 0) - r) > RUN_TOLERANCE ||
            Math.abs((data[n + 1] ?? 0) - g) > RUN_TOLERANCE ||
            Math.abs((data[n + 2] ?? 0) - b) > RUN_TOLERANCE
          )
            break;
          j += 1;
        }
        const length = j - i;
        if (length >= minRun) {
          // ground on both sides at seven points along the run
          let thin = true;
          for (let k = 0; thin && k <= 6; k += 1) {
            const t = i + Math.min(length - 1, Math.floor((k / 6) * (length - 1)));
            if (cls[pixel(o - 1, t)] !== 2 || cls[pixel(o + 1, t)] !== 2) thin = false;
          }
          if (thin) {
            const x = axis === 'h' ? i : o;
            const y = axis === 'h' ? o : i;
            out.push({
              axis,
              box: axis === 'h' ? [x, y, length, 1] : [x, y, 1, length],
              rgb: [r, g, b],
            });
          }
        }
        i = j;
      }
    }
  };
  scan('h');
  scan('v');
  return out;
}

function classify(rgb: Rgb, palette: readonly LineColor[]): LineColor | undefined {
  let best: LineColor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of palette) {
    const d = channelDistance(rgb, entry.rgb);
    if (d < bestDistance) {
      best = entry;
      bestDistance = d;
    }
  }
  return bestDistance <= RENDERED_LIMITS.lineColorTolerance ? best : undefined;
}

/** The overlap of two lines along their axis as a share of the shorter one. */
function overlap(a: DrawnLine, b: DrawnLine): number {
  const idx = a.axis === 'h' ? 0 : 1;
  const len = a.axis === 'h' ? 2 : 3;
  const start = Math.max(a.box[idx], b.box[idx]);
  const end = Math.min(a.box[idx] + a.box[len], b.box[idx] + b.box[len]);
  const shorter = Math.min(a.box[len], b.box[len]);
  return shorter > 0 ? Math.max(0, end - start) / shorter : 0;
}

export function checkLinesLaw(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
  bitmap: Bitmap | null,
): Finding[] {
  const out: Finding[] = [];
  if (!bitmap || !slide) return out;
  // an html escape draws its own lines from legacy CSS and its root box is often degenerate;
  // escape/html-block and color/tokens-only report it, this rule leaves the slide alone
  if (Object.values(record.blocks).some((block) => block.type === 'html')) return out;
  const paper = PAPER[record.theme];
  const palette = lineColors(record.theme);
  const mask = buildMask(record, bitmap.width, bitmap.height);
  const lines = findLines(bitmap, mask, paper, record.theme);
  const classified = lines.map((line) => ({ line, role: classify(line.rgb, palette) }));

  type Report = {
    kind: string;
    box: Box;
    text: string;
    measured: Record<string, number>;
    proposal: string;
  };
  const reports: Report[] = [];

  const hairlines = classified.filter(
    (entry) =>
      entry.role &&
      (entry.role.role === 'hair' || entry.role.role === 'hair-soft' || entry.role.role === 'edge'),
  );
  for (let i = 0; i < hairlines.length; i += 1) {
    for (let j = i + 1; j < hairlines.length; j += 1) {
      const a = hairlines[i];
      const b = hairlines[j];
      if (!a || !b || a.line.axis !== b.line.axis) continue;
      const across = a.line.axis === 'h' ? 1 : 0;
      const distance = Math.abs(a.line.box[across] - b.line.box[across]);
      if (distance < 1 || distance > RENDERED_LIMITS.doubledLinePx) continue;
      if (overlap(a.line, b.line) < 0.5) continue;
      reports.push({
        kind: 'doubled',
        box: unionBox(a.line.box, b.line.box),
        text: `two ${a.role?.role ?? 'hair'} and ${b.role?.role ?? 'hair'} lines ${distance} px apart`,
        measured: {
          distance,
          length: Math.min(a.line.box[2], b.line.box[2], a.line.box[3], b.line.box[3]),
        },
        proposal: `Two ${a.line.axis === 'h' ? 'horizontal' : 'vertical'} hairlines run ${distance} px apart over the same span; where two blocks touch, exactly one draws the seam (SPEC 2.2 line law). Drop one border.`,
      });
    }
  }
  for (const entry of classified) {
    const { line, role } = entry;
    const length = line.axis === 'h' ? line.box[2] : line.box[3];
    if (role?.role === 'hair-twice') {
      reports.push({
        kind: 'twice',
        box: line.box,
        text: `a ${length} px line in ${formatRgb(line.rgb)}: hair drawn over hair`,
        measured: { length },
        proposal: `A ${length} px line reads as hair composited on hair, a seam drawn twice by two owners (lint-lines.mjs junctions); one of them drops its border (SPEC 2.2 line law).`,
      });
    } else if (!role) {
      reports.push({
        kind: 'role',
        box: line.box,
        text: `a ${length} px line in ${formatRgb(line.rgb)}`,
        measured: { length },
        proposal: `A ${length} px line in ${formatRgb(line.rgb)} matches none of the line roles (hair, hair-soft, edge; ink as a state); borders take their color from the tokens (SPEC 2.2 line law, DECK-GRAMMAR.md:28).`,
      });
    }
  }

  reports.forEach((report, index) => {
    if (index >= MAX_LINE_FINDINGS) return;
    const midX = report.box[0] + Math.floor(report.box[2] / 2);
    const midY = report.box[1] + Math.floor(report.box[3] / 2);
    const blockId = ownerAt(record, midX, midY);
    const ref = blockId ? refs.get(blockId) : undefined;
    const measured =
      index === MAX_LINE_FINDINGS - 1 && reports.length > MAX_LINE_FINDINGS
        ? { ...report.measured, more: reports.length - MAX_LINE_FINDINGS }
        : report.measured;
    out.push(
      ctx.finding('lines/law', slide.id, {
        blockId,
        path: ref ? `${ref.path}#${report.kind}-${index}` : `#${report.kind}-${index}`,
        theme: record.theme,
        box: report.box,
        text: report.text,
        measured,
        proposal: report.proposal,
      }),
    );
  });
  return out;
}
