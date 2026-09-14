import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILY_WITH_FALLBACK,
  INTER,
  INTER_CSS,
  INTER_FALLBACK,
  INTER_ITALIC,
  fallbackFontFaceCss,
  fontFaceCss,
  inlineFontFaceCss,
  interBytes,
  interItalicBytes,
} from './inter.ts';
import { FONTS_JSON } from './export.ts';

describe('InterVariable', () => {
  it('is the deck’s file, byte for byte', () => {
    const bytes = interBytes();
    expect(bytes.byteLength).toBe(INTER.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER.sha256);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it('has the deck’s descriptor in inter.css, and the italic face beside it (gslides-parity SPEC-2 7.1)', () => {
    const css = readFileSync(INTER_CSS, 'utf8');
    expect(css).toContain("font-family: 'Inter';");
    expect(css).toContain('font-weight: 100 900;');
    expect(css).toContain("url('../assets/InterVariable.woff2') format('woff2')");
    expect(css).toContain('font-style: italic;');
    expect(css).toContain("url('../assets/InterVariable-Italic.woff2') format('woff2')");
    expect(fontFaceCss('x.woff2')).toContain("src: url('x.woff2') format('woff2');");
    expect(fontFaceCss('y.woff2', 'italic')).toContain('font-style: italic;');
    const inlined = inlineFontFaceCss();
    expect(inlined).toMatch(/^@font-face \{[\s\S]*data:font\/woff2;base64,d09GMgABAAAA/);
    expect(inlined.match(/@font-face/g)).toHaveLength(2);
    expect(inlined).toContain('font-style: italic;');
  });

  it('is the italic file of the same release, byte for byte', () => {
    const bytes = interItalicBytes();
    expect(bytes.byteLength).toBe(INTER_ITALIC.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTER_ITALIC.sha256);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(INTER_ITALIC.style).toBe('italic');
    expect(INTER_ITALIC.family).toBe(INTER.family);
  });

  it('ships the metric matched fallback face of gslides-parity SPEC-3 9.2 G1, pinned to the build script', () => {
    // the four descriptors in inter.css equal INTER_FALLBACK and fonts.json `fallback`, which
    // scripts/build-fonts.py computes from InterVariable's tables and the pinned Arial metrics
    const css = readFileSync(INTER_CSS, 'utf8');
    expect(css).toContain("font-family: 'Inter Fallback';");
    expect(css).toContain("src: local('Arial');");
    expect(css).toContain(`size-adjust: ${INTER_FALLBACK.sizeAdjust};`);
    expect(css).toContain(`ascent-override: ${INTER_FALLBACK.ascentOverride};`);
    expect(css).toContain(`descent-override: ${INTER_FALLBACK.descentOverride};`);
    expect(css).toContain(`line-gap-override: ${INTER_FALLBACK.lineGapOverride};`);
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(fallbackFontFaceCss()).toContain(`size-adjust: ${INTER_FALLBACK.sizeAdjust};`);
    expect(FONT_FAMILY_WITH_FALLBACK.startsWith("'Inter', 'Inter Fallback'")).toBe(true);

    const fonts = JSON.parse(readFileSync(FONTS_JSON, 'utf8')) as {
      fallback: typeof INTER_FALLBACK & {
        metrics: {
          inter: {
            unitsPerEm: number;
            ascent: number;
            descent: number;
            lineGap: number;
            avgWidth: number;
          };
          arial: {
            unitsPerEm: number;
            ascent: number;
            descent: number;
            lineGap: number;
            avgWidth: number;
          };
        };
      };
    };
    const { metrics, ...descriptors } = fonts.fallback;
    expect(descriptors).toEqual(INTER_FALLBACK);
    // the arithmetic, recomputed from the recorded metrics (InterVariable 4.001: 2048 upm, ascent
    // 1984, descent -494, line gap 0; Arial: 2048 upm, ascent 1854, descent -434, line gap 67)
    expect(metrics.inter).toMatchObject({
      unitsPerEm: 2048,
      ascent: 1984,
      descent: -494,
      lineGap: 0,
    });
    expect(metrics.arial).toMatchObject({
      unitsPerEm: 2048,
      ascent: 1854,
      descent: -434,
      lineGap: 67,
    });
    const sizeAdjust =
      metrics.inter.avgWidth /
      metrics.inter.unitsPerEm /
      (metrics.arial.avgWidth / metrics.arial.unitsPerEm);
    // four decimals with the trailing zeros dropped, the form build-fonts.py writes and prettier keeps
    const percent = (value: number): string =>
      `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0'}%`;
    expect(percent(sizeAdjust)).toBe(INTER_FALLBACK.sizeAdjust);
    expect(percent(metrics.inter.ascent / 2048 / sizeAdjust)).toBe(INTER_FALLBACK.ascentOverride);
    expect(percent(-metrics.inter.descent / 2048 / sizeAdjust)).toBe(
      INTER_FALLBACK.descentOverride,
    );
    expect(percent(metrics.inter.lineGap / 2048 / sizeAdjust)).toBe(INTER_FALLBACK.lineGapOverride);
    // the fallback's line box equals Inter's: (ascent + descent + gap) per em times size-adjust
    const interBox = (metrics.inter.ascent - metrics.inter.descent + metrics.inter.lineGap) / 2048;
    const fallbackBox =
      (metrics.inter.ascent / 2048 / sizeAdjust + -metrics.inter.descent / 2048 / sizeAdjust) *
      sizeAdjust;
    expect(Math.abs(interBox - fallbackBox)).toBeLessThan(1e-9);
  });
});
