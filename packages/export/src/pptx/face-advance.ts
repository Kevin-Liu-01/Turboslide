// The off-cut advance of the export faces (calibration.json `faceAdvance`, M5): the exact set is
// cut at the ladder's optical sizes (14 to 26, then Display at 32), and a run whose size is not a
// cut size travels in the nearest face, which LibreOffice renders wider than the browser draws
// InterVariable at that size (`font-optical-sizing: auto`). Measured on the deck: 0.82 percent at
// 27 px and 1.7 percent at 30 px on GT Inter Text 26 Medium. The emitter takes the excess back as
// character spacing over the run (pptx/text.ts). Sizes with no measurement are not corrected.
import { readFileSync } from 'node:fs';

import { calibrationFile } from '../calibration/locate.ts';

type CalibrationFile = {
  targets: {
    'pptx-libreoffice': {
      faceAdvance?: { excess: Record<string, Record<string, { value: number }>> };
    };
  };
};

let cached: Record<string, Record<string, number>> | undefined;

/** The measured excess table: family to size (px, as a string key) to fraction. */
export function loadFaceAdvance(): Record<string, Record<string, number>> {
  if (cached) return cached;
  const file = JSON.parse(readFileSync(calibrationFile(), 'utf8')) as CalibrationFile;
  const table = file.targets['pptx-libreoffice'].faceAdvance?.excess ?? {};
  cached = Object.fromEntries(
    Object.entries(table).map(([family, sizes]) => [
      family,
      Object.fromEntries(Object.entries(sizes).map(([size, entry]) => [size, entry.value])),
    ]),
  );
  return cached;
}

/** The fraction by which LibreOffice renders a run of `family` at `sizePx` wider than the browser; 0 when unmeasured. */
export function faceAdvanceExcess(
  family: string,
  sizePx: number,
  table: Record<string, Record<string, number>> = loadFaceAdvance(),
): number {
  const sizes = table[family];
  if (!sizes) return 0;
  return sizes[String(sizePx)] ?? sizes[String(Math.round(sizePx))] ?? 0;
}
