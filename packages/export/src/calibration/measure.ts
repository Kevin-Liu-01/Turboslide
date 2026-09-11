// Calibration measurements (SPEC 8.5 step 5): the calibration deck's single-line text blocks are
// written as native text boxes at their rendered boxes with the export font set, rendered through
// the target (LibreOffice in the render worker), and the ink box of every block is compared with
// the Turboslide render, so calibration.json can record the first-baseline offset per size, the
// width agreement of the installed faces and the hairline placement for that renderer and font
// set. The same fixture writer serves the flatten check: a page whose background is the render.
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { RenderRecord, Theme } from '@turboslide/schema/render';
import { plainText } from '@turboslide/schema/text';
import { LADDER } from '@turboslide/theme/tokens';
import { exportFace } from '@turboslide/fonts/export';
import type { ExportFontSet } from '@turboslide/fonts/export';

import { parseCssColor } from '../units.ts';
import { compareBlock } from '../verify/diff.ts';
import type { BlockDelta, Png } from '../verify/diff.ts';
import type { FixtureText } from '../verify/fixture.ts';

/** The ladder step a block renders with (heading levels and paragraph roles). */
export function ladderStepOf(block: {
  type: string;
  level?: string;
  role?: string;
}): keyof typeof LADDER | null {
  if (block.type === 'heading') {
    if (block.level === 'h1') return 'h1';
    if (block.level === 'h2') return 'h2';
    if (block.level === 'big') return 'big';
    if (block.level === 'title') return 'title';
    return null;
  }
  if (block.type === 'paragraph') {
    if (block.role === 'lead') return 'lead';
    if (block.role === 'cap') return 'cap';
    return 'p';
  }
  if (block.type === 'credit') return 'credit';
  return null;
}

export type CalibrationText = FixtureText & { slideId: string; sizePx: number; step: string };

/**
 * Native text boxes for the single-run text blocks of one slide, at the boxes the render record
 * measured, with the export family the run travels under. Blocks with markup or several lines are
 * skipped: the calibration wants one string per box so the measurement is of the face, not of
 * wrapping.
 */
export function calibrationTexts(
  document: DeckDocument,
  record: RenderRecord,
  set: ExportFontSet = 'exact',
): CalibrationText[] {
  const slide = document.slides[record.slideId];
  if (!slide) return [];
  const out: CalibrationText[] = [];
  for (const { block } of slideBlocks(slide)) {
    if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'credit') continue;
    const measured = record.blocks[block.id];
    if (!measured || (measured.lines ?? 1) !== 1) continue;
    const step = ladderStepOf(block);
    if (!step) continue;
    const spec = LADDER[step];
    if (/[*[]/.test(block.text)) continue;
    const size = measured.fontSize ?? spec.size;
    const weight = measured.fontWeight ?? ('weight' in spec ? spec.weight : 400);
    const face = exportFace(size, weight, { set, display: block.type === 'heading' });
    const tracking = 'tracking' in spec ? Number.parseFloat(spec.tracking) * size : 0;
    const lineHeight = ('lineHeight' in spec ? spec.lineHeight : 1.45) * size;
    out.push({
      slideId: record.slideId,
      name: block.id,
      text: plainText(block.text),
      box: measured.box,
      sizePx: size,
      lineHeightPx: lineHeight,
      family: face.family,
      color: parseCssColor(measured.color ?? '#070707').hex,
      alpha: 1,
      letterSpacingPx: tracking,
      step,
    });
  }
  return out;
}

export type BaselineMeasurement = BlockDelta & {
  slideId: string;
  theme: Theme;
  step: string;
  sizePx: number;
  family: string;
};

/** The per-block deltas of a native calibration page against the reference render. */
export function measureCalibration(
  ref: Png,
  got: Png,
  texts: CalibrationText[],
  theme: Theme,
): BaselineMeasurement[] {
  return texts.map((t) => ({
    ...compareBlock(ref, got, { blockId: t.name, type: 'heading', box: t.box }),
    slideId: t.slideId,
    theme,
    step: t.step,
    sizePx: t.sizePx,
    family: t.family,
  }));
}

export type BaselineTable = Record<string, { dy: number; dx: number; dw: number; samples: number }>;

/** Mean deltas per size across measurements: the first-baseline constant per size. */
export function baselineBySize(measurements: readonly BaselineMeasurement[]): BaselineTable {
  const table: BaselineTable = {};
  for (const m of measurements) {
    if (!m.refInk || !m.gotInk) continue;
    const key = String(m.sizePx);
    const row = table[key] ?? { dy: 0, dx: 0, dw: 0, samples: 0 };
    row.dy += m.dy;
    row.dx += m.dx;
    row.dw += m.dw;
    row.samples += 1;
    table[key] = row;
  }
  for (const row of Object.values(table)) {
    row.dy = Math.round((row.dy / row.samples) * 100) / 100;
    row.dx = Math.round((row.dx / row.samples) * 100) / 100;
    row.dw = Math.round((row.dw / row.samples) * 100) / 100;
  }
  return table;
}
