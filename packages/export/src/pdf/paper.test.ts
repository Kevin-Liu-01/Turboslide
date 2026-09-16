// The paper layout's PDF arithmetic without a browser (gslides-parity SPEC-5 6.2; R08 4.11): the
// gate raster of a paper at two device pixels per sheet pixel, the cell gate's lines, and the
// default page's raster; exportPdf itself runs in gslides-fixture.test.ts with Chromium.
import { describe, expect, it } from 'vitest';

import {
  CELL_GATE,
  PAPER_RASTER_PX_PER_PT,
  PDF_GATE,
  PDF_RASTER,
  paperRaster,
  pdfRaster,
} from './build.ts';

describe('the PDF paper arithmetic', () => {
  it('rasterizes a paper page at two device pixels per sheet pixel', () => {
    expect(PAPER_RASTER_PX_PER_PT).toBeCloseTo(2 / 0.6, 9);
    const letter = paperRaster({ width: 612, height: 792 });
    expect(letter).toEqual({ width: 2040, height: 2640, dpi: 240, scale: 2 });
    const a4 = paperRaster({ width: 841.89, height: 595.28 });
    expect(a4.width).toBe(Math.round(841.89 * (2 / 0.6)));
    expect(a4.height).toBe(Math.round(595.28 * (2 / 0.6)));
  });

  it('keeps the one slide page raster at 2W by 2H and the two gate lines', () => {
    expect(pdfRaster({ width: 1600, height: 900 })).toEqual({
      width: 3200,
      height: 1800,
      dpi: 240,
      scale: 2,
    });
    expect(pdfRaster({ width: 1200, height: 900 })).toEqual({
      width: 2400,
      height: 1800,
      dpi: 240,
      scale: 2,
    });
    expect(PDF_RASTER).toEqual({ width: 3200, height: 1800, dpi: 240, scale: 2 });
    expect(PDF_GATE).toEqual({ threshold: 0.1, target: 0.001, fail: 0.005 });
    expect(CELL_GATE).toEqual({ threshold: 0.1, report: 0.01, fail: 0.05 });
  });
});
