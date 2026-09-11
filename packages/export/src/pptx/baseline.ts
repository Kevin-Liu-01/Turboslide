// The first-baseline constant of the verify renderer (SPEC 8.5 step 5). Chromium centres a line's
// glyphs in its line box (half the leading above the ascent), and LibreOffice with an exact pitch
// (`<a:spcPts>`) puts the whole leading above the baseline, so a native text box written at the
// browser's coordinates renders its ink lower by about half the leading at body sizes and higher
// at display sizes whose pitch is tighter than the font height. Measured on decks/gt-brand at
// revision 13 (26 all-native slides, light theme, LibreOffice 25.2.3.2 through pdftocairo 25.03.0):
//
//   dy = pitch / 2 - k(size) * size        (sheet px; positive is lower than the browser)
//
// where k is 0.592 at 15 px, 0.591 at 22, 0.571 at 26, 0.579 at 44, 0.581 at 72 and 0.555 at 88.
// The pure font-metric model (k = 0.605, Inter's ascent minus descent over two) fits body sizes
// within a pixel and drifts to 4 px at 88, so the per-size k is a measured constant, recorded in
// calibration/calibration.json under targets.pptx-libreoffice.firstBaselineModel and interpolated
// between the anchors. The exporter moves every Inter text box up by dy so LibreOffice lands on
// the browser's ink within the 1 px vertical budget (SPEC 8.5 step 3). PowerPoint's constant is
// the scheduled manual pass (docs/export-verification.md); `--baseline-target none` writes the boxes at
// the browser's coordinates for that measurement.
import { readFileSync } from 'node:fs';

import { calibrationFile } from '../calibration/locate.ts';

export type BaselineTarget = 'libreoffice' | 'none';

export const DEFAULT_BASELINE: BaselineTarget = 'libreoffice';

export type BaselineAnchor = {
  /** Font size in sheet px. */
  size: number;
  /** The constant at that size: (pitch / 2 - dy) / size. */
  k: number;
  /** The line pitch the anchor was measured at, in sheet px. */
  pitch: number;
  /** The measured ink offset at that pitch, LibreOffice minus the browser, in sheet px. */
  dy: number;
  samples: number;
};

export type BaselineModel = {
  formula: string;
  anchors: BaselineAnchor[];
  /** The code panel's monospace face has its own anchor (M5: DejaVu Sans Mono at 17 px). */
  mono?: { family: string; anchors: BaselineAnchor[] };
};

type CalibrationFile = {
  targets: { 'pptx-libreoffice': { firstBaselineModel: BaselineModel } };
};

let cached: BaselineModel | undefined;

/** The measured model from calibration.json. */
export function loadBaselineModel(): BaselineModel {
  if (cached) return cached;
  const file = JSON.parse(readFileSync(calibrationFile(), 'utf8')) as CalibrationFile;
  const model = file.targets['pptx-libreoffice'].firstBaselineModel;
  cached = {
    formula: model.formula,
    anchors: [...model.anchors].sort((a, b) => a.size - b.size),
    ...(model.mono
      ? {
          mono: {
            family: model.mono.family,
            anchors: [...model.mono.anchors].sort((a, b) => a.size - b.size),
          },
        }
      : {}),
  };
  return cached;
}

/** k at a size: linear between the two nearest anchors, the end value beyond the ends. */
export function baselineK(sizePx: number, anchors: readonly BaselineAnchor[]): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) return 0;
  if (sizePx <= first.size) return first.k;
  if (sizePx >= last.size) return last.k;
  for (let i = 1; i < anchors.length; i += 1) {
    const lo = anchors[i - 1];
    const hi = anchors[i];
    if (!lo || !hi) continue;
    if (sizePx <= hi.size) {
      const t = (sizePx - lo.size) / (hi.size - lo.size);
      return lo.k + t * (hi.k - lo.k);
    }
  }
  return last.k;
}

/**
 * How far above the browser's box top the target renderer wants the text box, in sheet px.
 * Positive moves the box up.
 */
export function firstBaselineShiftPx(
  sizePx: number,
  pitchPx: number,
  target: BaselineTarget = DEFAULT_BASELINE,
  model: BaselineModel = loadBaselineModel(),
  mono = false,
): number {
  if (target === 'none') return 0;
  const anchors = mono ? (model.mono?.anchors ?? []) : model.anchors;
  if (anchors.length === 0) return 0;
  return pitchPx / 2 - baselineK(sizePx, anchors) * sizePx;
}
