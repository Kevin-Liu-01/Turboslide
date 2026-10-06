// The off-cut advance of the export faces, taken back as character spacing over the run
// (pptx/text.ts). Two sources, one table:
// - the standard set (docs/DESIGN.md 4.3): Inter and Inter Medium are the opsz 14 design, wider than
//   the browser draws InterVariable at a larger size (`font-optical-sizing: auto`); fonts.json
//   `spacing` holds the difference per whole pixel size from 15 to 43, computed from the font by
//   scripts/build-fonts.py (2.0 percent at 18 px, 4.1 at 22, 6.2 at 26 for Inter);
// - the exact set (calibration.json `faceAdvance`, M5): a run whose size is not a cut size travels
//   in the nearest cut, which LibreOffice renders wider; measured on the deck, 0.82 percent at
//   27 px and 1.7 percent at 30 px on Inter Text 26 Medium. A measurement wins over the computed
//   share for the same family and size.
// Sizes in neither source are not corrected.
import { readFileSync } from 'node:fs';

import { calibrationFile } from '../calibration/locate.ts';
import { loadFontsCatalog } from './fonts-map.ts';

type CalibrationFile = {
  targets: {
    'pptx-libreoffice': {
      faceAdvance?: { excess: Record<string, Record<string, { value: number }>> };
    };
  };
};

let cached: Record<string, Record<string, number>> | undefined;

/** The excess table: family to size (px, as a string key) to fraction, both sources merged. */
export function loadFaceAdvance(): Record<string, Record<string, number>> {
  if (cached) return cached;
  const file = JSON.parse(readFileSync(calibrationFile(), 'utf8')) as CalibrationFile;
  const measured = file.targets['pptx-libreoffice'].faceAdvance?.excess ?? {};
  const table: Record<string, Record<string, number>> = {};
  for (const [family, sizes] of Object.entries(loadFontsCatalog().spacing))
    table[family] = { ...sizes };
  for (const [family, sizes] of Object.entries(measured))
    table[family] = {
      ...table[family],
      ...Object.fromEntries(Object.entries(sizes).map(([size, entry]) => [size, entry.value])),
    };
  cached = table;
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
