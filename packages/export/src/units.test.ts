import { describe, expect, test } from 'vitest';

import {
  PAGE_EMU,
  PAGE_IN,
  compositeHex,
  lineWidthEmu,
  parseCssColor,
  pxToEmu,
  pxToIn,
  spcOf,
  spcPtsOf,
  szOf,
  transparencyOf,
} from './units.ts';

describe('units (SPEC 8.1; pptx report section 4.1)', () => {
  test('one sheet pixel is 1/120 in, 0.6 pt and 7,620 EMU', () => {
    expect(pxToIn(120)).toBe(1);
    expect(pxToEmu(1)).toBe(7620);
    expect(pxToEmu(1600)).toBe(PAGE_EMU.width);
    expect(pxToEmu(900)).toBe(PAGE_EMU.height);
    expect(PAGE_IN.width * 914_400).toBeCloseTo(PAGE_EMU.width, -1);
  });

  test('the measured attribute values', () => {
    expect(szOf(44)).toBe(2640);
    expect(szOf(22)).toBe(1320);
    expect(szOf(13)).toBe(780);
    expect(spcOf(-1.1)).toBe(-66);
    expect(spcOf(-1.8)).toBe(-108);
    expect(spcOf(0.26)).toBe(16);
    expect(spcPtsOf(33)).toBe(1980);
    expect(spcPtsOf(48.4)).toBe(2904);
    expect(lineWidthEmu(1)).toBe(7620);
  });

  test('colors parse and composite the way tokens.ts does', () => {
    expect(parseCssColor('rgb(7, 7, 7)')).toEqual({ hex: '070707', alpha: 1 });
    expect(parseCssColor('rgba(7, 7, 7, 0.18)')).toEqual({ hex: '070707', alpha: 0.18 });
    expect(parseCssColor('#f2f2f0')).toEqual({ hex: 'F2F2F0', alpha: 1 });
    expect(compositeHex({ hex: '070707', alpha: 0.18 }, 'FFFFFF')).toBe('D2D2D2');
    expect(compositeHex({ hex: 'F2F2F0', alpha: 0.22 }, '070707')).toBe('3B3B3A');
    expect(compositeHex({ hex: '070707', alpha: 0.38 }, 'FFFFFF')).toBe('A1A1A1');
    expect(transparencyOf(0.18)).toBe(82);
  });
});
